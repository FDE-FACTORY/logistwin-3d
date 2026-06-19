/**
 * 스태커 크레인 동역학(kinematics) 설정.
 *
 * AS/RS 크레인은 수평(X 주행)과 수직(Z 승강)을 **동시에** 구동합니다.
 * 따라서 한 지점까지의 이동 시간은 두 축 중 더 오래 걸리는 쪽으로 결정됩니다
 * (체비쇼프 거리 모델): travelTime = max(수평거리 / Vh, 수직거리 / Vv).
 *
 * 통로마다 크레인 1대가 배정되어 양쪽 랙을 처리합니다(표준 AS/RS 구성).
 */
export const craneConfig = {
  horizontalSpeed: 2.0, // m/s — X축 주행 속도
  verticalSpeed: 1.0, // m/s — Z축 승강 속도 (수평과 동시 구동)
  forkTimeSec: 8, // 적재/추출 1회 포크 동작 시간(초)
  homeX: 0, // 대기 위치 베이 (= I/O P&D 스테이션)
  homeZ: 1, // 대기 위치 층 (1층)
};
