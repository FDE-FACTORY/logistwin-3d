// 백엔드 WebSocket 서버 주소 (배포 시 VITE_WS_URL 로 주입 — Vercel→Railway).
export const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

// 등급별 팔레트 색상 (ABC).
export const GRADE_COLOR = { A: '#ef4444', B: '#f59e0b', C: '#3b82f6' };
