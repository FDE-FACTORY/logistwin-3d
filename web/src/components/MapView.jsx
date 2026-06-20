import { useRef, useEffect } from 'react';
import { useStore } from '../store.js';
import { theme } from '../theme.js';
import { Panel, Btn, Dot, Label } from './ui.jsx';

/**
 * TMS 배송 관제 — 지도 위 가상 트럭 추적.
 *
 * VITE_KAKAO_MAP_KEY 가 있으면 Kakao 지도에 렌더하고, 없으면 좌표 기반 시뮬 맵으로 폴백합니다.
 * 좌표 규약({lat,lng})이 동일해 키만 넣으면 실지도로 전환됩니다.
 * 컴플라이언스: 위치 수집 동의/업무시간에 따라 위치를 마스킹합니다.
 */
const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY;

// 수도권 대략 경계(시뮬 맵 투영용)
const BOUNDS = { latMin: 37.38, latMax: 37.82, lngMin: 126.70, lngMax: 127.36 };

const STATUS_COLOR = {
  '배송 출발': theme.info,
  '배송 중': theme.caution,
  '센터 복귀': theme.crane.RETURNING,
};

/** 좌표 기반 시뮬 맵 (키 없을 때). */
function FallbackMap() {
  const ref = useRef(null);
  const anim = useRef(new Map());

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
      const { tms } = useStore.getState();
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const pad = 40;
      const px = (lng) => pad + ((lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * (W - pad * 2);
      const py = (lat) => pad + (1 - (lat - BOUNDS.latMin) / (BOUNDS.latMax - BOUNDS.latMin)) * (H - pad * 2);

      ctx.fillStyle = theme.bgDeep;
      ctx.fillRect(0, 0, W, H);

      // 그래티큘(격자) 백드롭
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      for (let i = 1; i < 8; i++) {
        const x = pad + (i / 8) * (W - pad * 2);
        ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke();
      }
      for (let i = 1; i < 6; i++) {
        const y = pad + (i / 6) * (H - pad * 2);
        ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.textFaint;
      ctx.font = '11px ui-sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('수도권 배송권역 (시뮬 맵)', pad, pad - 14);

      if (!tms) {
        ctx.fillStyle = theme.textDim; ctx.textAlign = 'center';
        ctx.fillText('배송 데이터 수신 대기…', W / 2, H / 2);
        raf = requestAnimationFrame(draw);
        return;
      }

      // 경로 폴리라인 + 배송지
      for (const t of tms.trucks) {
        if (!t.route) continue;
        ctx.strokeStyle = theme.borderStrong;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        t.route.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.lng), py(p.lat)) : ctx.lineTo(px(p.lng), py(p.lat))));
        ctx.stroke();
        ctx.fillStyle = theme.textFaint;
        for (let i = 1; i < t.route.length - 1; i++) {
          const p = t.route[i];
          ctx.beginPath(); ctx.arc(px(p.lng), py(p.lat), 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }

      // DC 마커
      const dc = tms.dc;
      const dx = px(dc.lng), dy = py(dc.lat);
      ctx.fillStyle = theme.ok;
      ctx.fillRect(dx - 6, dy - 6, 12, 12);
      ctx.fillStyle = theme.text;
      ctx.font = '11px ui-sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('물류센터', dx, dy - 12);

      // 트럭 (보간)
      const map = anim.current;
      let maskedCount = 0;
      for (const t of tms.trucks) {
        if (t.masked || t.lat == null) { maskedCount += 1; continue; }
        const tx = px(t.lng), ty = py(t.lat);
        let st = map.get(t.id);
        if (!st) { st = { x: tx, y: ty }; map.set(t.id, st); }
        st.x += (tx - st.x) * 0.12;
        st.y += (ty - st.y) * 0.12;
        const col = STATUS_COLOR[t.status] || theme.info;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(st.x, st.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = theme.bgDeep; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = theme.textDim;
        ctx.font = '10px ui-sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${t.id} · ${t.etaMin}분`, st.x + 8, st.y + 3);
      }

      // 마스킹된 차량 안내
      if (maskedCount > 0) {
        ctx.fillStyle = theme.textFaint;
        ctx.textAlign = 'left';
        ctx.fillText(`위치 비공개 ${maskedCount}대 (동의 미설정 또는 업무시간 외)`, pad, H - pad + 22);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 block h-full w-full" />;
}

/** Kakao 지도 (키 있을 때). */
function KakaoMap() {
  const ref = useRef(null);
  useEffect(() => {
    const id = 'kakao-sdk';
    function init() {
      const kakao = window.kakao;
      if (!kakao?.maps) return;
      kakao.maps.load(() => {
        const map = new kakao.maps.Map(ref.current, {
          center: new kakao.maps.LatLng(37.4563, 126.7052),
          level: 9,
        });
        const markers = new Map();
        const polylines = new Map();
        const render = (tms) => {
          if (!tms) return;
          for (const t of tms.trucks) {
            if (t.masked || t.lat == null) {
              markers.get(t.id)?.setMap(null);
              polylines.get(t.id)?.setMap(null);
              continue;
            }
            const pos = new kakao.maps.LatLng(t.lat, t.lng);
            let m = markers.get(t.id);
            if (!m) { m = new kakao.maps.Marker({ position: pos, title: `${t.id} ${t.plate}` }); markers.set(t.id, m); }
            m.setPosition(pos); m.setMap(map);
            if (t.route) {
              polylines.get(t.id)?.setMap(null);
              const pl = new kakao.maps.Polyline({
                path: t.route.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
                strokeWeight: 3, strokeColor: '#2f81f7', strokeOpacity: 0.7,
              });
              pl.setMap(map); polylines.set(t.id, pl);
            }
          }
        };
        const unsub = useStore.subscribe((state) => render(state.tms));
        render(useStore.getState().tms);
        ref.current.__unsub = unsub;
      });
    }
    if (window.kakao?.maps) init();
    else {
      let s = document.getElementById(id);
      if (!s) {
        s = document.createElement('script');
        s.id = id;
        s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`;
        s.onload = init;
        document.head.appendChild(s);
      } else s.addEventListener('load', init);
    }
    return () => { ref.current?.__unsub?.(); };
  }, []);
  return <div ref={ref} className="absolute inset-0 h-full w-full" />;
}

/** 트럭 목록 + 컴플라이언스 제어 패널. */
function TmsPanel() {
  const tms = useStore((s) => s.tms);
  const sendCommand = useStore((s) => s.sendCommand);
  if (!tms) return null;
  return (
    <div className="pointer-events-auto absolute right-3 top-16 hidden w-[300px] flex-col gap-3 md:flex" style={{ maxHeight: 'calc(100% - 5rem)' }}>
      <Panel title="배송 차량 현황">
        <div className="space-y-2">
          {tms.trucks.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Dot color={t.masked ? theme.textFaint : STATUS_COLOR[t.status] || theme.info} />
                <span className="tnum" style={{ color: theme.text }}>{t.id}</span>
                <span style={{ color: theme.textDim }}>{t.status}</span>
              </div>
              <span style={{ color: t.masked ? theme.textFaint : theme.textDim }}>
                {t.masked ? '위치 비공개' : `${t.etaMin}분`}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="개인위치정보 동의">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: theme.textDim }}>위치 수집 동의</span>
          <Btn variant={tms.consentGlobal ? 'primary' : 'danger'} onClick={() => sendCommand({ type: 'SET_CONSENT', value: !tms.consentGlobal })}>
            {tms.consentGlobal ? '동의됨' : '미동의'}
          </Btn>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: theme.textDim }}>
          동의를 해제하면 배송 위치를 마스킹합니다. 업무시간(08~20시) 외에는 자동으로 위치 수집을 차단합니다.
        </p>
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <Dot color={tms.businessHours ? theme.ok : theme.caution} />
          <span style={{ color: theme.textDim }}>{tms.businessHours ? '업무시간 — 위치 수집 가능' : '업무시간 외 — 위치 수집 차단'}</span>
        </div>
      </Panel>

      {!KAKAO_KEY && (
        <Panel>
          <p className="text-[11px] leading-relaxed" style={{ color: theme.textFaint }}>
            현재 시뮬 맵으로 표시 중입니다. <span style={{ color: theme.textDim }}>VITE_KAKAO_MAP_KEY</span>를 설정하면 Kakao 실지도로 전환됩니다.
          </p>
        </Panel>
      )}
    </div>
  );
}

export default function MapView() {
  return (
    <div className="absolute inset-0">
      {KAKAO_KEY ? <KakaoMap /> : <FallbackMap />}
      <TmsPanel />
    </div>
  );
}
