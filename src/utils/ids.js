/**
 * ID 생성 유틸 — 주문/셀 식별자.
 *
 * 결정론을 위해 주문 ID는 단조 증가 시퀀스 기반(난수 미사용)입니다.
 * 같은 seed로 돌리면 동일한 ID가 동일한 순서로 발급됩니다.
 */

/** 0-기준 정수를 자리수 패딩한 문자열로. */
function pad(n, width) {
  return String(n).padStart(width, '0');
}

/**
 * 주문 ID 생성기. `ORD-<YYYYMMDD>-<seq>` 형식.
 * @param {string} dateStamp 'YYYYMMDD' (시뮬레이션 기준 날짜)
 */
export function createOrderIdFactory(dateStamp) {
  let seq = 0;
  return function nextOrderId() {
    seq += 1;
    return `ORD-${dateStamp}-${pad(seq, 6)}`;
  };
}

/**
 * 랙 셀 ID. `A<aisle>-<side>-B<bay>-L<level>` 형식.
 * 예: A2-R-B07-L03 → 통로2, 오른쪽, 베이7, 3층.
 */
export function cellId(aisle, side, bay, level) {
  return `A${aisle}-${side}-B${pad(bay, 2)}-L${pad(level, 2)}`;
}
