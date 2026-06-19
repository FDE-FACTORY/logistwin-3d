/**
 * 크레인 작업(Task) — 한 번의 명령 사이클이 처리하는 작업 묶음.
 *
 * Single Command(SC): 한 사이클에 입고(적재) 또는 출고(추출) 1건.
 *   - 절반의 주행이 공차(빈손) 주행 → 비효율.
 * Dual  Command(DC): 한 사이클에 입고 + 출고를 연계 처리.
 *   - 적재 후 빈손 복귀 대신, 인접한 출고 물품을 추출해 함께 귀환 → 공차 주행 제거.
 *
 * 각 Task는 leg(작업 다리) 목록을 가지며, 크레인이 이를 이동/포크 단계로 컴파일합니다.
 */

export const CommandType = Object.freeze({
  SINGLE: 'SINGLE',
  DUAL: 'DUAL',
});

export const Op = Object.freeze({
  STORE: 'STORE', // 적재 (입고)
  RETRIEVE: 'RETRIEVE', // 추출 (출고)
});

/** 단일 입고(적재) 작업. */
export function storeTask(order, cell) {
  return { type: CommandType.SINGLE, legs: [{ op: Op.STORE, order, cell }] };
}

/** 단일 출고(추출) 작업. */
export function retrieveTask(order, cell) {
  return { type: CommandType.SINGLE, legs: [{ op: Op.RETRIEVE, order, cell }] };
}

/**
 * 복합 명령(Dual Command) 작업 — 적재 후 곧바로 인접 출고를 추출.
 * 경로: 홈 →(입고 적재)→ storeCell →(공차 이동)→ retrieveCell →(출고 적재)→ 홈
 */
export function dualTask(inOrder, storeCell, outOrder, retrieveCell) {
  return {
    type: CommandType.DUAL,
    legs: [
      { op: Op.STORE, order: inOrder, cell: storeCell },
      { op: Op.RETRIEVE, order: outOrder, cell: retrieveCell },
    ],
  };
}
