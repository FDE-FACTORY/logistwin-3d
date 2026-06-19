/**
 * 주문(Order) 모델 — 입/출고 작업 1건.
 *
 * 주문은 생성 시점엔 목적지(target) 미정 상태(PENDING)이며,
 * 이후 상태 머신(Phase 1.3)이 크레인을 배정하며 ASSIGNED → DONE으로 전이시킵니다.
 */

/** 주문 유형 상수. */
export const OrderType = Object.freeze({
  INBOUND: 'INBOUND', // 입고 — 빈 셀에 팔레트 적재
  OUTBOUND: 'OUTBOUND', // 출고 — 적재된 팔레트 추출
});

/** 주문 상태 상수 (상태 머신 전이). */
export const OrderStatus = Object.freeze({
  PENDING: 'PENDING', // 생성됨, 크레인 미배정
  ASSIGNED: 'ASSIGNED', // 크레인/셀 배정됨 (Phase 1.3)
  DONE: 'DONE', // 처리 완료
});

/**
 * 주문 객체 생성.
 * @param {object} p
 * @param {string} p.id          주문 ID
 * @param {string} p.type        OrderType
 * @param {object} p.sku         skuMaster 항목
 * @param {number} p.quantity    수량
 * @param {string} p.createdAt   ISO 문자열 (가상 시각 기준)
 * @param {number} p.simTick     생성 틱 번호 (재현/리플레이용)
 */
export function createOrder({ id, type, sku, quantity, createdAt, simTick }) {
  return {
    id,
    type,
    sku: sku.sku,
    grade: sku.grade,
    quantity,
    createdAt,
    simTick,
    status: OrderStatus.PENDING,
    target: null, // 추후 상태 머신이 배정할 셀 ID
  };
}
