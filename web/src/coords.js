/**
 * 창고 config → 3D 월드 좌표 변환. **서버(warehouse.js)의 position 공식과 일치**해야
 * 크레인과 셀이 정렬됩니다.
 *
 *   cell.x(월드) = bay × cellSize.width
 *   cell.y(월드) = (level-1) × cellSize.height
 *   cell.z(월드) = (aisle-1) × aisleSpacing + (side==='R' ? cellSize.depth : 0)
 *   crane.z(월드) = (aisle-1) × aisleSpacing + cellSize.depth/2  (통로 중앙)
 */

/** 셀 ID "A2-R-B07-L03" → { aisle, side, bay, level }. */
export function parseCellId(id) {
  const m = /^A(\d+)-([LR])-B(\d+)-L(\d+)$/.exec(id);
  if (!m) return null;
  return { aisle: +m[1], side: m[2], bay: +m[3], level: +m[4] };
}

export function cellWorld(config, aisle, side, bay, level) {
  const cs = config.cellSize;
  return {
    x: bay * cs.width,
    y: (level - 1) * cs.height,
    z: (aisle - 1) * config.aisleSpacing + (side === 'R' ? cs.depth : 0),
  };
}

export function cellWorldFromId(config, id) {
  const p = parseCellId(id);
  return p ? cellWorld(config, p.aisle, p.side, p.bay, p.level) : null;
}

/** 크레인 보간 좌표(베이 float, 층 float) → 월드. */
export function craneWorld(config, aisle, bayFloat, levelFloat) {
  const cs = config.cellSize;
  return {
    x: bayFloat * cs.width,
    y: (levelFloat - 1) * cs.height,
    z: (aisle - 1) * config.aisleSpacing + cs.depth / 2,
  };
}

/** 창고 전체 크기(중앙 정렬용). */
export function warehouseExtent(config) {
  const cs = config.cellSize;
  return {
    x: config.baysPerSide * cs.width,
    y: config.levels * cs.height,
    z: (config.aisles - 1) * config.aisleSpacing + cs.depth,
  };
}
