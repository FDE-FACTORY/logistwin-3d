/**
 * LogisTwin 3D — 실시간 WebSocket 서버 (Phase 2 파이프라인).
 *
 * 시뮬레이터 코어를 가동하고, 매 틱 디지털 트윈 상태(크레인 보간 좌표·상태·적재,
 * 셀 점유 변화, 신규/완료 주문, KPI·ESG)를 Socket.io로 브로드캐스트합니다.
 * 프론트(React + R3F)는 'init'으로 정적 레이아웃을 받고 'state'로 매 틱 갱신합니다.
 *
 * 환경변수 (Railway 배포 대응):
 *   PORT          리슨 포트 (기본 3001)
 *   CORS_ORIGIN   허용 오리진 (쉼표 구분, 기본 '*')
 *   SIM_SPEED     배속 (기본 1 = 실시간 1틱/초)
 *   SIM_SEED      시드 (기본 simConfig.seed)
 *   SIM_MODE      single | dual (기본 dual)
 *
 * 실행: npm run serve
 */
import http from 'node:http';
import { Server } from 'socket.io';
import { warehouseConfig } from './config/warehouse.config.js';
import { craneConfig } from './config/crane.config.js';
import { simConfig } from './config/sim.config.js';
import { assembleCore, loadLayoutConfig } from './sim/bootstrap.js';
import { CommandMode } from './services/dispatcher.js';
import { Op } from './models/task.js';
import { OrderType } from './models/order.js';
import { runSlotting } from './services/slotting.js';
import { ExceptionManager } from './services/exceptionManager.js';
import { TmsSimulator } from './services/tmsSimulator.js';
import { FacilityFlow } from './services/facilityFlow.js';
import { Rng } from './sim/rng.js';
import { initDb, recordEvent, closeDb } from './db/db.js';

// ── 설정 ────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || '*').includes(',')
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : process.env.CORS_ORIGIN || '*';
const speed = Number(process.env.SIM_SPEED) || simConfig.speed;
const seed = process.env.SIM_SEED !== undefined ? Number(process.env.SIM_SEED) : simConfig.seed;
const mode = process.env.SIM_MODE === CommandMode.SINGLE ? CommandMode.SINGLE : CommandMode.DUAL;
// 임포트된 평면도 레이아웃 (LAYOUT 환경변수), 없으면 기본 창고.
const layoutPath = process.env.LAYOUT;
const activeConfig = layoutPath ? loadLayoutConfig(layoutPath) : warehouseConfig;
const craneModelId = process.env.SIM_CRANE; // 크레인 제원 선택 (기본 표준형)

// ── 틱 버퍼 (옵저버가 채우고, 브로드캐스트 후 비움) ──────────────
let tickOrders = [];
let tickDone = [];
let tickEvents = []; // 관제 이벤트(토스트): slotting/예외 등
const cellDeltas = new Map();

// 제어용 RNG(예외 주입) — 시뮬 RNG와 분리해 시뮬 결정론 유지.
const controlRng = new Rng((Number(process.env.SIM_SEED ?? simConfig.seed) || 1) + 7919);
const exceptions = new ExceptionManager();
const EXC_EVERY_TICKS = Number(process.env.EXC_EVERY_TICKS) || 220; // 예외 주입 주기
const EXC_MAX_ACTIVE = 2; // 동시 활성 상한(화면 가림 방지)
const EXC_TTL_TICKS = Number(process.env.EXC_TTL_TICKS) || 90; // 자동 해소까지(운영자 조치 수명)

// 크레인 고장 진단 — 가상 장비 결함을 에러코드로 발생시키고 운영자가 복구.
const CRANE_FAULTS = [
  { code: 'E-12', label: '구동축 과부하', hint: '윤활·부하 점검' },
  { code: 'E-23', label: '포크 위치 센서 이상', hint: '센서 정렬·배선 점검' },
  { code: 'E-31', label: '제어 통신 타임아웃', hint: '네트워크·PLC 점검' },
  { code: 'E-44', label: '승강 인버터 경고', hint: '인버터 온도·전류 점검' },
  { code: 'E-52', label: '주행 레일 정렬 편차', hint: '레일·휠 정렬 점검' },
];
const craneFaults = new Map(); // craneId -> { code, label, hint, tick }
const CRANE_FAULT_EVERY = Number(process.env.CRANE_FAULT_EVERY) || 360; // 발생 주기
const CRANE_FAULT_TTL = Number(process.env.CRANE_FAULT_TTL) || 80; // 미조치 시 자동 복구

// TMS(배송 차량) 시뮬레이터 — 시뮬 RNG와 분리.
const tms = new TmsSimulator(new Rng((Number(process.env.SIM_SEED ?? simConfig.seed) || 1) + 4231), {
  count: Number(process.env.TMS_TRUCKS) || 6,
});

// 물류센터 내부 흐름(P&D → AGV → 출하 도크 → 트럭).
const facility = new FacilityFlow(activeConfig, { agvCount: Number(process.env.AGV_COUNT) || 3 });

