import { layoutDesign } from './layout.design.js';

/**
 * 랙 레이아웃 자동 설계기.
 *
 * 건물 외곽 치수(가로 W × 세로 D × 천장고 H)와 설계 규칙으로부터, 그 안에 들어가는
 * AS/RS 고층 랙 배치(통로 수 × 베이 수 × 층수)를 산출하고 warehouse.config 호환 객체를 만듭니다.
 *
 * 기하 모델 (단면은 가로 W 방향으로 반복):
 *   [ 외벽이격 | (통로+양쪽랙) × N통로 | 외벽이격 ]
 *   통로 모듈 폭 = aisleWidth + 2 × rackDepth
 *   통로는 세로 D 방향으로 주행, 베이는 그 방향으로 나열.
 *
 * @param {object} envelope { width, depth, clearHeight? } — 미터. 건물 내부 가용 치수.
 * @param {object} [design] layout.design.js 오버라이드
 * @param {object} [opts] { name }
 * @returns {{ config, report }}
 */
export function generateLayout(envelope, design = {}, opts = {}) {
  const d = { ...layoutDesign, ...design };
  const { width, depth, clearHeight } = envelope;

  const usableW = width - 2 * d.perimeterClearance;
  const usableD = depth - 2 * d.perimeterClearance - d.frontClearance;

  const moduleWidth = d.aisleWidth + 2 * d.rackDepth;
  const aisles = Math.floor(usableW / moduleWidth);
  const baysPerSide = Math.floor(usableD / d.bayPitch);
  const levels = clearHeight
    ? Math.min(d.maxLevels, Math.floor((clearHeight - d.topClearance) / d.levelHeight))
    : d.defaultLevels;

  if (aisles < 1 || baysPerSide < 1 || levels < 1) {
    throw new Error(
      `건물이 너무 작아 랙 배치 불가 (가용 ${usableW.toFixed(1)}×${usableD.toFixed(1)}m → 통로 ${aisles}, 베이 ${baysPerSide}, 층 ${levels})`,
    );
  }

  const config = {
    name: opts.name || 'Imported DC',
    aisles,
    sidesPerAisle: 2,
    baysPerSide,
    levels,
    cellSize: { width: d.bayPitch, height: d.levelHeight, depth: d.rackDepth },
    aisleSpacing: moduleWidth,
    ioStation: { aisle: 1, bay: 0 },
  };

  // ── 리포트(성과/밀도 지표) ──────────────────────────────────
  const totalCells = aisles * 2 * baysPerSide * levels;
  const usedW = aisles * moduleWidth;
  const usedD = baysPerSide * d.bayPitch + d.frontClearance;
  const floorArea = width * depth;
  const footprintArea = usedW * usedD;
  const report = {
    envelope: { width, depth, clearHeight: clearHeight ?? null },
    fit: { aisles, baysPerSide, levels, moduleWidth: round(moduleWidth) },
    totalCells,
    storageDensityPerM2: round(totalCells / floorArea), // 셀/m² (층 누적 → 고층 밀도)
    floorAreaM2: round(floorArea),
    usedFootprintM2: round(footprintArea),
    spaceUtilization: round(footprintArea / floorArea), // 0~1
    leftover: { widthM: round(usableW - usedW), depthM: round(usableD - baysPerSide * d.bayPitch) },
  };

  return { config, report };
}

function round(n) {
  return Math.round(n * 100) / 100;
}
