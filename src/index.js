/**
 * LogisTwin 3D — Phase 1~2 백엔드 부트스트랩 (라이브 실행).
 *
 * 디지털 트윈 시뮬레이터 코어를 조립·가동합니다:
 *   시드 RNG → SimClock → 창고(초기 재고) → 수요 모델 → 주문 엔진
 *   → 디스패처/크레인 플릿(Dual Command) → 이벤트 로그 + 실시간 KPI + 콘솔.
 *
 * 실행:
 *   npm start
 *   npm run sim -- --seed=42 --speed=100 --mode=dual
 *   npm run sim -- --mode=single        # 단일 명령으로 비교 관찰
 */
import { warehouseConfig, totalCells } from './config/warehouse.config.js';
import { simConfig } from './config/sim.config.js';
import { assembleCore, loadLayoutConfig } from './sim/bootstrap.js';
import { EventLog } from './services/eventLog.js';
import { CommandMode } from './services/dispatcher.js';
import { OrderType } from './models/order.js';
import { CommandType } from './models/task.js';

// ── CLI 인자 파싱 (--seed=, --speed=, --mode=) ──────────────────
function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)=(.+)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const args = parseArgs(process.argv);
const seed = args.seed !== undefined ? Number(args.seed) : simConfig.seed;
const speed = args.speed !== undefined ? Number(args.speed) : simConfig.speed;
const mode = args.mode === CommandMode.SINGLE ? CommandMode.SINGLE : CommandMode.DUAL;
// 임포트된 평면도 레이아웃으로 실행 (--layout=generated/xxx.layout.json), 없으면 기본 창고.
const activeConfig = args.layout ? loadLayoutConfig(args.layout) : warehouseConfig;
const craneModelId = args.crane; // 크레인 제원 선택 (--crane=highbay 등), 미지정 시 기본 표준형

// ── 부수효과(콘솔/이벤트로그) 옵저버 ────────────────────────────
const eventLog = new EventLog({ seed });
const ICON = { [OrderType.INBOUND]: '📥', [OrderType.OUTBOUND]: '📤' };

const observers = {
  onOrder: (order) => {
    eventLog.append('order', { order });
    const icon = ICON[order.type] ?? '📦';
    console.log(
      `[${clock.virtualTime}] ${icon} 주문 ${order.type.padEnd(8)} ${order.id}  ` +
        `${order.sku} (${order.grade}) ×${order.quantity}  → queue:${generator.jobQueue.length}`,
    );
  },
  onComplete: (order, info) => {
    eventLog.append('done', {
      orderId: order.id,
      crane: info.craneId,
      cell: info.cellId,
      cycle: info.cycle,
      tick: clock.tick,
    });
    const icon = ICON[order.type] ?? '📦';
    const tag = info.cycle === CommandType.DUAL ? '🔗DUAL' : 'SINGLE';
    console.log(
      `[${clock.virtualTime}] ✅ ${info.craneId} 완료 ${icon} ${order.type.padEnd(8)} ${order.id}  ` +
        `@${info.cellId}  [${tag}]`,
    );
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

// ── 시작 배너 ───────────────────────────────────────────────────
const { aisles, sidesPerAisle, baysPerSide, levels } = activeConfig;
console.log('═'.repeat(72));
console.log(`🏭  ${activeConfig.name} — LogisTwin 3D${args.layout ? ` (레이아웃: ${args.layout})` : ''}`);
console.log(
  `   랙 격자: ${aisles} 통로 × ${sidesPerAisle} 면 × ${baysPerSide} 베이 × ${levels} 층` +
    `  =  ${totalCells(activeConfig).toLocaleString()} 셀`,
);
console.log(`   초기 재고: ${seededCount.toLocaleString()} 셀 (적재율 ${(simConfig.initialFillRate * 100).toFixed(0)}%)`);
console.log(
  `   🏗 크레인: ${craneModel.name} (${craneModel.class}) — 주행 ${craneModel.horizontalSpeed}m/s · 승강 ${craneModel.verticalSpeed}m/s · 포크 ${craneModel.forkTimeSec}s · 최대 ${craneModel.maxLevels}층`,
);
console.log(
  `   시드: ${seed}  │  배속: ${speed}x  │  명령 모드: ${mode.toUpperCase()}` +
    `  │  시작 ${String(simConfig.startHour).padStart(2, '0')}:00`,
);
console.log('═'.repeat(72));

// ── 가동 (틱 리스너 등록 순서 = 실행 순서) ──────────────────────
generator.start(); // 1) 주문 생성
dispatcher.start(); // 2) 할당 + 크레인 전진
// 3) KPI 요약은 마지막에 등록 → 큐 소비 후 상태 반영.
clock.on('tick', ({ tick }) => {
  if (tick % simConfig.kpiReportEveryTicks === 0) {
    const t = dispatcher.totals();
    const fleet = dispatcher.cranes
      .map((c) => `${c.id}:${c.state[0]}${c.queue.length ? `(${c.queue.length})` : ''}`)
      .join(' ');
    console.log('─'.repeat(72));
    console.log(`   ${kpi.formatLine(generator.jobQueue.length)}  │  ⏱ ${clock.elapsedHours.toFixed(1)}h`);
    console.log(`   🏗  ${fleet}   │  사이클 SINGLE ${t.single} / 🔗DUAL ${t.dual}`);
    console.log('─'.repeat(72));
  }
});
clock.start();
console.log(`▶️  엔진 가동 [${mode.toUpperCase()}]. 수요 생성 → 크레인 플릿 처리 중...  (Ctrl+C 로 종료)\n`);

// ── 우아한 종료 ─────────────────────────────────────────────────
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const totalTicks = clock.tick || 1;
  const t = dispatcher.totals();
  const s = kpi.snapshot(generator.jobQueue.length);
  console.log('\n' + '═'.repeat(72));
  console.log(`⏹  엔진 정지 [${mode.toUpperCase()}]. 최종 요약:`);
  console.log(`   ${kpi.formatLine(generator.jobQueue.length)}`);
  console.log(
    `   사이클: SINGLE ${t.single} / 🔗DUAL ${t.dual}` +
      `  │  주행 수평 ${Math.round(s.travelH).toLocaleString()}m / 수직 ${Math.round(s.travelV).toLocaleString()}m`,
  );
  console.log(`   ⚡ 전력 ${s.energyKwh.toFixed(1)} kWh  │  🌱 탄소 ${s.co2Kg.toFixed(1)} kgCO₂  │  가상 경과 ${clock.elapsedHours.toFixed(2)}h`);
  console.log(`   📄 이벤트 로그: ${eventLog.path} (${eventLog.count} 건)`);
  console.log('═'.repeat(72));

  clock.stop();
  dispatcher.stop();
  generator.stop();
  await eventLog.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
