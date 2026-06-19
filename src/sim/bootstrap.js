import { readFileSync } from 'node:fs';
import { warehouseConfig } from '../config/warehouse.config.js';
import { simConfig } from '../config/sim.config.js';
import { craneConfig } from '../config/crane.config.js';
import { Rng } from './rng.js';
import { SimClock } from './clock.js';
import { DemandModel } from './demandModel.js';
import { Warehouse } from '../models/warehouse.js';
import { OrderStatus } from '../models/order.js';
import { OrderGenerator } from '../services/orderGenerator.js';
import { Dispatcher, CommandMode } from '../services/dispatcher.js';
import { KpiCollector } from '../metrics/kpi.js';
import { skuMaster } from '../data/skuMaster.js';
import { resolveCraneModel } from '../data/craneModels.js';

/**
 * 초기 재고 적재(시드 기반) → 시작부터 OUTBOUND 유효.
 * @returns {number} 적재된 셀 수
 */
export function seedInitialStock(warehouse, rng, fillRate = simConfig.initialFillRate) {
  const target = Math.floor(warehouse.cells.length * fillRate);
  const weights = skuMaster.map((s) => s.popularity);
  let stored = 0;
  while (stored < target) {
    const cell = warehouse.findRandomEmptyCell(rng);
    if (!cell) break;
    const sku = rng.weightedPick(skuMaster, weights);
    warehouse.store(cell, {
      sku: sku.sku,
      grade: sku.grade,
      quantity: sku.unitsPerPallet,
      storedAt: `${simConfig.simDate}T00:00:00`,
    });
    stored += 1;
  }
  return stored;
}

/**
 * 시뮬레이터 코어 조립 — index(라이브)와 compare(헤드리스)가 공유.
 *
 * KPI 집계는 내부에서 배선하고, 콘솔/로그 등 부수효과는 `observers` 콜백으로 위임합니다.
 * 아무것도 start하지 않습니다 — 호출자가 순서대로 start (생성 → 디스패처 → [틱 리스너] → 클록).
 *
 * @param {object} p
 * @param {number} p.seed
 * @param {number} [p.speed]
 * @param {string} [p.mode] CommandMode
 * @param {object} [p.observers] { onOrder(order), onAssign(order, place), onComplete(order, info) }
 */
/**
 * 임포트된 레이아웃 JSON(generated/*.layout.json) → warehouse.config 객체 로드.
 * @param {string} path
 */
export function loadLayoutConfig(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!data.config) throw new Error(`레이아웃 파일에 config가 없습니다: ${path}`);
  return data.config;
}

export function assembleCore({ seed, speed = simConfig.speed, mode = CommandMode.DUAL, observers = {}, config = warehouseConfig, craneModel }) {
  const rng = new Rng(seed);
  const warehouse = new Warehouse(config);

  // 크레인 제원 선택 — 모델의 최대 층수가 레이아웃 층수를 충족해야 투입 가능.
  const model = resolveCraneModel(craneModel);
  if (model.maxLevels < config.levels) {
    throw new Error(
      `크레인 '${model.name}'(최대 ${model.maxLevels}층)는 레이아웃 ${config.levels}층에 부적합. 더 높은 사양을 선택하세요 (예: highbay).`,
    );
  }
  // 유효 크레인 설정 = 홈 위치(레이아웃) + 선택 모델의 동역학.
  const effectiveCrane = {
    homeX: craneConfig.homeX,
    homeZ: craneConfig.homeZ,
    horizontalSpeed: model.horizontalSpeed,
    verticalSpeed: model.verticalSpeed,
    forkTimeSec: model.forkTimeSec,
  };

  const demandModel = new DemandModel(rng, simConfig);
  const clock = new SimClock({
    tickMs: simConfig.tickMs,
    speed,
    startHour: simConfig.startHour,
  });
  const dateStamp = simConfig.simDate.replace(/-/g, '');
  const generator = new OrderGenerator({ warehouse, demandModel, clock, rng, dateStamp });
  const kpi = new KpiCollector(warehouse);

  const dispatcher = new Dispatcher({
    warehouse,
    clock,
    craneConfig: effectiveCrane,
    mode,
    hooks: {
      onTravel: (seg) => kpi.addTravel(seg),
      onComplete: (order, info) => {
        order.status = OrderStatus.DONE;
        kpi.recordCompletion(order);
        observers.onComplete?.(order, info);
      },
      onAssign: (order, place) => observers.onAssign?.(order, place),
      onHandle: (order, cell, op) => observers.onHandle?.(order, cell, op),
    },
  });

  generator.on('order', (order) => {
    kpi.record(order, generator.jobQueue.length);
    observers.onOrder?.(order);
  });
  dispatcher.attachQueue(generator.jobQueue);

  const seededCount = seedInitialStock(warehouse, rng);

  return { rng, warehouse, demandModel, clock, generator, dispatcher, kpi, seededCount, dateStamp, craneModel: model };
}
