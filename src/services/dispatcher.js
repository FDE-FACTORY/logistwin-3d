import { Crane } from '../models/crane.js';
import { OrderType, OrderStatus } from '../models/order.js';
import { storeTask, retrieveTask, dualTask } from '../models/task.js';

/** 명령 운영 모드. */
export const CommandMode = Object.freeze({
  SINGLE: 'single', // 단일 명령 — 매 사이클 1건 (공차 복귀)
  DUAL: 'dual', // 복합 명령 — 입고+출고 연계 (공차 주행 최소화)
});

/**
 * Dispatcher — 주문 할당 + 크레인 플릿 오케스트레이터.
 *
 * 통로마다 크레인 1대(표준 AS/RS). 매 틱:
 *   1) 대기 큐의 PENDING 주문을 목적지 셀에 할당하고 해당 통로 크레인에 작업 배정.
 *   2) 모든 크레인 상태 머신을 1틱 전진.
 *
 * **Dual Command 알고리즘 (mode='dual'):**
 *   입고 적재 후 빈손으로 복귀하지 않고, **같은 통로**의 출고 물품 중 적재 셀과
 *   Travel-Between(TB) 거리가 최소인 것을 골라 함께 추출해 귀환한다.
 *   TB 최소화가 DC 절감(= 중복 복귀 제거)을 극대화한다 (Bozer & White, 1984).
 */
export class Dispatcher {
  /**
   * @param {object} p
   * @param {import('../models/warehouse.js').Warehouse} p.warehouse
   * @param {import('../sim/clock.js').SimClock} p.clock
   * @param {object} p.craneConfig
   * @param {string} [p.mode] CommandMode (기본 dual)
   * @param {object} [p.hooks] 크레인 훅 { onTravel, onComplete, onAssign }
   */
  constructor({ warehouse, clock, craneConfig, mode = CommandMode.DUAL, hooks = {}, maxHoldTicks = 25 }) {
    this.warehouse = warehouse;
    this.clock = clock;
    this.mode = mode;
    this.hooks = hooks;
    // 페어링 대기 한도(틱). 이 시간 넘게 짝을 못 찾은 주문은 단일 명령으로 강제 배정(기아 방지).
    this.maxHoldTicks = maxHoldTicks;

    const cs = warehouse.config.cellSize;
    this.cs = cs;
    this.cranes = [];
    for (let a = 1; a <= warehouse.config.aisles; a++) {
      this.cranes.push(
        new Crane({ id: `C${a}`, aisle: a, cellSize: cs, craneConfig, warehouse, hooks }),
      );
    }
    this.craneByAisle = new Map(this.cranes.map((c) => [c.aisle, c]));

    this.queue = null;
    this._onTick = () => this._tick();
  }

  attachQueue(queueRef) {
    this.queue = queueRef;
  }

  start() {
    this.clock.on('tick', this._onTick);
  }

  stop() {
    this.clock.off('tick', this._onTick);
  }

  _tick() {
    this._allocate();
    for (const crane of this.cranes) crane.tick();
  }

  /** 크레인 부하 = 대기 큐 + 진행 중 작업. */
  _load(crane) {
    return crane.queue.length + (crane.isIdle ? 0 : 1);
  }

  /** I/O(홈)로부터의 경로 비용 근사 — 수평+수직 거리(m). */
  _homeCost(cell) {
    return cell.x * this.cs.width + (cell.z - 1) * this.cs.height;
  }

  /** 두 셀 간 Travel-Between 거리(m) — 수평+수직. */
  _between(a, b) {
    return Math.abs(a.x - b.x) * this.cs.width + Math.abs(a.z - b.z) * this.cs.height;
  }

  /** 셀 목록에서 비용 최소 셀. */
  _minBy(cells, costFn) {
    return cells.reduce((m, c) => (costFn(c) < costFn(m) ? c : m));
  }

