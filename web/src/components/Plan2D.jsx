import { useRef, useEffect } from 'react';
import { useStore } from '../store.js';
import { warehouseExtent, cellWorldFromId } from '../coords.js';
import { GRADE_COLOR } from '../config.js';

/**
 * 2D 평면도 뷰 (Canvas2D) — 엔지니어링 도면 느낌의 상단 직교 표현.
 *
 * 모든 요소를 평면 심볼로 렌더:
 *   - 랙 블록 : 통로별·면별 평면 사각형(외곽선 + 옅은 면)
 *   - 팔레트  : 점유 셀을 등급색 작은 셀로
 *   - 크레인  : 통로를 가로지르는 footprint 심볼(상태색) + 마스트 점 + 적재/포크 표시
 *   - I/O     : 좌측 출하장 라인
 *   - 통로 라벨(A1..)
 *
 * 좌표: 월드 X(베이) → 캔버스 가로, 월드 Z(통로 횡) → 캔버스 세로. 화면에 맞춰 fit.
 * 크레인 위치는 매 프레임 보간(rAF)하여 부드럽게 주행.
 */
const STATE_COLOR = { IDLE: '#64748b', TRAVELING: '#22d3ee', HANDLING: '#f59e0b', RETURNING: '#a78bfa' };

export default function Plan2D() {
  const ref = useRef(null);
  const anim = useRef(new Map()); // craneId -> {x}

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let raf;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const { config, cells, cranes } = useStore.getState();
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#080c16';
      ctx.fillRect(0, 0, W, H);

      if (!config) {
        ctx.fillStyle = '#64748b';
        ctx.font = '14px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('서버 연결 대기…', W / 2, H / 2);
        raf = requestAnimationFrame(draw);
        return;
      }

      const ext = warehouseExtent(config);
      const cs = config.cellSize;
      const margin = 70;
      const scale = Math.min((W - margin * 2) / ext.x, (H - margin * 2) / ext.z);
      const offX = (W - ext.x * scale) / 2;
      const offY = (H - ext.z * scale) / 2;
      const sx = (wx) => offX + wx * scale;
      const sy = (wz) => offY + wz * scale;

      // 랙 블록 + 통로 라벨
      ctx.lineWidth = 1;
      for (let a = 1; a <= config.aisles; a++) {
        for (const side of ['L', 'R']) {
          const z = (a - 1) * config.aisleSpacing + (side === 'R' ? cs.depth : 0);
          const x0 = sx(-cs.width / 2);
          const y0 = sy(z - cs.depth * 0.46);
          ctx.fillStyle = 'rgba(22,33,59,0.55)';
          ctx.strokeStyle = '#34507f';
          ctx.fillRect(x0, y0, ext.x * scale, cs.depth * 0.92 * scale);
          ctx.strokeRect(x0, y0, ext.x * scale, cs.depth * 0.92 * scale);
        }
        const zc = (a - 1) * config.aisleSpacing + cs.depth / 2;
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px ui-sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`A${a}`, sx(-cs.width) - 8, sy(zc) + 4);
      }

      // 팔레트 (점유 셀)
      const pw = Math.max(1.5, cs.width * 0.8 * scale);
      const ph = Math.max(1.5, cs.depth * 0.66 * scale);
      cells.forEach((v, id) => {
        if (!v.occupied) return;
        const p = cellWorldFromId(config, id);
        if (!p) return;
        ctx.fillStyle = GRADE_COLOR[v.grade] || '#64748b';
        ctx.fillRect(sx(p.x) - pw / 2, sy(p.z) - ph / 2, pw, ph);
      });

      // I/O 출하장 (좌측 라인)
      ctx.fillStyle = '#10b981';
      ctx.fillRect(sx(-cs.width * 1.5) - 2, offY - 4, 5, ext.z * scale + 8);
      ctx.fillStyle = '#34d399';
      ctx.font = '10px ui-sans-serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(sx(-cs.width * 1.5) - 14, offY + (ext.z * scale) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('I/O 출하장', 0, 0);
      ctx.restore();

      // 크레인 (평면 footprint 심볼)
      const map = anim.current;
      for (const c of cranes) {
        const tx = c.x * cs.width;
        const tz = (c.aisle - 1) * config.aisleSpacing + cs.depth / 2;
        let st = map.get(c.id);
        if (!st) {
          st = { x: tx };
          map.set(c.id, st);
        }
        st.x += (tx - st.x) * 0.16; // 부드러운 주행 보간
        const col = STATE_COLOR[c.state] || '#94a3b8';
        const fw = Math.max(4, cs.width * 1.1 * scale);
        const fh = Math.max(8, cs.depth * 1.8 * scale);
        const cx = sx(st.x);
        const cy = sy(tz);
        // footprint
        ctx.fillStyle = col + 'bb';
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.fillRect(cx - fw / 2, cy - fh / 2, fw, fh);
        ctx.strokeRect(cx - fw / 2, cy - fh / 2, fw, fh);
        // 마스트 점
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
        // 적재(포크) 표시 — HANDLING/carrying 시 측면으로 돌출
        if (c.state === 'HANDLING' || c.carrying) {
          ctx.fillStyle = c.carrying ? '#d97706' : col;
          ctx.fillRect(cx - 4, cy + fh / 2, 8, Math.max(4, cs.depth * 0.5 * scale));
        }
        // 라벨
        ctx.fillStyle = col;
        ctx.font = '10px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.id, cx, cy - fh / 2 - 4);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 block h-full w-full" />;
}
