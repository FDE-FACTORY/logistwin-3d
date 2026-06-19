/**
 * WebSocket 스모크 테스트 클라이언트.
 *
 * 서버에 접속해 'init'(정적 레이아웃)과 'state'(틱 갱신) 몇 프레임을 출력한 뒤 종료합니다.
 * Phase 3 프론트엔드를 만들기 전, 파이프라인 동작을 콘솔로 검증하는 용도.
 *
 * 실행: npm run ws:test     (WS_URL 환경변수로 대상 변경 가능, 기본 http://localhost:3001)
 */
import { io } from 'socket.io-client';

const url = process.env.WS_URL || 'http://localhost:3001';
const FRAMES = Number(process.env.FRAMES) || 5;

const socket = io(url, { reconnection: false, timeout: 5000 });
let frames = 0;

socket.on('connect', () => console.log(`✅ 접속됨: ${socket.id} → ${url}`));

socket.on('init', (d) => {
  console.log(
    `📦 INIT │ 랙 ${d.config.aisles}×${d.config.sidesPerAisle}×${d.config.baysPerSide}×${d.config.levels} │ ` +
      `점유 ${d.occupied.length}셀 │ 크레인 ${d.cranes.length}대 │ mode=${d.meta.mode} speed=${d.meta.speed}x`,
  );
});

socket.on('state', (s) => {
  frames += 1;
  const cranes = s.cranes
    .map((c) => `${c.id}:${c.state[0]}@(${c.x.toFixed(1)},${c.z.toFixed(1)})${c.carrying ? '*' : ''}`)
    .join(' ');
  console.log(
    `🛰  STATE#${frames} t=${s.virtualTime} │ ${cranes} │ ` +
      `완료 ${s.kpi.completed} 🔗${s.cycles.dual} │ ⚡${s.kpi.energyKwh.toFixed(1)}kWh │ ` +
      `Δ셀 ${s.cellDeltas.length} 신규 ${s.orders.length} 완료 ${s.done.length}`,
  );
  if (frames >= FRAMES) {
    console.log('🎉 스모크 테스트 통과 — 파이프라인 정상.');
    socket.close();
    process.exit(0);
  }
});

socket.on('connect_error', (e) => {
  console.error(`❌ 접속 실패: ${e.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 타임아웃 — 서버가 떠 있는지 확인하세요.');
  process.exit(1);
}, 15000);
