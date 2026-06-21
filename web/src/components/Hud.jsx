import { useState } from 'react';
import { useStore } from '../store.js';
import { theme } from '../theme.js';
import { GRADE_COLOR } from '../config.js';
import { Panel, Stat, Label, Dot, Btn } from './ui.jsx';
import EsgChart from './EsgChart.jsx';

const STATE_LABEL = { IDLE: '대기', TRAVELING: '이동', HANDLING: '작업', RETURNING: '복귀' };

/** 상단 바 — 식별·연결·뷰 전환·크레인. */
function TopBar() {
  const connected = useStore((s) => s.connected);
  const vt = useStore((s) => s.virtualTime);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const model = useStore((s) => s.craneModelInfo);
  const config = useStore((s) => s.config);

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5"
      style={{ background: `${theme.bgDeep}e6`, borderColor: theme.border }}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold tracking-tight" style={{ color: theme.text }}>
          LogisTwin <span style={{ color: theme.info }}>3D</span>
        </span>
        <span className="hidden text-xs sm:inline" style={{ color: theme.textDim }}>
          실시간 AS/RS 디지털 트윈
        </span>
        <span className="hidden items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold lg:inline-flex" style={{ background: `${theme.ok}1f`, color: theme.ok }}>
          복합명령 ▼34.5% 주행
        </span>
      </div>

      <div className="order-3 flex rounded-md border p-0.5 sm:order-2" style={{ borderColor: theme.border }}>
        {[['3D', '3D 뷰'], ['2D', '평면 뷰'], ['MAP', '배송 관제']].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="rounded px-3 py-1 text-xs font-semibold transition"
            style={
              view === v
                ? { background: theme.info, color: '#06121f' }
                : { background: 'transparent', color: theme.textDim }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="order-2 flex items-center gap-3 sm:order-3">
        {model && (
          <span className="hidden items-center gap-1 text-xs md:inline-flex" style={{ color: theme.textDim }}>
            <span style={{ color: theme.caution }}>{model.name}</span>
            {config && <span style={{ color: theme.textFaint }}>· {config.aisles}통로 {config.levels}층</span>}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs">
          <Dot color={connected ? theme.ok : theme.alarm} />
          <span style={{ color: theme.textDim }}>{connected ? '실시간 연결' : '연결 대기'}</span>
        </span>
        <span className="tnum text-xs" style={{ color: theme.text }}>
          {vt}
        </span>
      </div>
    </div>
  );
}

/** 예외 경보 — 활성 예외를 상단에 띄우고 조치(해소) 제공. */
function ExceptionAlert() {
  const exceptions = useStore((s) => s.exceptions);
  const sendCommand = useStore((s) => s.sendCommand);
  if (!exceptions.length) return null;
  return (
    <div className="pointer-events-auto absolute left-4 top-16 w-[min(420px,calc(100vw-2rem))] space-y-2">
      {exceptions.slice(0, 3).map((e) => (
        <div
          key={e.id}
          className="flex items-center gap-3 rounded-md border px-3 py-2"
          style={{ background: `${theme.alarm}1a`, borderColor: `${theme.alarm}80` }}
        >
          <Dot color={theme.alarm} pulse />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold" style={{ color: theme.alarm }}>
              {e.label}
            </div>
            <div className="truncate text-[11px]" style={{ color: theme.textDim }}>
              {e.detail}
            </div>
          </div>
          <Btn variant="danger" onClick={() => sendCommand({ type: 'RESOLVE_EXCEPTION', id: e.id })}>
            조치 완료
          </Btn>
        </div>
      ))}
    </div>
  );
}

/** 핵심 차별점 — 복합명령(Dual-Command) 최적화 성과 (검증 벤치마크 + 실시간 페어링). */
function OptScorecard() {
  const cycles = useStore((s) => s.cycles);
  const dualShare =
    cycles && cycles.single + cycles.dual > 0 ? Math.round((cycles.dual / (cycles.single + cycles.dual)) * 100) : 0;
  const Metric = ({ label, pct, detail }) => (
    <div className="flex flex-col">
      <Label>{label}</Label>
      <span className="tnum text-2xl font-bold leading-none" style={{ color: theme.ok }}>
        ▼{pct}
      </span>
      <span className="mt-1 text-[10px] tnum" style={{ color: theme.textFaint }}>
        {detail}
      </span>
    </div>
  );
  return (
    <Panel
      title="복합명령 최적화"
      right={
        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: `${theme.ok}22`, color: theme.ok }}>
          검증
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Metric label="명령당 주행" pct="34.5%" detail="15.8 → 10.3 m" />
        <Metric label="전력 · 탄소" pct="31.0%" detail="584 → 403 kWh" />
      </div>
      <div className="mt-2.5 border-t pt-2" style={{ borderColor: theme.border }}>
        <div className="flex items-center justify-between text-[11px]">
          <span style={{ color: theme.textDim }}>실시간 페어링률</span>
          <span className="tnum font-semibold" style={{ color: theme.info }}>{dualShare}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: theme.border }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${dualShare}%`, background: theme.info }} />
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: theme.textFaint }}>
          입고 직후 같은 통로 출고를 연계해 공차 복귀를 제거 — 사이클당 2건 처리. Bozer &amp; White(1984) 모델 검증.
        </p>
      </div>
    </Panel>
  );
}

/** OEE(설비종합효율) — Industry 4.0 대표 KPI: 가용성×성능×품질. */
function OeeCard() {
  const oee = useStore((s) => s.oee);
  if (!oee) return null;
  const pct = (v) => Math.round(v * 100);
  const bar = (label, v, color) => (
    <div>
      <div className="flex justify-between text-[11px]">
        <span style={{ color: theme.textDim }}>{label}</span>
        <span className="tnum font-semibold" style={{ color }}>{pct(v)}%</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full" style={{ background: theme.border }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct(v)}%`, background: color }} />
      </div>
    </div>
  );
  const c = oee.value >= 0.85 ? theme.ok : oee.value >= 0.6 ? theme.caution : theme.alarm;
  return (
    <Panel
      title="설비종합효율 (OEE)"
      right={<span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: `${theme.info}1f`, color: theme.info }}>Industry 4.0</span>}
    >
      <div className="flex items-end gap-2">
        <span className="tnum text-3xl font-bold leading-none" style={{ color: c }}>
          {pct(oee.value)}<span className="text-base">%</span>
        </span>
        <span className="mb-1 text-[10px]" style={{ color: theme.textFaint }}>가용성 × 성능 × 품질</span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {bar('가용성 Availability', oee.availability, theme.info)}
        {bar('성능 Performance', oee.performance, theme.caution)}
        {bar('품질 Quality', oee.quality, theme.ok)}
      </div>
    </Panel>
  );
}