  _allocate() {
    if (!this.queue || this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    const deferred = [];
    if (this.mode === CommandMode.DUAL) this._allocateDual(batch, deferred);
    else this._allocateSingle(batch, deferred);
    if (deferred.length) this.queue.unshift(...deferred);
  }

  /** 단일 명령 할당 — 모든 주문을 독립 SC 작업으로. */
  _allocateSingle(batch, deferred) {
    for (const order of batch) {
      if (order.type === OrderType.INBOUND) {
        const place = this._pickInbound();
        if (!place) {
          deferred.push(order);
          continue;
        }
        this._assignStore(place.crane, order, place.cell);
      } else {
        const place = this._pickOutbound(order.sku);
        if (!place) {
          deferred.push(order);
          continue;
        }
        this._assignRetrieve(place.crane, order, place.cell);
      }
    }
  }

  /**
   * 복합 명령 할당 — 표준 백로그(큐에 누적된 PENDING 풀)에서 입고×출고를 페어링.
   *   1) PAIR : 같은 통로의 입고/출고를 TB 최소로 짝지어 DUAL 작업 생성.
   *   2) 잔여 : 크레인이 한가하거나(keep-busy) 대기 한도를 넘긴(aging) 주문만 단일 배정.
   *            그 외에는 보류(defer)하여 다음 틱 페어링 기회를 남긴다.
   * 이 dwell 정책 덕분에 부하가 높을 때 혼합 백로그가 형성되어 페어링률이 올라간다.
   */
  _allocateDual(batch, deferred) {
    const tick = this.clock.tick;
    const inbounds = batch.filter((o) => o.type === OrderType.INBOUND);
    const outbounds = batch.filter((o) => o.type === OrderType.OUTBOUND);
    const usedIn = new Set();
    const usedOut = new Set();

    // 1) PAIR pass — 가능한 모든 입고를 같은 통로 출고와 짝짓기.
    for (const inb of inbounds) {
      const pair = this._findPair(inb, outbounds, usedOut);
      if (!pair) continue;
      usedIn.add(inb);
      usedOut.add(pair.outbound);
      this.warehouse.reserve(pair.storeCell);
      this.warehouse.reserve(pair.retrieveCell);
      inb.status = OrderStatus.ASSIGNED;
      inb.target = pair.storeCell.id;
      pair.outbound.status = OrderStatus.ASSIGNED;
      pair.outbound.target = pair.retrieveCell.id;
      pair.crane.enqueue(dualTask(inb, pair.storeCell, pair.outbound, pair.retrieveCell));
      this.hooks.onAssign?.(inb, { crane: pair.crane, cell: pair.storeCell, paired: true });
    }

    // 2) 잔여 — keep-busy 또는 aging이면 단일 배정, 아니면 보류(페어링 대기).
    const leftovers = [
      ...inbounds.filter((o) => !usedIn.has(o)),
      ...outbounds.filter((o) => !usedOut.has(o)),
    ];
    for (const o of leftovers) {
      const place = o.type === OrderType.INBOUND ? this._pickInbound() : this._pickOutbound(o.sku);
      if (!place) {
        deferred.push(o); // 배정 불가(만재/재고없음) → 다음 틱 재시도
        continue;
      }
      const aged = tick - o.simTick >= this.maxHoldTicks;
      const craneFree = this._load(place.crane) === 0;
      if (aged || craneFree) {
        if (o.type === OrderType.INBOUND) this._assignStore(place.crane, o, place.cell);
        else this._assignRetrieve(place.crane, o, place.cell);
      } else {
        deferred.push(o); // 크레인 바쁨 + 대기 여유 → 페어링 위해 보류
      }
    }
  }

  /**
   * 입고 1건과 짝지을 출고를 탐색 (페어 전용, fallback 없음).
   * 부하 적은 통로부터 보며, 그 통로에 빈 셀 + 페어링 가능한 출고가 있으면
   * TB(Travel-Between) 최소 조합을 반환. 어떤 통로도 페어 불가면 null.
   */
  _findPair(inb, outbounds, usedOut) {
    const byLoad = [...this.cranes].sort((a, b) => this._load(a) - this._load(b));
    for (const crane of byLoad) {
      const empties = this.warehouse.emptyCells({ aisle: crane.aisle });
      if (empties.length === 0) continue;
      const storeCell = this._minBy(empties, (c) => this._homeCost(c));

      let best = null;
      for (const out of outbounds) {
        if (usedOut.has(out)) continue;
        const cells = this.warehouse.cellsWithSku(out.sku, { aisle: crane.aisle });
        if (cells.length === 0) continue;
        const rc = this._minBy(cells, (c) => this._between(storeCell, c));
        const tb = this._between(storeCell, rc);
        if (!best || tb < best.tb) best = { outbound: out, retrieveCell: rc, tb };
      }
      if (best) {
        return { crane, storeCell, outbound: best.outbound, retrieveCell: best.retrieveCell };
      }
    }
    return null;
  }

  /** 입고용: 부하 적은 크레인의 통로에서 I/O 최근접 빈 셀. */
  _pickInbound() {
    const byLoad = [...this.cranes].sort((a, b) => this._load(a) - this._load(b));
    for (const crane of byLoad) {
      const cells = this.warehouse.emptyCells({ aisle: crane.aisle });
      if (cells.length === 0) continue;
      return { crane, cell: this._minBy(cells, (c) => this._homeCost(c)) };
    }
    return null;
  }

  /** 출고용: 해당 SKU 재고가 있는 통로 중 부하 적은 크레인, I/O 최근접 셀. */
  _pickOutbound(sku) {
    const cells = this.warehouse.cellsWithSku(sku);
    if (cells.length === 0) return null;
    const aislesWith = new Set(cells.map((c) => c.aisle));
    const crane = [...this.cranes]
      .filter((c) => aislesWith.has(c.aisle))
      .sort((a, b) => this._load(a) - this._load(b))[0];
    const inAisle = cells.filter((c) => c.aisle === crane.aisle);
    return { crane, cell: this._minBy(inAisle, (c) => this._homeCost(c)) };
  }

  _assignStore(crane, order, cell) {
    this.warehouse.reserve(cell);
    order.status = OrderStatus.ASSIGNED;
    order.target = cell.id;
    crane.enqueue(storeTask(order, cell));
    this.hooks.onAssign?.(order, { crane, cell, paired: false });
  }

  _assignRetrieve(crane, order, cell) {
    this.warehouse.reserve(cell);
    order.status = OrderStatus.ASSIGNED;
    order.target = cell.id;
    crane.enqueue(retrieveTask(order, cell));
    this.hooks.onAssign?.(order, { crane, cell, paired: false });
  }

  /** 크레인별 현황 스냅샷. */
  stats() {
    return this.cranes.map((c) => ({
      id: c.id,
      aisle: c.aisle,
      state: c.state,
      queue: c.queue.length,
      done: c.commandsCompleted,
      single: c.singleCycles,
      dual: c.dualCycles,
      travelM: Math.round(c.travelMeters),
      busyTicks: c.busyTicks,
    }));
  }

  /** 플릿 합계(사이클 유형/이동). */
  totals() {
    let single = 0;
    let dual = 0;
    let travelH = 0;
    let travelV = 0;
    let busyTicks = 0;
    for (const c of this.cranes) {
      single += c.singleCycles;
      dual += c.dualCycles;
      travelH += c.travelH;
      travelV += c.travelV;
      busyTicks += c.busyTicks;
    }
    return { single, dual, travelH, travelV, busyTicks, cranes: this.cranes.length };
  }
}