const slimOrder = (o) => ({ id: o.id, type: o.type, sku: o.sku, grade: o.grade, quantity: o.quantity });

const observers = {
  onOrder: (order) => {
    tickOrders.push(slimOrder(order));
    recordEvent('order', slimOrder(order), order.simTick); // DB(설정 시)
  },
  onComplete: (order, info) => {
    tickDone.push({ id: order.id, type: order.type, crane: info.craneId, cell: info.cellId, cycle: info.cycle });
    recordEvent('done', { id: order.id, type: order.type, crane: info.craneId, cycle: info.cycle }, order.simTick);
    // 출고 완료 → 통로 P&D에 팔레트 적재(물류 흐름 진입)
    if (order.type === OrderType.OUTBOUND) {
      const aisle = parseInt(String(info.craneId).slice(1), 10);
      facility.onOutbound(aisle);
    }
  },
  onHandle: (order, cell, op) => {
    cellDeltas.set(cell.id, {
      id: cell.id,
      occupied: op === Op.STORE,
      sku: op === Op.STORE ? cell.pallet?.sku : undefined,
      grade: op === Op.STORE ? cell.pallet?.grade : undefined,
    });
  },
};

// ── 코어 조립 ───────────────────────────────────────────────────
let core;
try {
  core = assembleCore({ seed, speed, mode, observers, config: activeConfig, craneModel: craneModelId });
} catch (e) {
  console.error(`\n❌ ${e.message}\n`);
  process.exit(1);
}
const { warehouse, clock, generator, dispatcher, kpi, seededCount, craneModel } = core;

// ── HTTP 서버 (헬스체크) ────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        mode,
        tick: clock.tick,
        virtualTime: clock.virtualTime,
        clients: io.engine.clientsCount,
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, { cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] } });

/** 접속 시 1회 전송하는 정적 레이아웃 + 현재 스냅샷. */
function buildInit() {
  return {
    config: { ...activeConfig },
    crane: {
      homeX: craneConfig.homeX,
      homeZ: craneConfig.homeZ,
      count: dispatcher.cranes.length,
      // 선택된 제원 — Phase 3에서 modelRef(glTF)로 실사 모델 로드 + 치수 매핑.
      model: {
        id: craneModel.id,
        name: craneModel.name,
        class: craneModel.class,
        dimensions: craneModel.dimensions,
        modelRef: craneModel.modelRef,
      },
    },
    meta: { seed, speed, mode, startHour: simConfig.startHour, tick: clock.tick, virtualTime: clock.virtualTime, seededCount },
    occupied: warehouse.occupiedCells(),
    cranes: dispatcher.cranes.map((c) => ({ ...c.renderState(), fault: craneFaults.get(c.id) || null })),
    exceptions: exceptions.list(),
    tms: tms.snapshot(clock.hourOfDay),
    facility: facility.snapshot(),
    kpi: kpi.snapshot(generator.jobQueue.length),
  };
}

/** 즉시 패치 브로드캐스트 — 명령 결과를 다음 틱까지 기다리지 않고 바로 반영(저지연). */
function emitPatch(deltas, events) {
  io.emit('patch', {
    cellDeltas: deltas,
    events,
    exceptions: exceptions.list(),
    tick: clock.tick,
    virtualTime: clock.virtualTime,
  });
}

/** 관제 명령(클라이언트 → 서버) 처리. */
function handleCommand(cmd = {}) {
  if (cmd.type === 'SLOTTING') {
    const r = runSlotting(warehouse);
    emitPatch(r.deltas, [
      {
        kind: 'slotting',
        level: 'ok',
        msg: `적재 효율화를 적용했습니다. A급 ${r.moved}개를 출하장 근처로 옮겨 예상 주행 ${r.savedMeters.toLocaleString()}m를 줄였습니다.`,
        tick: clock.tick,
      },
    ]);
  } else if (cmd.type === 'RESOLVE_EXCEPTION' && cmd.id) {
    const exc = exceptions.resolve(cmd.id, warehouse);
    if (exc) {
      const cell = warehouse.byId.get(exc.cellId);
      const deltas = cell
        ? [{ id: exc.cellId, occupied: cell.occupied, sku: cell.pallet?.sku, grade: cell.pallet?.grade }]
        : [];
      emitPatch(deltas, [
        { kind: 'exception-resolved', level: 'ok', msg: `${exc.label} 예외를 처리했습니다 (${exc.cellId}).`, tick: clock.tick },
      ]);
    }
  } else if (cmd.type === 'RESOLVE_CRANE_FAULT' && cmd.id) {
    const f = craneFaults.get(cmd.id);
    if (f) {
      craneFaults.delete(cmd.id);
      io.emit('patch', {
        cellDeltas: [],
        events: [{ kind: 'crane_fault', level: 'ok', msg: `${cmd.id} 크레인 ${f.code} 고장을 복구했습니다.`, tick: clock.tick }],
        exceptions: exceptions.list(),
        tick: clock.tick,
        virtualTime: clock.virtualTime,
      });
    }
  } else if (cmd.type === 'SET_CONSENT') {
    tms.setConsentGlobal(cmd.value);
    io.emit('patch', {
      cellDeltas: [],
      events: [
        {
          kind: 'compliance',
          level: cmd.value ? 'ok' : 'alarm',
          msg: cmd.value ? '위치 수집 동의가 적용되어 배송 위치를 표시합니다.' : '위치 수집 동의가 해제되어 배송 위치를 마스킹합니다.',
          tick: clock.tick,
        },
      ],
      exceptions: exceptions.list(),
      tick: clock.tick,
      virtualTime: clock.virtualTime,
    });
  }
}

