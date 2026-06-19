import { useStore } from '../store.js';
import { GRADE_COLOR } from '../config.js';

function Stat({ label, value, unit, accent }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-lg font-semibold tabular-nums" style={{ color: accent || '#e2e8f0' }}>
        {value}
        {unit && <span className="text-xs text-slate-400 ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

const panel = 'rounded-xl border border-white/10 bg-slate-900/70 backdrop-blur px-4 py-3 shadow-lg';

export default function Hud() {
  const connected = useStore((s) => s.connected);
  const kpi = useStore((s) => s.kpi);
  const cycles = useStore((s) => s.cycles);
  const vt = useStore((s) => s.virtualTime);
  const model = useStore((s) => s.craneModelInfo);
  const config = useStore((s) => s.config);
  const orders = useStore((s) => s.orders);

  const fill = kpi ? (kpi.fillRate * 100).toFixed(1) : '—';
  const dualShare =
    cycles && cycles.single + cycles.dual > 0
      ? Math.round((cycles.dual / (cycles.single + cycles.dual)) * 100)
      : 0;

  return (
    <div className="pointer-events-none absolute inset-0 p-4 text-slate-200">
      {/* 상단 좌: 타이틀 + 접속 */}
      <div className={`absolute left-4 top-4 ${panel}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
          <span className="font-bold tracking-tight">LogisTwin&nbsp;3D</span>
          <span className="text-xs text-slate-400">AS/RS 디지털 트윈</span>
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {connected ? '실시간 연결됨' : '서버 연결 대기…'} · 가상시각{' '}
          <span className="tabular-nums text-slate-200">{vt}</span>
          {config && (
            <>
              {' '}
              · {config.aisles}통로×{config.baysPerSide}베이×{config.levels}층
            </>
          )}
        </div>
        {model && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
            🏗 {model.name} <span className="text-amber-400/70">{model.class}</span>
          </div>
        )}
      </div>

      {/* 상단 우: KPI / ESG */}
      {kpi && (
        <div className={`absolute right-4 top-4 ${panel} w-64`}>
          <div className="grid grid-cols-2 gap-y-3 gap-x-4">
            <Stat label="처리 완료" value={kpi.completed} unit="건" accent="#34d399" />
            <Stat label="적재율" value={fill} unit="%" />
            <Stat label="전력" value={kpi.energyKwh.toFixed(1)} unit="kWh" accent="#facc15" />
            <Stat label="탄소" value={kpi.co2Kg.toFixed(1)} unit="kg" accent="#fb923c" />
            <Stat label="주행거리" value={kpi.totalTravelM.toLocaleString()} unit="m" />
            <Stat label="🔗 Dual" value={`${cycles ? cycles.dual : 0}`} unit={`(${dualShare}%)`} accent="#22d3ee" />
          </div>
        </div>
      )}

      {/* 하단 좌: 주문 티커 */}
      <div className={`absolute bottom-4 left-4 ${panel} w-80 max-h-52 overflow-hidden`}>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">실시간 작업 피드</div>
        <div className="space-y-0.5 text-xs">
          {orders.slice(0, 9).map((o, i) => (
            <div key={`${o.id}-${o.kind}-${i}`} className="flex items-center gap-2 tabular-nums">
              <span className="text-slate-500">{o.t}</span>
              {o.kind === 'new' ? (
                <span className={o.type === 'INBOUND' ? 'text-sky-400' : 'text-fuchsia-400'}>
                  {o.type === 'INBOUND' ? '📥 입고' : '📤 출고'}
                </span>
              ) : (
                <span className="text-emerald-400">✅ {o.crane} 완료{o.cycle === 'DUAL' ? ' 🔗' : ''}</span>
              )}
              <span className="truncate text-slate-300">
                {o.sku ? `${o.sku}` : o.id}
              </span>
            </div>
          ))}
          {orders.length === 0 && <div className="text-slate-500">대기 중…</div>}
        </div>
      </div>

      {/* 하단 우: 범례 */}
      <div className={`absolute bottom-4 right-4 ${panel} text-xs`}>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">범례</div>
        <div className="flex items-center gap-3">
          {Object.entries(GRADE_COLOR).map(([g, c]) => (
            <span key={g} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} /> {g}급
            </span>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400">
          <span><span className="text-cyan-400">●</span> 이동</span>
          <span><span className="text-amber-400">●</span> 적재/추출</span>
          <span><span className="text-violet-400">●</span> 복귀</span>
          <span><span className="text-slate-400">●</span> 대기</span>
        </div>
      </div>
    </div>
  );
}
