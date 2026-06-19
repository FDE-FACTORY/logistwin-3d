/**
 * 창고(AS/RS) 형상 설정 — 단일 진실 공급원(Single Source of Truth).
 *
 * 모든 좌표/거리/3D 렌더 스케일이 이 값에서 파생됩니다.
 * 추후 실제 물류센터 CAD 도면을 받으면, 로직 변경 없이 이 수치만 교체하면 됩니다.
 *
 * 좌표계
 *   - Aisle : 통로 번호 (1..aisles). 스태커 크레인 1대가 통로 하나를 전담.
 *   - Side  : 통로 양쪽 랙 (L | R). 크레인은 통로 중앙을 주행하며 양쪽을 처리.
 *   - X     : 베이(bay) 인덱스 = 가로 위치 (0..baysPerSide-1). 출하장에서 멀어질수록 증가.
 *   - Z     : 레벨(level) = 층수 (1..levels). 8m 고층 랙.
 */
export const warehouseConfig = {
  name: 'LogisTwin Central DC',

  // ── 랙 격자 차원 ──────────────────────────────────────────────
  aisles: 5, // 통로 수
  sidesPerAisle: 2, // L / R (양쪽 랙)
  baysPerSide: 25, // X축 — 통로 방향 가로 위치 수
  levels: 8, // Z축 — 층수 (8m 고층)

  // ── 물리 치수 (미터) — 3D 스케일 + ESG/거리 환산 기준 ──────────
  cellSize: {
    width: 1.2, // 베이 1칸 폭 (X축 1스텝 거리)
    height: 1.0, // 레벨 1칸 높이 (Z축 1스텝 상승 높이)
    depth: 1.2, // 랙 깊이
  },

  // ── 통로 간격 (미터) — 크레인이 통로를 바꿀 때의 횡 이동 거리 ──
  aisleSpacing: 4.0,

  /**
   * 입출하장(I/O Station) — 모든 입/출고의 시작·종료 지점.
   * 크레인 주행거리, Slotting(A급 출하장 근처 배치), Dual-Command 최적화의 기준점.
   * aisle/bay는 0-기준 가상 원점(베이 0 = 출하장 라인)을 의미.
   */
  ioStation: { aisle: 1, bay: 0 },
};

/** 총 저장 셀 개수 (= aisles × sidesPerAisle × baysPerSide × levels). */
export function totalCells(config = warehouseConfig) {
  return config.aisles * config.sidesPerAisle * config.baysPerSide * config.levels;
}
