/**
 * 물류센터 내부 물류 흐름(Material Flow) 시뮬레이터.
 *
 * 보관(AS/RS) 바깥의 동선을 모델링해 "물건 정리"가 아닌 **입고→보관→반송→출하→배송**의
 * 전체 흐름을 표현합니다.
 *
 *   크레인 출고 완료 → 통로 앞 P&D(Pick&Deposit) 적재
 *     → AGV(로봇 대차)가 전면 레인을 따라 출하 도크로 운반
 *     → 도크 스테이징 → 트럭 적재 → 만재 시 출발(배송)
 *
 * 좌표는 창고 로컬(미터) — 프론트가 셀/크레인과 동일 좌표계로 렌더합니다.
 */
const r2 = (n) => Math.round(n * 100) / 100;

export class FacilityFlow {
  constructor(config, { agvCount = 3, truckCapacity = 6 } = {}) {
    this.cfg = config;
    const cs = config.cellSize;
    this.extentZ = (config.aisles - 1) * config.aisleSpacing + cs.depth;
    this.laneX = -2.2; // 전면 반송 레인 (bay 0 앞)
    this.dockX = -5.0; // 출하 도크 위치
    this.outDockZ = this.extentZ + 3.5; // 출하 도크 (마지막 통로 너머)
    this.inDockZ = -3.5; // 입고 도크 (첫 통로 앞)
    this.truckCapacity = truckCapacity;

    this.pnd = new Array(config.aisles).fill(0); // 통로별 출고 대기 팔레트
    this.agvs = Array.from({ length: agvCount }, (_, i) => ({
      id: `AGV-${String(i + 1).padStart(2, '0')}`,
      x: this.dockX,
      z: this.outDockZ - i * 1.6,
      carrying: false,
      state: 'idle',
      route: null,
      seg: 0,
    }));
    this.agvSpeed = 1.3; // m/틱

    this.outDock = { staged: 0, truck: { state: 'docked', loaded: 0, t: 0, departT: 0 } };
    this.delivered = 0;
    this.loadedTotal = 0;
  }

  aisleZ(aisle) {
    return (aisle - 1) * this.cfg.aisleSpacing + this.cfg.cellSize.depth / 2;
  }

  /** 출고 완료 → 해당 통로 P&D에 팔레트 적재. */
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
    this.pnd[best] -= 1;
    const az = this.aisleZ(best + 1);
    agv.route = [
      { x: this.laneX, z: agv.z }, // 레인 진입
      { x: this.laneX, z: az }, // 레인 따라 통로로
      { x: 0, z: az, pick: true }, // P&D 픽업
      { x: this.laneX, z: az }, // 레인 복귀
      { x: this.laneX, z: this.outDockZ }, // 레인 따라 도크로
      { x: this.dockX, z: this.outDockZ, drop: true }, // 도크 하역
    ];
    agv.seg = 0;
    agv.state = 'toPick';
    return true;
  }

  tick() {
    for (const agv of this.agvs) {
      if (!agv.route && !this._assign(agv)) continue;
      const to = agv.route[agv.seg];
      const dx = to.x - agv.x;
      const dz = to.z - agv.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= this.agvSpeed) {
        agv.x = to.x;
        agv.z = to.z;
        if (to.pick) agv.carrying = true;
        if (to.drop) {
          agv.carrying = false;
          this.outDock.staged += 1;
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

    // 출하 트럭 적재/출발 사이클
    const t = this.outDock.truck;
    if (t.state === 'docked') {
      if (this.outDock.staged > 0 && t.loaded < this.truckCapacity) {
        t.t += 1;
        if (t.t >= 2) {
          t.t = 0;
          this.outDock.staged -= 1;
          t.loaded += 1;
          this.loadedTotal += 1;
        }
      }
      if (t.loaded >= this.truckCapacity) {
        t.state = 'departing';
        t.departT = 0;
      }
    } else if (t.state === 'departing') {
      t.departT += 1;
      if (t.departT >= 16) {
        this.delivered += 1;
        t.state = 'docked';
        t.loaded = 0;
        t.t = 0;
        t.departT = 0;
      }
    }
  }

  snapshot() {
    const t = this.outDock.truck;
    return {
      lane: { x: this.laneX, z0: -1, z1: this.extentZ + 1 },
      outDock: { x: this.dockX, z: r2(this.outDockZ) },
      inDock: { x: this.dockX, z: r2(this.inDockZ) },
      agvs: this.agvs.map((a) => ({ id: a.id, x: r2(a.x), z: r2(a.z), carrying: a.carrying, state: a.state })),
      staged: this.outDock.staged,
      truck: { state: t.state, loaded: t.loaded, capacity: this.truckCapacity, departProgress: r2(t.departT / 16) },
      delivered: this.delivered,
      loadedTotal: this.loadedTotal,
      pnd: this.pnd.map((q, i) => ({ aisle: i + 1, q })),
    };
  }
}