/** ROI — 복합명령 절감(31% 전력)을 ₩/년으로 환산(FDE 비즈니스 임팩트). */
function RoiCard() {
  const RATE = 140; // ₩/kWh (산업용 평균)
  const HOURS = 8760; // 24h 가동
  const kwhSavedYr = ((584 - 403) / 2) * HOURS; // 벤치마크: Single 584 / Dual 403 kWh / 2h
  const co2SavedYr = (((258.5 - 178.4) / 2) * HOURS) / 1000; // 톤/년
  const wonYr = kwhSavedYr * RATE;
  const won = wonYr >= 1e8 ? `${(wonYr / 1e8).toFixed(2)}억` : `${Math.round(wonYr / 1e6)}백만`;
  return (
    <Panel
      title="ROI · 연간 절감"
      right={<span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: `${theme.ok}1f`, color: theme.ok }}>FDE</span>}
    >
      <div className="flex items-end gap-1">
        <span className="tnum text-2xl font-bold leading-none" style={{ color: theme.ok }}>₩{won}</span>
        <span className="mb-0.5 text-[11px]" style={{ color: theme.textDim }}>/ 년</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex flex-col">
          <span style={{ color: theme.textDim }}>전력 절감</span>
          <span className="tnum font-semibold" style={{ color: theme.caution }}>{Math.round(kwhSavedYr).toLocaleString()} kWh</span>
        </div>
        <div className="flex flex-col">
          <span style={{ color: theme.textDim }}>탄소 절감</span>
          <span className="tnum font-semibold" style={{ color: theme.ok }}>{Math.round(co2SavedYr)} tCO₂</span>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: theme.textFaint }}>
        복합명령으로 공차 주행을 제거해 전력 31% 절감. 전력단가 ₩{RATE}/kWh·24h 가동 기준 연간 환산.
      </p>
    </Panel>
  );
}

