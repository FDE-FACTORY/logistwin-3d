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
const cellDeltas = new Map();

const slimOrder = (o) => ({ id: o.id, type: o.type, sku: o.sku, grade: o.grade, quantity: o.quantity });

const observers = {
  onOrder: (order) => tickOrders.push(slimOrder(order)),
  onComplete: (order, info) =>
    tickDone.push({ id: order.id, type: order.type, crane: info.craneId, cell: info.cellId, cycle: info.cycle }),
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
    cranes: dispatcher.cranes.map((c) => c.renderState()),
    kpi: kpi.snapshot(generator.jobQueue.length),
  };
}

io.on('connection', (socket) => {
  socket.emit('init', buildInit());
  console.log(`🔌 클라이언트 접속: ${socket.id} (총 ${io.engine.clientsCount})`);
  socket.on('disconnect', () => console.log(`❌ 접속 해제: ${socket.id} (총 ${io.engine.clientsCount})`));
});

// ── 가동 + 매 틱 브로드캐스트 (디스패처 이후 등록 → 처리 결과 반영) ─
generator.start();
dispatcher.start();
clock.on('tick', ({ tick, virtualTime, hourOfDay }) => {
  io.emit('state', {
    tick,
    virtualTime,
    hourOfDay,
    cranes: dispatcher.cranes.map((c) => c.renderState()),
    cellDeltas: [...cellDeltas.values()],
    orders: tickOrders,
    done: tickDone,
    cycles: dispatcher.totals(),
    kpi: kpi.snapshot(generator.jobQueue.length),
  });
  tickOrders = [];
  tickDone = [];
  cellDeltas.clear();
});
clock.start();

httpServer.listen(PORT, () => {
  console.log('═'.repeat(64));
  console.log(`▶️  LogisTwin 3D WebSocket 서버  http://localhost:${PORT}`);
  console.log(`   mode=${mode} │ speed=${speed}x │ seed=${seed} │ 크레인 ${craneModel.name} │ 초기재고 ${seededCount}셀`);
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
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
