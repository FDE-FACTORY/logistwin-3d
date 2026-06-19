import { OrderType, OrderStatus } from './order.js';
import { CommandType, Op } from './task.js';

/**
 * 크레인 상태(마스터 플랜의 4단계 상태 머신).
 *   대기(IDLE) → 이동(TRAVELING) → 적재/추출(HANDLING) → 복귀(RETURNING) → 대기
 */
export const CraneState = Object.freeze({
  IDLE: 'IDLE',
  TRAVELING: 'TRAVELING',
  HANDLING: 'HANDLING',
  RETURNING: 'RETURNING',
});

/**
 * Crane — 단일 통로를 담당하는 스태커 크레인의 틱 구동 상태 머신.
 *
 * 작업(Task)을 받아 이동/포크 **스텝 플랜**으로 컴파일한 뒤 한 스텝씩 실행합니다.
 * 이 일반화 덕분에 Single Command(적재 또는 추출)와 Dual Command(적재→추출 연계)를
 * 동일한 실행기로 처리합니다.
 *
 *   SINGLE store    : 홈 →이동→ 셀 →적재→ 홈복귀
 *   SINGLE retrieve : 홈 →이동→ 셀 →추출→ 홈복귀
 *   DUAL            : 홈 →이동→ 적재셀 →적재→ 이동→ 추출셀 →추출→ 홈복귀
 *
 * 이동 시간은 수평·수직 동시 구동(체비쇼프) 모델, 이동거리는 수평/수직을 분리 누적하여
 * Phase 2 ESG 전력 환산의 입력이 됩니다.
 */
export class Crane {
  /**
   * @param {object} p
   * @param {string} p.id
   * @param {number} p.aisle 담당 통로
   * @param {object} p.cellSize warehouseConfig.cellSize
   * @param {object} p.craneConfig craneConfig
   * @param {import('./warehouse.js').Warehouse} p.warehouse
   * @param {object} [p.hooks] { onTravel(seg), onComplete(order, info), onAssign }
   */
  constructor({ id, aisle, cellSize, craneConfig, warehouse, hooks = {} }) {
    this.id = id;
    this.aisle = aisle;
    this.cs = cellSize;
    this.cfg = craneConfig;
    this.warehouse = warehouse;
    this.hooks = hooks;

    this.state = CraneState.IDLE;
    this.queue = []; // Task[]
    this.task = null;
    this.plan = null; // 컴파일된 스텝 배열
    this.step = -1;

    // 현재 위치 (베이 x, 층 z) — 홈에서 시작.
    this.x = craneConfig.homeX;
    this.z = craneConfig.homeZ;
    this.timer = 0; // 현재 스텝 잔여 틱
    this._moveTicks = 0; // 현재 이동 스텝의 총 소요 틱 (보간용)
    this._destX = this.x;
    this._destZ = this.z;

    // 통계
    this.commandsCompleted = 0; // 처리한 주문(leg) 수
    this.singleCycles = 0;
    this.dualCycles = 0;
    this.travelMeters = 0; // 누적 총 이동거리(m)
    this.travelH = 0; // 누적 수평 이동(m)
    this.travelV = 0; // 누적 수직 이동(m)
    this.busyTicks = 0; // 작업 수행 틱 수 (가동률)
    this._taskTravel = 0; // 현재 작업 누적 이동(m)
  }

  /** 새 작업 없이 대기 중인가. */
  get isIdle() {
    return this.state === CraneState.IDLE && !this.task;
  }

  /** 작업 배정. */
  enqueue(task) {
    this.queue.push(task);
  }

  /** 두 지점 간 이동(시간 초, 거리 m, 수평/수직 분리) — 동시 구동(체비쇼프). */
  _travel(fromX, fromZ, toX, toZ) {
    const h = Math.abs(toX - fromX) * this.cs.width;
    const v = Math.abs(toZ - fromZ) * this.cs.height;
    const t = Math.max(h / this.cfg.horizontalSpeed, v / this.cfg.verticalSpeed);
    return { h, v, meters: h + v, t };
  }

  /** Task → 이동/포크 스텝 플랜. */
  _compile(task) {
    const plan = [];
    for (const leg of task.legs) {
      plan.push({ kind: 'MOVE', x: leg.cell.x, z: leg.cell.z, state: CraneState.TRAVELING });
      plan.push({ kind: 'HANDLE', op: leg.op, cell: leg.cell, order: leg.order });
    }
    plan.push({ kind: 'MOVE', x: this.cfg.homeX, z: this.cfg.homeZ, state: CraneState.RETURNING });
    return plan;
  }