/** 설비 건강도 · 예지보전 — 크레인별 건강도 + 임계 시 정비 권장(고장 전). */
function FleetHealth() {
  const cranes = useStore((s) => s.cranes);
  const sendCommand = useStore((s) => s.sendCommand);
  if (!cranes.length) return null;
  const worst = Math.min(...cranes.map((c) => (c.health ?? 100)));
  return (
    <Panel
      title="설비 건강도 · 예지보전"
      right={<span className="text-[11px] font-semibold" style={{ color: worst < 32 ? theme.caution : theme.ok }}>{worst < 32 ? '정비 권장' : '정상'}</span>}
    >
      <div className="space-y-1.5">
        {cranes.map((c) => {
          const h = c.health ?? 100;
          const color = c.fault ? theme.alarm : h < 32 ? theme.caution : h < 60 ? theme.caution : theme.ok;
          return (
            <div key={c.id} className="flex items-center gap-2">
              <span className="tnum w-6 text-xs font-semibold" style={{ color: theme.text }}>{c.id}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: theme.border }}>
                <div className="h-full rounded-full" style={{ width: `${h}%`, background: color }} />
              </div>
              <span className="tnum w-9 text-right text-[11px]" style={{ color }}>{h}%</span>
              {(c.fault || h < 32) && (
                <button
                  onClick={() => sendCommand({ type: 'CRANE_MAINTENANCE', id: c.id })}
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ background: `${theme.info}22`, color: theme.info }}
                >
                  정비
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: theme.textFaint }}>
        가동 마모로 건강도 하락 → 임계 진입 시 고장 전 정비 권장. 미조치 시 실제 고장(에러코드)으로 전이.
      </p>
    </Panel>
  );
}

/** What-if 시나리오 — 크레인 수·명령 모드·수요를 바꿔 KPI/비용 영향을 즉시 투영(의사결정 도구). */
function WhatIfPanel() {
  const config = useStore((s) => s.config);
  const base = config?.aisles || 5;
  const [cranes, setCranes] = useState(base);
  const [mode, setMode] = useState('dual');
  const [demand, setDemand] = useState(1.0);
  const CMD_AT_100 = 10_450_000; // 기준(복합·base크레인·보통) 연간 명령
  const ePerCmd = mode === 'dual' ? 0.169 : 0.245; // kWh/명령(벤치마크)
  const tputIndex = 100 * Math.pow(cranes / base, 0.85) * demand;
  const cmdYr = CMD_AT_100 * (tputIndex / 100);
  const energyYr = cmdYr * ePerCmd;
  const wonYr = energyYr * 140;
  // 기준 시나리오(복합·base·1.0)
  const baseEnergy = CMD_AT_100 * 0.169;
  const dWon = (energyYr - baseEnergy) * 140;
  const fmt = (w) => (Math.abs(w) >= 1e8 ? `${(w / 1e8).toFixed(2)}억` : `${Math.round(w / 1e6)}백만`);
  const seg = (val, set, opts) => (
    <div className="flex gap-1">
      {opts.map(([v, l]) => (
        <button
          key={l}
          onClick={() => set(v)}
          className="flex-1 rounded px-1 py-1 text-[11px] font-semibold transition"
          style={val === v ? { background: theme.info, color: '#06121f' } : { background: theme.bgDeep, color: theme.textDim }}
        >
          {l}
        </button>
      ))}
    </div>
  );
  return (
    <Panel title="What-if 시나리오" right={<span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: theme.textFaint }}>투영</span>}>
      <div className="space-y-2.5">
        <div>
          <Label>크레인 수</Label>
          <div className="mt-1 grid grid-cols-6 gap-1">
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <button key={n} onClick={() => setCranes(n)} className="tnum rounded py-1 text-[11px] font-semibold transition" style={cranes === n ? { background: theme.info, color: '#06121f' } : { background: theme.bgDeep, color: theme.textDim }}>{n}</button>
            ))}
          </div>
        </div>
        <div>
          <Label>명령 모드</Label>
          <div className="mt-1">{seg(mode, setMode, [['dual', '복합 Dual'], ['single', '단일 Single']])}</div>
        </div>
        <div>
          <Label>수요</Label>
          <div className="mt-1">{seg(demand, setDemand, [[0.7, '낮음'], [1.0, '보통'], [1.4, '피크']])}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2.5" style={{ borderColor: theme.border }}>
        <div className="flex flex-col">
          <Label>예상 처리량 지수</Label>
          <span className="tnum text-lg font-bold leading-none" style={{ color: theme.ok }}>{Math.round(tputIndex)}</span>
        </div>
        <div className="flex flex-col">
          <Label>명령당 전력</Label>
          <span className="tnum text-lg font-bold leading-none" style={{ color: theme.caution }}>{ePerCmd}<span className="text-[10px] font-normal"> kWh</span></span>
        </div>
        <div className="col-span-2 flex items-baseline justify-between rounded-md px-2.5 py-1.5" style={{ background: theme.bgDeep }}>
          <span className="text-[11px]" style={{ color: theme.textDim }}>연간 전력비 (기준 대비)</span>
          <span className="tnum text-sm font-bold" style={{ color: dWon > 0 ? theme.alarm : theme.ok }}>
            ₩{fmt(wonYr)} <span className="text-[10px] font-normal" style={{ color: theme.textFaint }}>({dWon >= 0 ? '+' : '−'}₩{fmt(Math.abs(dWon))})</span>
          </span>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: theme.textFaint }}>
        기준: 복합 · {base}크레인 · 보통. 처리량은 크레인 수(체감)·수요로, 전력은 명령당 효율로 투영.
      </p>
    </Panel>
  );
}

