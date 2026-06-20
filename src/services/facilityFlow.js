/**
 * 물류센터 내부 물류 흐름(Material Flow) 시뮬레이터 — 대형 DC 기준.
 *
 *   크레인 출고 완료 → 통로 앞 P&D 적재
 *     → 출고 컨베이어가 전면 레인을 따라 출하 도크 스테이징으로 이송(끊김 없는 흐름)
 *     → 지게차가 스테이징에서 트럭으로 상차
 *     → 도크에 후진 정차한 트럭이 만재 시 전진 출발(배송)
 *   입고 도크: 트럭이 후진 입차 → 하차 → 출차.
 *
 * 좌표는 창고 로컬(미터). 도크는 -X 외벽에 여러 개(다중 도크), 트럭은 외벽 밖에서 후진 입차.
 */
const r2 = (n) => Math.round(n * 100) / 100;
const GRADES = ['A', 'B', 'C'];

export class FacilityFlow {
  constructor(config, { truckCapacity = 8 } = {}) {
    this.cfg = config;
    const cs = config.cellSize;
    this.extentZ = (config.aisles - 1) * config.aisleSpacing + cs.depth;

    this.laneX = -2.8; // 전면 출고 컨베이어(메인 라인)
    this.stagingX = -9.5; // 도크 내부 스테이징
    this.wallX = -12.5; // 도크 외벽(트레일러 후면이 붙는 위치)
    this.pndX = -0.6; // 통로 앞 P&D(크레인 인출 지점, 컨베이어 진입부)
    this.truckDockedX = this.wallX + 0.8; // 트레일러 후면이 도크 도어에 밀착(약간 안쪽)
    this.truckArriveX = this.wallX - 26; // 입차 시작(후진)
    this.truckGoneX = this.wallX - 40; // 출차 종료(전진)

    // 다중 도크 — 트럭 폭(≈3.2m) 간격으로 배치, 절반은 입고/절반 출하.
    const span = this.extentZ - 1.5;
    const N = Math.max(3, Math.min(8, Math.floor(span / 3.2) + 1));
    const inboundN = Math.max(1, Math.floor(N * 0.4));
    this.docks = Array.from({ length: N }, (_, i) => {
      const z = 1.5 + (N === 1 ? 0 : (span / Math.max(1, N - 1)) * i);
      const kind = i < inboundN ? 'in' : 'out';
      return {
        id: `${kind === 'in' ? 'R' : 'S'}${i + 1}`, // R=Receiving, S=Shipping
        z: r2(z),
        kind,
        staged: 0,
        truck: { state: 'gone', x: this.truckGoneX, loaded: 0, t: 0, gap: 20 + ((i * 13) % 40) },
      };
    });
    this.outDocks = this.docks.filter((d) => d.kind === 'out');
    this.inDocks = this.docks.filter((d) => d.kind === 'in');

    this.pnd = new Array(config.aisles).fill(0); // 통로별 P&D 대기 수(크레인이 내려놓음)
    this.truckCapacity = truckCapacity;

    // 출고 컨베이어를 타고 이동 중인 팔레트.
    this.items = [];
    this._itemSeq = 0;
    this.conveyorSpeed = 0.9;
    this.maxItems = 80;
    this.stagingCap = 9; // 스테이징 적치 한도

    this.delivered = 0;
    this.received = 0;
    this.loadedTotal = 0;
  }

  aisleZ(aisle) {
    return (aisle - 1) * this.cfg.aisleSpacing + this.cfg.cellSize.depth / 2;
  }

  onOutbound(aisle) {
    if (aisle >= 1 && aisle <= this.cfg.aisles) this.pnd[aisle - 1] += 1;
  }

  /** 출고 컨베이어 목적 도크 선택 — 정차 트럭이 있고 여유 있는 출하 도크, 없으면 가장 가까운 곳. */
  _targetDock(az) {
    if (this.outDocks.length === 0) return null;
    let target = this.outDocks.find((d) => d.truck.state === 'docked' && d.staged < this.truckCapacity);
    if (!target) {
      target = this.outDocks.reduce(
        (m, d) => (Math.abs(d.z - az) < Math.abs(m.z - az) ? d : m),
        this.outDocks[0],
      );
    }
    return target;
  }

