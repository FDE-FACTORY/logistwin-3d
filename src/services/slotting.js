/**
 * 적재 최적화(Slotting) — A급 상품을 출하장(I/O) 근처·저층으로 재배치.
 *
 * ABC 분석상 A급(고회전)을 I/O에 가깝고 낮은 셀에 두면 크레인 주행거리·에너지가 줄어듭니다.
 * 대시보드의 [적재 효율화] 버튼이 이 로직을 호출하고, 변경된 셀(deltas)을 브로드캐스트합니다.
 *
 * 이번 단계는 즉시 재배치(시뮬 단순화)이며, 예약(reserved)된 셀은 건드리지 않습니다.
 */

/** I/O로부터의 접근 비용(수평+수직+통로전환, m). 낮을수록 좋은 슬롯. */
function ioCost(cell, cfg) {
  const cs = cfg.cellSize;
  return (
    cell.x * cs.width +
    (cell.z - 1) * cs.height +
    Math.abs(cell.aisle - cfg.ioStation.aisle) * cfg.aisleSpacing
  );
}

/**
 * A급 재배치 실행.
 * @param {import('../models/warehouse.js').Warehouse} warehouse
 * @param {number} [maxMoves]
 * @returns {{ moved:number, savedMeters:number, deltas:Array }}
 */
export function runSlotting(warehouse, maxMoves = 60) {
  const cfg = warehouse.config;
  const cost = (c) => ioCost(c, cfg);

  // 먼 곳에 있는 A급부터 (비용 큰 순).
  const aFar = warehouse.cells
    .filter((c) => c.occupied && !c.reserved && c.pallet?.grade === 'A')
    .sort((a, b) => cost(b) - cost(a));

  // 비어있는 후보 셀 (비용 작은 순 = I/O 근접).
  let empties = warehouse.cells
    .filter((c) => !c.occupied && !c.reserved)
    .sort((a, b) => cost(a) - cost(b));

  const deltas = [];
  let moved = 0;
  let savedMeters = 0;

  for (const far of aFar) {
    if (moved >= maxMoves) break;
    const farCost = cost(far);
    // 현재보다 더 가까운 빈 셀.
    const idx = empties.findIndex((e) => cost(e) < farCost);
    if (idx === -1) break;
    const near = empties[idx];

    const pallet = warehouse.retrieve(far); // far 비움
    warehouse.store(near, pallet); // near 채움
    savedMeters += (farCost - cost(near)) * 2; // 왕복 절감 근사

    deltas.push({ id: far.id, occupied: false });
    deltas.push({ id: near.id, occupied: true, sku: pallet.sku, grade: pallet.grade });

    // near는 점유됨 → 후보에서 제거, far(빈 셀)를 후보에 추가(정렬 유지).
    empties.splice(idx, 1);
    const insertAt = empties.findIndex((e) => cost(e) > farCost);
    if (insertAt === -1) empties.push(far);
    else empties.splice(insertAt, 0, far);

    moved += 1;
  }

  return { moved, savedMeters: Math.round(savedMeters), deltas };
}