/** 우측 컬럼 — 탭(운영/분석/시나리오)으로 KPI·OEE·ROI·예지보전·What-if 구성. */
function ControlColumn() {
  const kpi = useStore((s) => s.kpi);
  const cycles = useStore((s) => s.cycles);
  const history = useStore((s) => s.kpiHistory);
  const sendCommand = useStore((s) => s.sendCommand);
  const [tab, setTab] = useState('ops');
  if (!kpi) return null;

  const dualShare =
    cycles && cycles.single + cycles.dual > 0 ? Math.round((cycles.dual / (cycles.single + cycles.dual)) * 100) : 0;

  const tabs = [['ops', '운영'], ['analytics', '분석'], ['scenario', '시나리오']];

  return (
    <div className="pointer-events-auto absolute right-3 top-16 hidden w-[300px] flex-col gap-3 overflow-y-auto md:flex" style={{ maxHeight: 'calc(100% - 5rem)' }}>
      <div className="flex rounded-md border p-0.5" style={{ borderColor: theme.border, background: `${theme.bgDeep}cc` }}>
        {tabs.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="flex-1 rounded px-2 py-1 text-xs font-semibold transition"
            style={tab === k ? { background: theme.info, color: '#06121f' } : { color: theme.textDim }}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'ops' && (
        <>
          <OptScorecard />
          <Panel title="운영 지표">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Stat label="처리량" value={kpi.completed} unit="건" color={theme.ok} />
              <Stat label="재고율" value={(kpi.fillRate * 100).toFixed(1)} unit="%" />
              <Stat label="전력" value={kpi.energyKwh.toFixed(1)} unit="kWh" color={theme.caution} />
              <Stat label="탄소" value={kpi.co2Kg.toFixed(1)} unit="kg" />
              <Stat label="주행" value={kpi.totalTravelM.toLocaleString()} unit="m" />
              <Stat label="복합명령" value={cycles ? cycles.dual : 0} unit={`· ${dualShare}%`} color={theme.info} />
            </div>
          </Panel>
          <Panel title="추이">
            <div className="grid grid-cols-2 gap-3">
              <EsgChart values={history.map((h) => h.energy)} color={theme.caution} label="전력 kWh" current={kpi.energyKwh.toFixed(0)} />
              <EsgChart values={history.map((h) => h.done)} color={theme.ok} label="처리량 건" current={String(kpi.completed)} />
            </div>
          </Panel>
          <Panel title="운영 제어">
            <Btn variant="action" full onClick={() => sendCommand({ type: 'SLOTTING' })}>적재 효율화 실행</Btn>
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: theme.textDim }}>
              회전이 빠른 A급 상품을 출하장과 가까운 자리로 다시 배치해 크레인 주행과 전력을 줄입니다.
            </p>
          </Panel>
        </>
      )}

      {tab === 'analytics' && (
        <>
          <OeeCard />
          <RoiCard />
          <FleetHealth />
        </>
      )}

      {tab === 'scenario' && <WhatIfPanel />}
    </div>
  );
}

