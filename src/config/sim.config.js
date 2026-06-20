/**
 * 시뮬레이션 엔진 설정.
 *
 * 결정론(seed), 시간 가속(speed), 수요 강도(λ), 시간대별 부하 곡선을 정의합니다.
 * CLI 인자(--seed, --speed)로 seed/speed는 런타임 override 가능 (src/index.js 참조).
 */
export const simConfig = {
  // ── 결정론적 재현 ────────────────────────────────────────────
  seed: 42, // 동일 seed → 완전히 동일한 시뮬레이션

  // ── 시간 가속 ────────────────────────────────────────────────
  speed: 1, // 1x / 10x / 100x — 실시간 대비 가상시간 배속
  tickMs: 1000, // 실시간 1틱 = 가상 1초 (시작 프롬프트의 "1초마다")
  startHour: 9, // 시뮬레이션 시작 가상 시각 (09:00) — 업무 시작
  simDate: '2026-06-19', // 주문 ID/타임스탬프의 기준 날짜 (재현성 위해 고정)

  // ── 수요(주문 도착) 모델 ─────────────────────────────────────
  // 포아송 평균 λ (분당 평균 주문 수). 시간대 프로파일로 가중.
  // 단일 명령 용량(~12/분) 부근으로 설정 — 혼합 백로그가 형성되어 Dual Command 페어링이
  // 가시화되고, 피크(1.4×≈20/분)엔 단일 명령은 적체·복합 명령은 흡수하는 대비가 드러남.
  baseArrivalPerMin: 14,
  initialFillRate: 0.6, // 초기 적재율 (0~1) → 시작부터 적정 재고로 가동

  /**
   * 시간대별 부하 곡선 (24시간). 각 원소:
   *   - load   : λ 배율 (1.0 = 기준). 0이면 그 시간대는 주문 없음(비업무).
   *   - inRatio: 해당 시간대의 INBOUND 비율 (0~1). 나머지는 OUTBOUND.
   *
   * 현장 패턴 반영: 오전 = 입고 집중(트럭 입하), 오후 = 출고 집중(출하 마감),
   * 야간(00~06) = 한산.
   */
  hourlyProfile: buildHourlyProfile(),

  // ── KPI 요약 출력 주기 (가상 틱 기준) ─────────────────────────
  kpiReportEveryTicks: 30,
};

/** 24시간 부하/비율 곡선 생성. */
function buildHourlyProfile() {
  const profile = new Array(24);
  for (let h = 0; h < 24; h++) {
    let load;
    if (h >= 0 && h < 6) load = 0.1; // 야간 — 한산
    else if (h >= 6 && h < 9) load = 0.6; // 이른 아침 — 워밍업
    else if (h >= 9 && h < 12) load = 1.3; // 오전 — 입고 피크
    else if (h >= 12 && h < 13) load = 0.5; // 점심 — 둔화
    else if (h >= 13 && h < 18) load = 1.4; // 오후 — 출고 피크
    else if (h >= 18 && h < 21) load = 0.8; // 저녁 — 마감 처리
    else load = 0.3; // 심야 — 잔여

    // 오전엔 입고 우세(0.7), 오후엔 출고 우세(0.3)로 선형 전환.
    let inRatio;
    if (h < 6) inRatio = 0.5;
    else if (h < 12) inRatio = 0.7; // 오전 입고 집중
    else if (h < 18) inRatio = 0.3; // 오후 출고 집중
    else inRatio = 0.5;

    profile[h] = { load, inRatio };
  }
  return profile;
}