io.on('connection', (socket) => {
  socket.emit('init', buildInit());
  console.log(`🔌 클라이언트 접속: ${socket.id} (총 ${io.engine.clientsCount})`);
  socket.on('command', handleCommand);
  socket.on('disconnect', () => console.log(`❌ 접속 해제: ${socket.id} (총 ${io.engine.clientsCount})`));
});

// ── 가동 + 매 틱 브로드캐스트 (디스패처 이후 등록 → 처리 결과 반영) ─
generator.start();
dispatcher.start();
clock.on('tick', ({ tick, virtualTime, hourOfDay }) => {
  // 주기적 예외 주입 (활성 수 제한).
  if (tick % EXC_EVERY_TICKS === 0 && exceptions.count < EXC_MAX_ACTIVE) {
    const exc = exceptions.inject(warehouse, controlRng, tick);
    if (exc) {
      cellDeltas.set(exc.cellId, { id: exc.cellId, occupied: true, exception: true });
      tickEvents.push({ kind: 'exception', level: 'alarm', msg: `${exc.cellId}에서 ${exc.label} 예외가 발생했습니다.`, tick });
      recordEvent('exception', exc, tick);
    }
  }
  // 자동 해소 — 일정 시간 지난 예외는 운영자 조치 완료로 클리어(경보 누적 방지).
  for (const exc of exceptions.autoResolve(warehouse, tick, EXC_TTL_TICKS)) {
    cellDeltas.set(exc.cellId, { id: exc.cellId, occupied: true, exception: false });
    tickEvents.push({ kind: 'exception', level: 'info', msg: `${exc.cellId} ${exc.label} 예외가 조치 완료되었습니다.`, tick });
  }

  // 크레인 고장 진단 — 주기적 결함 발생(에러코드) + 미조치 시 자동 복구.
  if (tick % CRANE_FAULT_EVERY === 0 && craneFaults.size < 1) {
    const c = controlRng.pick(dispatcher.cranes);
    if (c && !craneFaults.has(c.id)) {
      const spec = controlRng.pick(CRANE_FAULTS);
      craneFaults.set(c.id, { code: spec.code, label: spec.label, hint: spec.hint, tick });
      tickEvents.push({ kind: 'crane_fault', level: 'alarm', msg: `${c.id} 크레인 고장 발생 — ${spec.code} ${spec.label}`, tick });
    }
  }
  for (const [id, f] of [...craneFaults]) {
    if (tick - f.tick >= CRANE_FAULT_TTL) {
      craneFaults.delete(id);
      tickEvents.push({ kind: 'crane_fault', level: 'info', msg: `${id} 크레인 ${f.code} 복구 완료(자동).`, tick });
    }
  }

  tms.tick();
  facility.tick();

  io.emit('state', {
    tick,
    virtualTime,
    hourOfDay,
    cranes: dispatcher.cranes.map((c) => ({ ...c.renderState(), fault: craneFaults.get(c.id) || null })),
    cellDeltas: [...cellDeltas.values()],
    orders: tickOrders,
    done: tickDone,
    events: tickEvents,
    exceptions: exceptions.list(),
    tms: tms.snapshot(hourOfDay),
    facility: facility.snapshot(),
    cycles: dispatcher.totals(),
    kpi: kpi.snapshot(generator.jobQueue.length),
  });
  tickOrders = [];
  tickDone = [];
  tickEvents = [];
  cellDeltas.clear();
});
clock.start();

// DB(선택) 초기화 — DATABASE_URL 있으면 영속화 활성.
const db = await initDb().catch((e) => {
  console.warn(`⚠ DB 초기화 실패(영속화 비활성): ${e.message}`);
  return { enabled: false };
});

httpServer.listen(PORT, () => {
  console.log('═'.repeat(64));
  console.log(`▶️  LogisTwin 3D WebSocket 서버  http://localhost:${PORT}`);
  console.log(`   mode=${mode} │ speed=${speed}x │ seed=${seed} │ 크레인 ${craneModel.name} │ 초기재고 ${seededCount}셀`);
  console.log(`   DB: ${db.enabled ? 'Neon Postgres 영속화 ON' : 'in-memory (DATABASE_URL 미설정)'} │ TMS 트럭 ${tms.trucks.length}대`);
  console.log(`   health: GET /health  │  socket.io: 'init' → 'state'`);
  console.log('═'.repeat(64));
});

// ── 우아한 종료 ─────────────────────────────────────────────────
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n⏹  서버 종료 중...');
  clock.stop();
  dispatcher.stop();
  generator.stop();
  await closeDb();
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