/** 작업 로그 (좌하단, 데스크톱). */
function WorkLog() {
  const orders = useStore((s) => s.orders);
  const events = useStore((s) => s.events);
  // 관제 이벤트와 작업을 합쳐 최신순 (이벤트 우선 표시는 색으로 구분)
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 hidden w-[320px] lg:block">
      <Panel title="작업 로그">
        <div className="max-h-44 space-y-1 overflow-hidden text-[11px]">
          {events.slice(0, 3).map((e, i) => (
            <div key={`ev-${i}`} className="flex items-center gap-2">
              <span className="tnum" style={{ color: theme.textFaint }}>{e.t}</span>
              <span style={{ color: e.level === 'alarm' ? theme.alarm : theme.ok }}>{e.msg}</span>
            </div>
          ))}
          {orders.slice(0, 8).map((o, i) => (
            <div key={`o-${i}`} className="flex items-center gap-2">
              <span className="tnum" style={{ color: theme.textFaint }}>{o.t}</span>
              {o.kind === 'new' ? (
                <span style={{ color: o.type === 'INBOUND' ? theme.info : theme.crane.RETURNING }}>
                  {o.type === 'INBOUND' ? '입고' : '출고'}
                </span>
              ) : (
                <span style={{ color: theme.ok }}>{o.crane} 완료{o.cycle === 'DUAL' ? ' · 복합' : ''}</span>
              )}
              <span className="truncate" style={{ color: theme.textDim }}>{o.sku || o.id}</span>
            </div>
          ))}
          {orders.length === 0 && <div style={{ color: theme.textFaint }}>작업 대기 중입니다.</div>}
        </div>
      </Panel>
    </div>
  );
}

/** 모바일 하단 요약 바 (md 미만). */
function MobileBar() {
  const kpi = useStore((s) => s.kpi);
  const sendCommand = useStore((s) => s.sendCommand);
  if (!kpi) return null;
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t px-3 py-2 md:hidden"
      style={{ background: `${theme.bgDeep}f2`, borderColor: theme.border }}
    >
      <div className="flex gap-4">
        <Stat label="처리량" value={kpi.completed} unit="건" color={theme.ok} />
        <Stat label="전력" value={kpi.energyKwh.toFixed(0)} unit="kWh" color={theme.caution} />
        <Stat label="재고" value={(kpi.fillRate * 100).toFixed(0)} unit="%" />
      </div>
      <Btn variant="action" onClick={() => sendCommand({ type: 'SLOTTING' })}>
        적재 효율화
      </Btn>
    </div>
  );
}

