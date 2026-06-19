import { theme } from './theme.js';

// 백엔드 WebSocket 서버 주소 (배포 시 VITE_WS_URL 로 주입 — Vercel→Railway).
export const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

// 등급별 팔레트 색상 (ABC) — 산업용 테마 공유.
export const GRADE_COLOR = theme.grade;