  /** P&D 대기 팔레트를 컨베이어에 투입 + 컨베이어 위 팔레트 전진. */
  _tickConveyor() {
    // 1) 투입 — 진입부가 비어 있으면 P&D에서 한 팔레트를 컨베이어로.
    for (let a = 0; a < this.pnd.length; a++) {
      if (this.pnd[a] <= 0 || this.items.length >= this.maxItems) continue;
      const az = this.aisleZ(a + 1);
      // 같은 통로 진입부 근처(스퍼)가 비어 있어야 투입(간격 유지).
      const busy = this.items.some(
        (it) => it.seg <= 1 && it.aisle === a + 1 && Math.hypot(it.x - this.pndX, it.z - az) < 1.4,
      );
      if (busy) continue;
      const target = this._targetDock(az);
      if (!target) continue;
      this.pnd[a] -= 1;
      this._itemSeq += 1;
      this.items.push({
        id: `PLT-${this._itemSeq}`,
        aisle: a + 1,
        grade: GRADES[this._itemSeq % 3],
        x: this.pndX,
        z: az,
        seg: 0,
        wps: [
          { x: this.laneX, z: az }, // 스퍼 → 메인 라인 합류
          { x: this.laneX, z: target.z }, // 메인 라인 주행(도크 z로)
          { x: this.stagingX, z: target.z }, // 스테이징 진입
        ],
        target,
      });
    }

    // 2) 전진.
    for (const it of this.items) {
      const wp = it.wps[it.seg];
      const dx = wp.x - it.x;
      const dz = wp.z - it.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= this.conveyorSpeed) {
        it.x = wp.x;
        it.z = wp.z;
        it.seg += 1;
        if (it.seg >= it.wps.length) {
          // 스테이징 도착 — 적치(한도 내).
          if (it.target.staged < this.stagingCap) it.target.staged += 1;
          it._done = true;
        }
      } else {
        it.x += (dx / dist) * this.conveyorSpeed;
        it.z += (dz / dist) * this.conveyorSpeed;
      }
    }
    this.items = this.items.filter((it) => !it._done);
  }

  _tickTruck(dock) {
    const t = dock.truck;
    const backSpeed = 1.6;
    if (t.state === 'gone') {
      t.gap -= 1;
      const demand = dock.kind === 'out' ? dock.staged > 0 || t.loaded > 0 : t.gap <= 0;
      if (t.gap <= 0 && (dock.kind === 'in' || demand)) {
        t.state = 'arriving';
        t.x = this.truckArriveX;
      } else if (t.gap < -200) {
        t.gap = 10;
      }
    } else if (t.state === 'arriving') {
      t.x = Math.min(this.truckDockedX, t.x + backSpeed); // 후진 입차(레어가 벽쪽으로)
      if (t.x >= this.truckDockedX - 0.01) {
        t.x = this.truckDockedX;
        t.state = 'docked';
        t.t = 0;
        t.loaded = dock.kind === 'in' ? this.truckCapacity : 0; // 입고는 만재로 도착
      }
    } else if (t.state === 'docked') {
      t.t += 1;
      if (dock.kind === 'out') {
        // 지게차 상차 — 스테이징에서 한 팔레트씩 트럭으로.
        if (dock.staged > 0 && t.loaded < this.truckCapacity && t.t % 4 === 0) {
          dock.staged -= 1;
          t.loaded += 1;
          this.loadedTotal += 1;
        }
        if (t.loaded >= this.truckCapacity) t.state = 'departing';
      } else {
        if (t.loaded > 0 && t.t % 3 === 0) t.loaded -= 1;
        if (t.loaded <= 0 && t.t > 12) {
          this.received += 1;
          t.state = 'departing';
        }
      }
    } else if (t.state === 'departing') {
      t.x -= backSpeed * 1.2; // 전진 출차
      if (t.x <= this.truckGoneX) {
        if (dock.kind === 'out') this.delivered += 1;
        t.state = 'gone';
        t.x = this.truckGoneX;
        t.loaded = 0;
        t.t = 0;
        t.gap = 24;
      }
    }
  }

  tick() {
    this._tickConveyor();
    for (const d of this.docks) this._tickTruck(d);
  }

  snapshot() {
    return {
      building: {
        wallX: this.wallX,
        stagingX: this.stagingX,
        laneX: this.laneX,
        pndX: this.pndX,
        z0: -2,
        z1: this.extentZ + 2,
        rackW: this.cfg.baysPerSide * this.cfg.cellSize.width,
        height: this.cfg.levels * this.cfg.cellSize.height + 2.5,
      },
      docks: this.docks.map((d) => ({
        id: d.id,
        z: d.z,
        kind: d.kind,
        staged: d.staged,
        truck: { state: d.truck.state, x: r2(d.truck.x), loaded: d.truck.loaded, capacity: this.truckCapacity },
      })),
      conveyor: this.items.map((it) => ({ id: it.id, x: r2(it.x), z: r2(it.z), grade: it.grade })),
      pnd: this.pnd.map((q, i) => ({ aisle: i + 1, q })),
      metrics: { delivered: this.delivered, received: this.received, loadedTotal: this.loadedTotal },
    };
  }
}