/** 범례 (우하단, 데스크톱). */
function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 hidden md:block">
      <Panel>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: theme.textDim }}>
          <Label>등급</Label>
          {Object.entries(GRADE_COLOR).map(([g, c]) => (
            <span key={g} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
              {g}
            </span>
          ))}
          <span className="mx-1" style={{ color: theme.border }}>│</span>
          <Label>크레인</Label>
          {Object.entries(theme.crane).map(([st, c]) => (
            <span key={st} className="flex items-center gap-1">
              <Dot color={c} />
              {STATE_LABEL[st]}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/** 뷰·인스펙션 패널 — 카메라 프리셋 + 통로 드릴인 + 층 isolate (3D 전용). */
function InspectorPanel() {
  const config = useStore((s) => s.config);
  const view = useStore((s) => s.view);
  const floor = useStore((s) => s.floorFilter);
  const setFloor = useStore((s) => s.setFloorFilter);
  const focus = useStore((s) => s.cameraFocus);
  const setFocus = useStore((s) => s.setCameraFocus);
  if (view !== '3D' || !config) return null;
  const aisles = Array.from({ length: config.aisles }, (_, i) => i + 1);
  const floors = [0, ...Array.from({ length: config.levels }, (_, i) => config.levels - i)];
  const sel = (active) => (active ? { background: theme.info, color: '#06121f' } : { color: theme.textDim });
  return (
    <div className="pointer-events-auto absolute left-3 top-1/2 hidden -translate-y-1/2 md:block">
      <Panel title="뷰 · 인스펙션">
        <div className="space-y-2.5" style={{ width: 138 }}>
          <div>
            <Label>카메라</Label>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {[['overview', '전경'], ['dock', '도크'], ['staging', '상차장']].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setFocus(k)}
                  className="flex-1 rounded px-2 py-1 text-xs font-semibold transition"
                  style={sel(focus === k)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>크레인 시점 (추적)</Label>
            <div className="mt-1 grid grid-cols-4 gap-1">
              {aisles.map((n) => (
                <button
                  key={n}
                  onClick={() => setFocus(`crane:${n}`)}
                  className="tnum rounded px-1 py-1 text-xs font-semibold transition"
                  style={sel(focus === `crane:${n}`)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>층</Label>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {floors.map((n) => (
                <button
                  key={n}
                  onClick={() => setFloor(n)}
                  className="tnum rounded px-1 py-1 text-xs font-semibold transition"
                  style={sel(floor === n)}
                >
                  {n === 0 ? '전체' : n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** 온보딩 인트로 — 첫 진입 시 프로젝트 정체성·핵심 강점·동선을 제시(평가자 컨텍스트). */
function IntroOverlay() {
  const open = useStore((s) => s.introOpen);
  const close = useStore((s) => s.closeIntro);
  if (!open) return null;
  const features = [
    ['결정론적 시뮬레이션 엔진', '포아송 도착·ABC 파레토·시간대 수요 + 크레인 상태머신 (시드 고정 재현)'],
    ['복합명령 최적화 · 검증', '공차 복귀 제거로 주행 34.5%·전력 31% 절감 (Bozer & White 모델)'],
    ['실시간 풀스택 트윈', 'WebSocket 스트리밍 — 크레인·컨베이어·지게차·트럭 흐름 실시간'],
    ['인스펙션 · ESG · TMS', '통로 드릴인·층 isolate, 전력·탄소, 배송 관제(위치정보 컴플라이언스)'],
  ];
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(6,9,13,0.74)' }}
    >
      <div className="w-[min(580px,calc(100vw-2rem))] rounded-lg border shadow-2xl" style={{ background: theme.panel, borderColor: theme.borderStrong }}>
        <div className="border-b px-5 py-4" style={{ borderColor: theme.border }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold tracking-tight" style={{ color: theme.text }}>
              LogisTwin <span style={{ color: theme.info }}>3D</span>
            </span>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: `${theme.ok}1f`, color: theme.ok }}>
              Real-time Digital Twin
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: theme.textDim }}>
            스태커 크레인(AS/RS) 자동창고를 실시간으로 시뮬레이션·시각화하고, 복합명령으로 주행·에너지를 최적화하는 디지털 트윈.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2.5 px-5 py-4 sm:grid-cols-2">
          {features.map(([t, d], i) => (
            <div key={i} className="rounded-md border p-3" style={{ borderColor: theme.border, background: theme.bgDeep }}>
              <div className="text-xs font-semibold" style={{ color: theme.text }}>{t}</div>
              <div className="mt-1 text-[11px] leading-relaxed" style={{ color: theme.textDim }}>{d}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.border }}>
          <span className="text-[11px]" style={{ color: theme.textFaint }}>
            좌측 <b style={{ color: theme.textDim }}>통로</b> 버튼으로 랙 사이를 들여다보거나, 상단에서 평면·배송 뷰로 전환하세요.
          </span>
          <Btn variant="primary" onClick={close}>둘러보기 시작</Btn>
        </div>
      </div>
    </div>
  );
}

/** 크레인 진단 — 추적 중인 스태커 크레인의 실시간 상태·위치·사이클·고장코드·최근 로그(하단 중앙). */
function CraneDiagnostics() {
  const focus = useStore((s) => s.cameraFocus);
  const cranes = useStore((s) => s.cranes);
  const orders = useStore((s) => s.orders);
  const sendCommand = useStore((s) => s.sendCommand);
  const view = useStore((s) => s.view);
  if (view !== '3D' || !focus || !focus.startsWith('crane:')) return null;
  const n = parseInt(focus.split(':')[1], 10);
  const id = `C${n}`;
  const cr = cranes.find((c) => c.id === id || c.aisle === n);
  if (!cr) return null;
  const log = orders.filter((o) => o.kind === 'done' && o.crane === id).slice(0, 4);
  const field = (label, value, color) => (
    <div className="flex flex-col">
      <Label>{label}</Label>
      <span className="text-xs font-semibold" style={{ color: color || theme.text }}>{value}</span>
    </div>
  );
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 hidden w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 md:block">
      <Panel
        title={`${id} 크레인 진단 · 실시간`}
        right={
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: cr.fault ? theme.alarm : theme.ok }}>
            <Dot color={cr.fault ? theme.alarm : theme.ok} pulse={!!cr.fault} />
            {cr.fault ? '고장' : '정상 가동'}
          </span>
        }
      >
        <div className="flex items-center gap-4">
          {field('상태', STATE_LABEL[cr.state] || cr.state)}
          {field('위치', `베이 ${Math.round(cr.x)} · L${Math.max(1, Math.round(cr.z))}`)}
          {field('사이클', cr.cycle === 'DUAL' ? '복합' : cr.cycle === 'SINGLE' ? '단일' : '—', cr.cycle === 'DUAL' ? theme.info : theme.text)}
          {field('적재', cr.carrying ? '보유' : '공차', cr.carrying ? theme.caution : theme.textDim)}
          {field('건강도', `${cr.health ?? 100}%`, (cr.health ?? 100) < 32 ? theme.caution : theme.ok)}
        </div>
        {cr.fault ? (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-md border px-3 py-2" style={{ background: `${theme.alarm}1a`, borderColor: `${theme.alarm}80` }}>
            <div className="min-w-0">
              <div className="text-xs font-bold" style={{ color: theme.alarm }}>⚠ {cr.fault.code} · {cr.fault.label}</div>
              <div className="truncate text-[11px]" style={{ color: theme.textDim }}>권장 조치: {cr.fault.hint}</div>
            </div>
            <Btn variant="danger" onClick={() => sendCommand({ type: 'RESOLVE_CRANE_FAULT', id })}>복구</Btn>
          </div>
        ) : (cr.health ?? 100) < 32 ? (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-md border px-3 py-2" style={{ background: `${theme.caution}1a`, borderColor: `${theme.caution}80` }}>
            <div className="min-w-0">
              <div className="text-xs font-bold" style={{ color: theme.caution }}>⚠ 예지보전 — 건강도 {cr.health}%</div>
              <div className="truncate text-[11px]" style={{ color: theme.textDim }}>고장 전 정비 권장 (미조치 시 고장 전이)</div>
            </div>
            <Btn variant="action" onClick={() => sendCommand({ type: 'CRANE_MAINTENANCE', id })}>정비</Btn>
          </div>
        ) : null}
        <div className="mt-2 border-t pt-1.5" style={{ borderColor: theme.border }}>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
            {log.length === 0 && <span style={{ color: theme.textFaint }}>최근 처리 작업 대기 중…</span>}
            {log.map((o, i) => (
              <span key={i} style={{ color: theme.textDim }}>
                <span className="tnum" style={{ color: theme.textFaint }}>{o.t}</span> {o.cycle === 'DUAL' ? '복합' : '완료'} · {o.sku || o.id}
              </span>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

export default function Hud() {
  const view = useStore((s) => s.view);
  const focus = useStore((s) => s.cameraFocus);
  const isWarehouse = view !== 'MAP';
  const craneMode = view === '3D' && focus && focus.startsWith('crane:');
  return (
    <div className="pointer-events-none absolute inset-0" style={{ color: theme.text }}>
      <TopBar />
      <ExceptionAlert />
      <InspectorPanel />
      {isWarehouse && <ControlColumn />}
      {isWarehouse && <CraneDiagnostics />}
      {isWarehouse && !craneMode && <WorkLog />}
      {isWarehouse && <Legend />}
      {isWarehouse && <MobileBar />}
      <IntroOverlay />
    </div>
  );
}
