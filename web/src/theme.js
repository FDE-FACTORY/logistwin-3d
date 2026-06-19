/**
 * 산업용 물류 관제(WMS/SCADA) 팔레트.
 *
 * AI풍 글래스/그라데이션 대신, 현장 관제 화면에서 쓰는 그래파이트·스틸 표면 +
 * 기능색(정상=녹색, 주의/작업=앰버, 알람=적색, 이동/정보=블루)을 사용합니다.
 * 3D·Canvas2D·HUD가 동일 색을 공유하도록 여기서 단일 정의합니다.
 */
export const theme = {
  bg: '#0d1117',
  bgDeep: '#0a0e13',
  panel: '#141a21',
  border: '#283039',
  borderStrong: '#3a4654',
  text: '#dfe5ec',
  textDim: '#8b97a6',
  textFaint: '#5c6775',

  ok: '#3fb950', // 정상/가동
  caution: '#d9a005', // 주의/작업 중
  alarm: '#e5484d', // 알람/예외
  info: '#2f81f7', // 정보/이동

  // ABC 등급(회전율) — 기능 구분색
  grade: { A: '#e5654d', B: '#d9a005', C: '#3a86d4' },

  // 크레인 상태색
  crane: { IDLE: '#6e7b8b', TRAVELING: '#2f81f7', HANDLING: '#d9a005', RETURNING: '#26a69a' },
};
