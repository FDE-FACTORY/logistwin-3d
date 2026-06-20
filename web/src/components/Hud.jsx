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
          AS/RS 자동창고 통합 관제
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
    <div className="pointer-events-auto absolute left-1/2 top-16 w-[min(440px,92vw)] -translate-x-1/2 space-y-2">
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

/** KPI + ESG + 운영 제어 (우측 컬럼, 데스크톱/태블릿). */
function ControlColumn() {
  const kpi = useStore((s) => s.kpi);
  const cycles = useStore((s) => s.cycles);
  const history = useStore((s) => s.kpiHistory);
  const sendCommand = useStore((s) => s.sendCommand);
  if (!kpi) return null;

  const dualShare =
    cycles && cycles.single + cycles.dual > 0 ? Math.round((cycles.dual / (cycles.single + cycles.dual)) * 100) : 0;

  return (
    <div className="pointer-events-auto absolute right-3 top-16 hidden w-[300px] flex-col gap-3 md:flex" style={{ maxHeight: 'calc(100% - 5rem)' }}>
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
          <EsgChart
            values={history.map((h) => h.energy)}
            color={theme.caution}
            label="전력 kWh"
            current={kpi.energyKwh.toFixed(0)}
          />
          <EsgChart
            values={history.map((h) => h.done)}
            color={theme.ok}
            label="처리량 건"
            current={String(kpi.completed)}
          />
        </div>
      </Panel>

      <Panel title="운영 제어">
        <Btn variant="action" full onClick={() => sendCommand({ type: 'SLOTTING' })}>
          적재 효율화 실행
        </Btn>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: theme.textDim }}>
          회전이 빠른 A급 상품을 출하장과 가까운 자리로 다시 배치해 크레인 주행과 전력을 줄입니다.
        </p>
      </Panel>
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

export default function Hud() {
  const view = useStore((s) => s.view);
  const isWarehouse = view !== 'MAP';
  return (
    <div className="pointer-events-none absolute inset-0" style={{ color: theme.text }}>
      <TopBar />
      <ExceptionAlert />
      {isWarehouse && <ControlColumn />}
      {isWarehouse && <WorkLog />}
      {isWarehouse && <Legend />}
      {isWarehouse && <MobileBar />}
    </div>
  );
}
