import { useRef, useEffect } from 'react';
import { useStore } from '../store.js';
import { warehouseExtent, cellWorldFromId } from '../coords.js';
import { GRADE_COLOR } from '../config.js';
import { theme } from '../theme.js';

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
const STATE_COLOR = theme.crane;

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
      const { config, cells, cranes, exceptions } = useStore.getState();
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = theme.bgDeep;
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
      // 세로(모바일/태블릿) 화면에서는 긴 X축(베이)을 세로로 돌려 화면을 채운다.
      // 라벨은 회전하지 않고 정방향 유지(가독성). project()가 두 방향을 모두 처리.
      const portrait = H > W * 1.1;
      // 화면 크롬(상단 툴바·우측 컨트롤 패널·하단바)을 피해 그릴 가용 영역 계산.
      const wide = W >= 768; // md — 우측 컨트롤 컬럼이 보이는 폭
      const topInset = 60; // 상단 툴바
      const rightInset = wide ? 312 : 0; // 우측 컨트롤 컬럼(운영지표/추이/제어)
      const bottomInset = wide ? 16 : 56; // 데스크톱 범례 여백 / 모바일 하단바
      const margin = Math.min(W, H) < 520 ? 22 : 40;
      const availW = W - rightInset;
      const availH = H - topInset - bottomInset;
      const aw = portrait ? ext.z : ext.x; // 캔버스 가로에 대응하는 월드 폭
      const ah = portrait ? ext.x : ext.z; // 캔버스 세로에 대응하는 월드 높이
      const scale = Math.min((availW - margin * 2) / aw, (availH - margin * 2) / ah);
      const offX = (availW - aw * scale) / 2;
      const offY = topInset + (availH - ah * scale) / 2;
      const project = (wx, wz) =>
        portrait ? [offX + wz * scale, offY + wx * scale] : [offX + wx * scale, offY + wz * scale];

      // 랙 블록 + 통로 라벨
      ctx.lineWidth = 1;
      for (let a = 1; a <= config.aisles; a++) {
        for (const side of ['L', 'R']) {
          const z = (a - 1) * config.aisleSpacing + (side === 'R' ? cs.depth : 0);
          const [ax, ay] = project(-cs.width / 2, z - cs.depth * 0.46);
          const [bx, by] = project(-cs.width / 2 + ext.x, z - cs.depth * 0.46 + cs.depth * 0.92);
          const rx = Math.min(ax, bx);
          const ry = Math.min(ay, by);
          const rw = Math.abs(bx - ax);
          const rh = Math.abs(by - ay);
          ctx.fillStyle = 'rgba(20,26,33,0.6)';
          ctx.strokeStyle = theme.borderStrong;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);
        }
        const zc = (a - 1) * config.aisleSpacing + cs.depth / 2;
        const [lx, ly] = project(-cs.width, zc);
        ctx.fillStyle = theme.textDim;
        ctx.font = '11px ui-sans-serif';
        ctx.textAlign = portrait ? 'center' : 'right';
        ctx.fillText(`A${a}`, portrait ? lx : lx - 8, portrait ? ly - 4 : ly + 4);
      }

      // 팔레트 (점유 셀) — 방향에 따라 가로/세로 치수 교환
      const cellW = Math.max(1.5, cs.width * 0.8 * scale); // 월드 X 방향
      const cellD = Math.max(1.5, cs.depth * 0.66 * scale); // 월드 Z 방향
      const pw = portrait ? cellD : cellW; // 화면 가로
      const ph = portrait ? cellW : cellD; // 화면 세로
      cells.forEach((v, id) => {
        if (!v.occupied) return;
        const p = cellWorldFromId(config, id);
        if (!p) return;
        const [cx, cy] = project(p.x, p.z);
        ctx.fillStyle = GRADE_COLOR[v.grade] || '#64748b';
        ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
      });

      // 예외 셀 강조 (적색 펄스 외곽)
      if (exceptions && exceptions.length) {
        const a = 0.5 + 0.5 * Math.abs(Math.sin(performance.now() / 320));
        ctx.strokeStyle = theme.alarm;
        ctx.lineWidth = 2;
        ctx.globalAlpha = a;
        for (const e of exceptions) {
          const p = cellWorldFromId(config, e.cellId);
          if (!p) continue;
          const [cx, cy] = project(p.x, p.z);
          ctx.strokeRect(cx - pw / 2 - 1.5, cy - ph / 2 - 1.5, pw + 3, ph + 3);
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
      }

      // I/O 출하장 (랙 앞단 라인)
      const [iax, iay] = project(-cs.width * 1.5, 0);
      const [ibx, iby] = project(-cs.width * 1.5, ext.z);
      ctx.strokeStyle = theme.ok;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(iax, iay);
      ctx.lineTo(ibx, iby);
      ctx.stroke();
      ctx.lineWidth = 1;
      const [iox, ioy] = project(-cs.width * 1.5, ext.z / 2);
      ctx.fillStyle = theme.ok;
      ctx.font = '10px ui-sans-serif';
      ctx.textAlign = 'center';
      if (portrait) {
        ctx.textAlign = 'left';
        ctx.fillText('I/O 출하장', Math.min(iax, ibx), ioy - 10);
      } else {
        ctx.save();
        ctx.translate(iox - 14, ioy);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('I/O 출하장', 0, 0);
        ctx.restore();
      }

      // 크레인 (평면 footprint 심볼)
      const map = anim.current;
      const exW = Math.max(4, cs.width * 1.1 * scale); // 월드 X 방향 크기
      const exZ = Math.max(8, cs.depth * 1.8 * scale); // 월드 Z 방향 크기
      const fwS = portrait ? exZ : exW; // 화면 가로
      const fhS = portrait ? exW : exZ; // 화면 세로
      const forkLen = Math.max(4, cs.depth * 0.5 * scale);
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
        const [cx, cy] = project(st.x, tz);
        // footprint
        ctx.fillStyle = col + 'bb';
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.fillRect(cx - fwS / 2, cy - fhS / 2, fwS, fhS);
        ctx.strokeRect(cx - fwS / 2, cy - fhS / 2, fwS, fhS);
        // 마스트 점
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
        // 적재(포크) 표시 — HANDLING/carrying 시 +Z(랙) 방향으로 돌출
        if (c.state === 'HANDLING' || c.carrying) {
          ctx.fillStyle = c.carrying ? '#d97706' : col;
          if (portrait) ctx.fillRect(cx + fwS / 2, cy - 4, forkLen, 8);
          else ctx.fillRect(cx - 4, cy + fhS / 2, 8, forkLen);
        }
        // 라벨
        ctx.fillStyle = col;
        ctx.font = '10px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.id, cx, cy - fhS / 2 - 4);
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
