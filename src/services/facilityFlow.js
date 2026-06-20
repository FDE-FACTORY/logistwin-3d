/**
 * 물류센터 내부 물류 흐름(Material Flow) 시뮬레이터 — 대형 DC 기준.
 *
 *   크레인 출고 완료 → 통로 앞 P&D 적재
 *     → AGV(로봇 대차)가 진행 방향으로 전면 레인을 따라 출하 도크 스테이징으로 운반
 *     → 도크에 후진 정차한 트럭이 후방 상차 → 만재 시 전진 출발(배송)
 *   입고 도크: 트럭이 후진 입차 → 하차 → 출차.
 *
 * 좌표는 창고 로컬(미터). 도크는 -X 외벽에 여러 개(다중 도크), 트럭은 외벽 밖에서 후진 입차.
 */
const r2 = (n) => Math.round(n * 100) / 100;

export class FacilityFlow {
  constructor(config, { agvCount = 4, truckCapacity = 8 } = {}) {
    this.cfg = config;
    const cs = config.cellSize;
    this.extentZ = (config.aisles - 1) * config.aisleSpacing + cs.depth;

    this.laneX = -2.8; // 전면 반송 레인
    this.stagingX = -9.5; // 도크 내부 스테이징
    this.wallX = -12.5; // 도크 외벽(트레일러 후면이 붙는 위치)
    this.truckDockedX = this.wallX - 0.3; // 트레일러 후면 위치
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

    this.pnd = new Array(config.aisles).fill(0);
    this.truckCapacity = truckCapacity;
    this.agvs = Array.from({ length: agvCount }, (_, i) => ({
      id: `AGV-${String(i + 1).padStart(2, '0')}`,
      x: this.stagingX,
      z: 2 + i * 2.0,
      heading: 0,
      carrying: false,
      state: 'idle',
      route: null,
      seg: 0,
    }));
    this.agvSpeed = 1.25;

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

  _assign(agv) {
    let best = -1;
    let bestQ = 0;
    for (let a = 0; a < this.pnd.length; a++) {
      if (this.pnd[a] > bestQ) {
        bestQ = this.pnd[a];
        best = a;
      }
    }
    if (best < 0) return false;
    // 목적 출하 도크 — 정차 트럭이 있고 스테이징이 적은 곳, 없으면 가장 가까운 도크.
    const az = this.aisleZ(best + 1);
    let target = this.outDocks.find((d) => d.truck.state === 'docked' && d.staged < this.truckCapacity);
    if (!target) target = this.outDocks.reduce((m, d) => (Math.abs(d.z - az) < Math.abs(m.z - az) ? d : m), this.outDocks[0]);
    if (!target) return false;
    this.pnd[best] -= 1;
    agv.route = [
      { x: this.laneX, z: agv.z },
      { x: this.laneX, z: az },
      { x: -0.4, z: az, pick: true }, // 통로 앞 P&D
      { x: this.laneX, z: az },
      { x: this.laneX, z: target.z },
      { x: this.stagingX, z: target.z, drop: target }, // 도크 스테이징 하역
    ];
    agv.seg = 0;
    agv.state = 'toPick';
    return true;
  }

  _tickAgvs() {
    for (const agv of this.agvs) {
      if (!agv.route && !this._assign(agv)) continue;
      const to = agv.route[agv.seg];
      const dx = to.x - agv.x;
      const dz = to.z - agv.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001) agv.heading = Math.atan2(dx, dz); // 진행 방향(+X 기준)
      if (dist <= this.agvSpeed) {
        agv.x = to.x;
        agv.z = to.z;
        if (to.pick) agv.carrying = true;
        if (to.drop) {
          agv.carrying = false;
          to.drop.staged += 1;
        }
        agv.seg += 1;
        if (agv.seg >= agv.route.length) {
          agv.route = null;
          agv.state = 'idle';
        }
      } else {
        agv.x += (dx / dist) * this.agvSpeed;
        agv.z += (dz / dist) * this.agvSpeed;
        agv.state = agv.carrying ? 'haul' : 'toPick';
      }
    }
  }

  _tickTruck(dock) {
    const t = dock.truck;
    const backSpeed = 1.6;
    if (t.state === 'gone') {
      t.gap -= 1;
      // 출하: 스테이징 있으면 호출 / 입고: 주기적으로 호출
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
        if (dock.staged > 0 && t.loaded < this.truckCapacity && t.t % 3 === 0) {
          dock.staged -= 1;
          t.loaded += 1;
          this.loadedTotal += 1;
        }
        if (t.loaded >= this.truckCapacity) {
          t.state = 'departing';
        }
      } else {
        // 입고 하차
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
        t.gap = 18 + Math.floor(Math.random() * 0); // 결정론 유지(랜덤 0)
        t.gap = 24;
      }
    }
  }

  tick() {
    this._tickAgvs();
    for (const d of this.docks) this._tickTruck(d);
  }

  snapshot() {
    return {
      building: {
        wallX: this.wallX,
        stagingX: this.stagingX,
        laneX: this.laneX,
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
      agvs: this.agvs.map((a) => ({
        id: a.id,
        x: r2(a.x),
        z: r2(a.z),
        heading: r2(a.heading),
        carrying: a.carrying,
        state: a.state,
      })),
      pnd: this.pnd.map((q, i) => ({ aisle: i + 1, q })),
      metrics: { delivered: this.delivered, received: this.received, loadedTotal: this.loadedTotal },
    };
  }
}
