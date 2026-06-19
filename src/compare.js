/**
 * Single vs Dual Command 비교 하네스 (헤드리스, 결정론적).
 *
 * **간판 지표**: 복합 명령(Dual Command)이 단일 명령(Single Command) 대비
 * 주행거리·전력·탄소를 몇 % 절감하는지 정량화합니다.
 *
 * 공정성 보장 — 동일한 **주문 트레이스**를 두 모드에 그대로 재생합니다.
 *   1) 창고 상태와 무관하게 시드 기반으로 주문 트레이스를 1회 생성.
 *   2) 동일 트레이스를 SINGLE / DUAL 디스패처에 각각 투입.
 *   3) 두 시나리오를 모두 소진(drain)시킨 뒤 누적 지표를 비교.
 *
 * 이론적 배경: DC 사이클 시간 < 2 × SC (Bozer & White, 1984) → 거래당 ~25–30% 절감.
 *
 * 실행: npm run compare -- --seed=42 --ticks=7200
 */
import { warehouseConfig } from './config/warehouse.config.js';
import { simConfig } from './config/sim.config.js';
import { craneConfig } from './config/crane.config.js';
import { Rng } from './sim/rng.js';
import { SimClock } from './sim/clock.js';
import { Warehouse } from './models/warehouse.js';
import { Dispatcher, CommandMode } from './services/dispatcher.js';
import { KpiCollector } from './metrics/kpi.js';
import { OrderStatus, OrderType, createOrder } from './models/order.js';
import { createOrderIdFactory } from './utils/ids.js';
import { seedInitialStock } from './sim/bootstrap.js';
import { skuMaster, skuPopularityWeights } from './data/skuMaster.js';

// ── CLI ─────────────────────────────────────────────────────────
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
const ticks = args.ticks !== undefined ? Number(args.ticks) : 7200; // 기본 가상 2시간
// 분당 주문 도착률(λ). 기본 20/분 — 크레인 5대 용량(~12/분)을 넘는 피크 부하로,
// 혼합 백로그가 형성되어 Dual Command의 페어링 효과가 드러나는 구간.
const ratePerMin = args.rate !== undefined ? Number(args.rate) : 20;

const dateStamp = simConfig.simDate.replace(/-/g, '');

function isoFromSec(virtualSec) {
  const totalSec = Math.floor(virtualSec);
  const p = (n) => String(n).padStart(2, '0');
  const h = Math.floor(totalSec / 3600) % 24;
  const m = Math.floor(totalSec / 60) % 60;
  const s = totalSec % 60;
  return `${dateStamp.slice(0, 4)}-${dateStamp.slice(4, 6)}-${dateStamp.slice(6, 8)}T${p(h)}:${p(m)}:${p(s)}`;
}

/**
 * 창고 독립적 주문 트레이스 생성 (동일 트레이스를 두 모드에 재생).
 *
 * 통제된 A/B 벤치마크를 위해 **일정 부하·균형(50:50) 합성 트레이스**를 씁니다:
 *   - 도착: 분당 λ의 포아송 (피크 부하 일정 유지)
 *   - 유형: 입고/출고 50:50 → 창고 적재율 안정(≈초기치) → 만재/고갈 artifact 배제
 *   - SKU : ABC 인기도 가중 (현실적 회전율)
 * 시간대 프로파일은 의도적으로 배제(실데이 동특성은 라이브 `npm start`에서 관찰).
 */
function buildTrace(s, n) {
  const rng = new Rng(s);
  const nextId = createOrderIdFactory(dateStamp);
  const startSec = simConfig.startHour * 3600;
  const lambdaPerTick = (ratePerMin * simConfig.tickMs) / 60_000;
  const byTick = new Map();
  let count = 0;
  for (let tick = 1; tick <= n; tick++) {
    const k = rng.poisson(lambdaPerTick);
    if (k === 0) continue;
    const orders = [];
    for (let i = 0; i < k; i++) {
      const type = rng.random() < 0.5 ? OrderType.INBOUND : OrderType.OUTBOUND;
      const sku = rng.weightedPick(skuMaster, skuPopularityWeights);
      const qty = Math.max(1, sku.unitsPerPallet + rng.int(-2, 2));
      orders.push(
        createOrder({
          id: nextId(),
          type,
          sku,
          quantity: qty,
          createdAt: isoFromSec(startSec + tick),
          simTick: tick,
        }),
      );
    }
    byTick.set(tick, orders);
    count += orders.length;
  }
  return { byTick, count };
}