  /** 매 틱 호출 — 스텝 진행/전이. */
  tick() {
    // 대기 중이면 다음 작업 시작.
    if (this.state === CraneState.IDLE) {
      if (this.queue.length === 0) return;
      this.task = this.queue.shift();
      this.plan = this._compile(this.task);
      this._taskTravel = 0;
      for (const leg of this.task.legs) leg.order.status = OrderStatus.ASSIGNED;
      this.step = 0;
      this._beginStep();
      this.busyTicks += 1;
      return;
    }

    this.busyTicks += 1;
    this.timer -= 1;
    if (this.timer > 0) return;

    this._finishStep();
    this.step += 1;
    if (this.step >= this.plan.length) {
      this._completeTask();
      return;
    }
    this._beginStep();
  }

  /** 현재 스텝 진입 — 타이머/거리 설정. */
  _beginStep() {
    const s = this.plan[this.step];
    if (s.kind === 'MOVE') {
      const seg = this._travel(this.x, this.z, s.x, s.z);
      this._destX = s.x;
      this._destZ = s.z;
      this._accrue(seg);
      this.state = s.state;
      this.timer = Math.max(1, Math.ceil(seg.t)); // 틱(가상초) 단위
      this._moveTicks = this.timer;
    } else {
      // HANDLE — 포크 적재/추출
      this.state = CraneState.HANDLING;
      this.timer = this.cfg.forkTimeSec;
    }
  }

  /** 현재 스텝 완료 처리. */
  _finishStep() {
    const s = this.plan[this.step];
    if (s.kind === 'MOVE') {
      this.x = this._destX;
      this.z = this._destZ;
    } else if (s.op === Op.STORE) {
      this.warehouse.store(s.cell, {
        sku: s.order.sku,
        grade: s.order.grade,
        quantity: s.order.quantity,
        storedAt: s.order.createdAt,
      });
      this.hooks.onHandle?.(s.order, s.cell, s.op);
    } else {
      this.warehouse.retrieve(s.cell);
      this.hooks.onHandle?.(s.order, s.cell, s.op);
    }
  }

  /** 작업 완료 — 통계 갱신 + 완료 콜백(주문별). */
  _completeTask() {
    this.state = CraneState.IDLE;
    if (this.task.type === CommandType.DUAL) this.dualCycles += 1;
    else this.singleCycles += 1;
    this.commandsCompleted += this.task.legs.length;

    for (const leg of this.task.legs) {
      this.hooks.onComplete?.(leg.order, {
        craneId: this.id,
        cellId: leg.cell.id,
        cycle: this.task.type,
        travel: this._taskTravel,
      });
    }
    this.task = null;
    this.plan = null;
  }

  /**
   * 프론트 3D 렌더용 상태 — 이동 중에는 보간된 부동소수 좌표(베이 x, 층 z)를 반환.
   * (틱마다 이 값을 브로드캐스트하면 프론트가 프레임 간 트윈으로 부드럽게 표현)
   */
  renderState() {
    let x = this.x;
    let z = this.z;
    let carrying = false;
    if ((this.state === CraneState.TRAVELING || this.state === CraneState.RETURNING) && this.plan) {
      const total = this._moveTicks || 1;
      const p = Math.min(1, Math.max(0, (total - this.timer) / total));
      x = this.x + (this._destX - this.x) * p;
      z = this.z + (this._destZ - this.z) * p;
      carrying = this._carryingAtMove(this.step);
    } else if (this.state === CraneState.HANDLING) {
      carrying = true;
    }
    return {
      id: this.id,
      aisle: this.aisle,
      x: Number(x.toFixed(3)),
      z: Number(z.toFixed(3)),
      state: this.state,
      carrying,
      cycle: this.task?.type ?? null,
    };
  }

  /** 이동 스텝에서 팔레트 적재 여부(시각화용). */
  _carryingAtMove(i) {
    const next = this.plan[i + 1];
    if (next && next.kind === 'HANDLE') return next.op === Op.STORE; // 적재하러 감(적재물 보유) vs 추출하러 감(빈손)
    const prev = this.plan[i - 1]; // 마지막 복귀 이동
    return !!(prev && prev.kind === 'HANDLE' && prev.op === Op.RETRIEVE); // 추출물 들고 귀환
  }

  /** 이동거리 누적 + onTravel 훅. */
  _accrue(seg) {
    this._taskTravel += seg.meters;
    this.travelMeters += seg.meters;
    this.travelH += seg.h;
    this.travelV += seg.v;
    this.hooks.onTravel?.(seg);
  }
}
