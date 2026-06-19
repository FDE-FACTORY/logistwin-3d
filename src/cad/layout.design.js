/**
 * AS/RS 랙 레이아웃 자동 설계 기본 파라미터 (미터 단위).
 *
 * 건물 평면도(외곽 치수)만 주어졌을 때, 이 설계 규칙으로 통로·랙·베이·층을 배치합니다.
 * 단면(건물 폭 방향) 반복 단위 = 통로 1개 + 양쪽 랙: `aisleWidth + 2 × rackDepth`.
 *
 * 값은 실무 스태커 크레인(좁은 통로형) 근사치이며, 도면/장비 스펙에 맞춰 조정 가능합니다.
 */
export const layoutDesign = {
  aisleWidth: 1.6, // 통로 폭 (크레인 주행로). 좁은 통로형 AS/RS
  rackDepth: 1.1, // 랙 1열 깊이 (팔레트 1개)
  bayPitch: 1.2, // 통로 방향 베이 간격 (= 셀 폭, X축 1스텝)
  levelHeight: 1.0, // 층 높이 (Z축 1스텝)

  perimeterClearance: 1.5, // 외벽 이격 (건물 둘레 통로/안전거리)
  frontClearance: 5.0, // 전면 입출하장(I/O) 통로 깊이 (랙 시작 전 여유)
  topClearance: 0.8, // 천장 이격 (최상단 층 위 여유)

  defaultLevels: 8, // 천장고 미입력 시 기본 층수
  maxLevels: 12, // 천장고로 산출 시 상한
};
