import { EventEmitter } from 'node:events';
import { createOrder, OrderType } from '../models/order.js';
import { skuById } from '../data/skuMaster.js';
import { createOrderIdFactory } from '../utils/ids.js';

/**
 * OrderGenerator — 디지털 트윈 주문 엔진.
 *
 * SimClock의 'tick'을 구독하여, 매 틱 수요 모델이 만든 주문 의도를 실제 주문으로
 * 확정하고 작업 큐(jobQueue)에 적재한 뒤 'order' 이벤트로 브로드캐스트합니다.
 * (Phase 2에서 콘솔 대신 WebSocket 구독자가 이 이벤트를 받게 됩니다.)
 *
 * 정합성 보장:
 *   OUTBOUND는 현재 재고에 실재하는 SKU만 발행한다. 의도된 SKU가 재고에 없으면
 *   INBOUND로 대체하여, 존재하지 않는 재고를 출고하는 유령 주문을 방지한다.
 *
 * 이벤트:
 *   'order' → order 객체
 */
export class OrderGenerator extends EventEmitter {
  /**
   * @param {object} deps
   * @param {import('../models/warehouse.js').Warehouse} deps.warehouse
   * @param {import('../sim/demandModel.js').DemandModel} deps.demandModel
   * @param {import('../sim/clock.js').SimClock} deps.clock
   * @param {import('../sim/rng.js').Rng} deps.rng
   * @param {string} deps.dateStamp 'YYYYMMDD' (주문 ID용)
   */
  constructor({ warehouse, demandModel, clock, rng, dateStamp }) {
    super();
    this.warehouse = warehouse;
    this.demandModel = demandModel;
    this.clock = clock;
    this.rng = rng;
    this.nextOrderId = createOrderIdFactory(dateStamp);
    this.dateStamp = dateStamp;

    this.jobQueue = [];
    this.totalGenerated = 0;
    this._onTick = (t) => this._handleTick(t);
  }

  /** 클록 tick 구독 시작. */
  start() {
    this.clock.on('tick', this._onTick);
  }

  /** 구독 해제. */
  stop() {
    this.clock.off('tick', this._onTick);
  }

  _handleTick({ tick, virtualMs, hourOfDay }) {
    const intents = this.demandModel.generateForTick(hourOfDay);
    for (const intent of intents) {
      const order = this._materialize(intent, tick, virtualMs);
      if (!order) continue;
      this.jobQueue.push(order);
      this.totalGenerated += 1;
      this.emit('order', order);
    }
  }

  /** 주문 의도 → 정합성 검증된 실제 주문. */
  _materialize(intent, tick, virtualMs) {
    let { type, sku } = intent;

    // OUTBOUND 정합성: 재고에 없으면 INBOUND로 대체.
    if (type === OrderType.OUTBOUND) {
      const inStock = this.warehouse.findCellBySku(sku.sku, this.rng);
      if (!inStock) {
        type = OrderType.INBOUND;
      }
    }

    const quantity = this._quantityFor(sku);
    const createdAt = this._isoFromVirtual(virtualMs);

    return createOrder({
      id: this.nextOrderId(),
      type,
      sku,
      quantity,
      createdAt,
      simTick: tick,
    });
  }

  /** SKU 등급별 표준 팔레트 수량 ± 변동. */
  _quantityFor(sku) {
    const base = skuById[sku.sku]?.unitsPerPallet ?? sku.unitsPerPallet ?? 6;
    const jitter = this.rng.int(-2, 2);
    return Math.max(1, base + jitter);
  }

  /** 가상 시각(ms) → 'YYYY-MM-DDTHH:MM:SS' ISO 문자열 (날짜는 dateStamp 기준). */
  _isoFromVirtual(virtualMs) {
    const totalSec = Math.floor(virtualMs / 1000);
    const h = Math.floor(totalSec / 3600) % 24;
    const m = Math.floor(totalSec / 60) % 60;
    const s = totalSec % 60;
    const p = (n) => String(n).padStart(2, '0');
    const d = this.dateStamp; // YYYYMMDD
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    return `${date}T${p(h)}:${p(m)}:${p(s)}`;
  }
}