/** 한 모드를 트레이스에 대해 실행하고 누적 지표 반환. */
function runScenario(mode, s, trace, n) {
  const rng = new Rng(s); // 초기 재고 시딩용 (두 모드 동일)
  const warehouse = new Warehouse(warehouseConfig);
  seedInitialStock(warehouse, rng);
  const kpi = new KpiCollector(warehouse);
  const clock = new SimClock({ tickMs: simConfig.tickMs, speed: 1, startHour: simConfig.startHour });
  const queue = [];
  const dispatcher = new Dispatcher({
    warehouse,
    clock,
    craneConfig,
    mode,
    hooks: {
      onTravel: (seg) => kpi.addTravel(seg),
      onComplete: (order) => {
        order.status = OrderStatus.DONE;
        kpi.recordCompletion(order);
      },
    },
  });
  dispatcher.attachQueue(queue);

  // 주입기를 디스패처보다 먼저 등록 → 매 틱 주문이 먼저 큐에 들어간 뒤 처리.
  clock.on('tick', ({ tick }) => {
    const orders = trace.byTick.get(tick);
    if (orders) for (const o of orders) { queue.push(o); kpi.record(o, queue.length); }
  });
  dispatcher.start();

  for (let i = 0; i < n; i++) clock.tickOnce();

  // 잔여 작업 소진 (in-flight 완료) — 진척 없으면 중단.
  let guard = 0;
  while ((queue.length > 0 || dispatcher.cranes.some((c) => !c.isIdle)) && guard < 20000) {
    const before = kpi.completedIn + kpi.completedOut;
    clock.tickOnce();
    guard += 1;
    // 큐만 남고 더 이상 완료가 없으면(미충족 출고) 탈출.
    if (queue.length > 0 && !dispatcher.cranes.some((c) => !c.isIdle)) {
      const after = kpi.completedIn + kpi.completedOut;
      if (after === before) break;
    }
  }

  return { mode, snapshot: kpi.snapshot(queue.length), totals: dispatcher.totals(), leftover: queue.length };
}

// ── 실행 + 비교 출력 ────────────────────────────────────────────
const trace = buildTrace(seed, ticks);
const single = runScenario(CommandMode.SINGLE, seed, trace, ticks);
const dual = runScenario(CommandMode.DUAL, seed, trace, ticks);

const pct = (base, val) => (base === 0 ? 0 : ((base - val) / base) * 100);
const perOrder = (r) => {
  const done = r.snapshot.completed || 1;
  return {
    travel: r.snapshot.totalTravelM / done,
    energy: r.snapshot.energyKwh / done,
  };
};
const sPer = perOrder(single);
const dPer = perOrder(dual);
const dualShare =
  dual.totals.single + dual.totals.dual === 0
    ? 0
    : (dual.totals.dual / (dual.totals.single + dual.totals.dual)) * 100;

const f = (n, d = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const row = (label, a, b, save) =>
  `   ${label.padEnd(22)} ${String(a).padStart(12)} ${String(b).padStart(12)}   ${save}`;

console.log('═'.repeat(72));
console.log(`🔬  LogisTwin 3D — Single vs Dual Command 비교`);
console.log(`    seed=${seed} │ ${ticks.toLocaleString()}틱 (가상 ${(ticks / 3600).toFixed(1)}h) │ 부하 ${ratePerMin}/분(균형 50:50) │ 트레이스 ${trace.count.toLocaleString()}건`);
console.log('═'.repeat(72));
console.log(`   ${''.padEnd(22)} ${'SINGLE'.padStart(12)} ${'DUAL'.padStart(12)}   절감`);
console.log('─'.repeat(72));
console.log(row('완료 명령(건)', f(single.snapshot.completed), f(dual.snapshot.completed), '—'));
console.log(row('🔗 DUAL 사이클', f(single.totals.dual), f(dual.totals.dual), `페어링률 ${dualShare.toFixed(0)}%`));
console.log(row('총 주행거리(m)', f(single.snapshot.totalTravelM), f(dual.snapshot.totalTravelM), `▼ ${pct(single.snapshot.totalTravelM, dual.snapshot.totalTravelM).toFixed(1)}%`));
console.log(row('명령당 주행(m)', f(sPer.travel, 1), f(dPer.travel, 1), `▼ ${pct(sPer.travel, dPer.travel).toFixed(1)}%`));
console.log(row('전력(kWh)', f(single.snapshot.energyKwh, 1), f(dual.snapshot.energyKwh, 1), `▼ ${pct(single.snapshot.energyKwh, dual.snapshot.energyKwh).toFixed(1)}%`));
console.log(row('명령당 전력(kWh)', f(sPer.energy, 3), f(dPer.energy, 3), `▼ ${pct(sPer.energy, dPer.energy).toFixed(1)}%`));
console.log(row('탄소(kgCO₂)', f(single.snapshot.co2Kg, 1), f(dual.snapshot.co2Kg, 1), `▼ ${pct(single.snapshot.co2Kg, dual.snapshot.co2Kg).toFixed(1)}%`));
console.log('─'.repeat(72));
console.log(
  `   ✅ Dual-Command로 명령당 주행 ${pct(sPer.travel, dPer.travel).toFixed(1)}%, ` +
    `전력 ${pct(sPer.energy, dPer.energy).toFixed(1)}% 절감 ` +
    `(페어링률 ${dualShare.toFixed(0)}%, 잔여 SINGLE ${single.leftover}/DUAL ${dual.leftover})`,
);
console.log('═'.repeat(72));
