import { create } from 'zustand';

/**
 * 디지털 트윈 클라이언트 상태 (zustand).
 *
 * - init   : 정적 레이아웃(config)+점유 셀+크레인 모델+활성 예외.
 * - state  : 매 틱 크레인 보간 좌표·셀 delta·주문·KPI/ESG·예외·관제 이벤트.
 * - patch  : 명령 결과(적재효율/예외해소)를 다음 틱 기다리지 않고 즉시 반영(저지연).
 *
 * 셀은 Map(id→{occupied,sku,grade})으로 두고 delta를 in-place 반영, cellsVersion 증가로
 * 렌더러 갱신. KPI는 시계열로 누적(차트용, 최근 120표본).
 */
const HISTORY_MAX = 120;
const EVENTS_MAX = 50;

export const useStore = create((set, get) => ({
  connected: false,
  view: '3D',
  floorFilter: 0, // 0=전체, 1..levels=해당 층만 표시
  cameraFocus: 'overview', // 'overview' | 'dock' | `aisle:<n>` — 카메라 프리셋
  focusSeq: 0, // 같은 프리셋 재클릭 시에도 재이동 트리거
  introOpen: true, // 첫 진입 온보딩 오버레이
  config: null,
  craneModelInfo: null,
  cranes: [],
  kpi: null,
  cycles: null,
  virtualTime: '--:--:--',
  tick: 0,
  orders: [],
  events: [], // 관제 이벤트 토스트 피드
  exceptions: [], // 활성 예외
  tms: null, // 배송 차량(TMS) 스냅샷
  facility: null, // 내부 물류 흐름(P&D·AGV·도크)
  kpiHistory: [], // 시계열 표본
  cells: new Map(),
  cellsVersion: 0,
  emit: null, // 서버로 명령 전송 (useSocket이 주입)

  setConnected: (v) => set({ connected: v }),
  setView: (v) => set({ view: v }),
  setFloorFilter: (v) => set({ floorFilter: v }),
  setCameraFocus: (v) => set({ cameraFocus: v, focusSeq: get().focusSeq + 1 }),
  closeIntro: () => set({ introOpen: false }),
  setEmit: (fn) => set({ emit: fn }),
  sendCommand: (cmd) => {
    const fn = get().emit;
    if (fn) fn('command', cmd);
  },

  applyInit: (d) => {
    const cells = new Map();
    for (const c of d.occupied) cells.set(c.id, { occupied: true, sku: c.sku, grade: c.grade });
    set({
      config: d.config,
      craneModelInfo: d.crane?.model ?? null,
      cranes: d.cranes ?? [],
      kpi: d.kpi ?? null,
      exceptions: d.exceptions ?? [],
      tms: d.tms ?? null,
      facility: d.facility ?? null,
      cells,
      cellsVersion: get().cellsVersion + 1,
      virtualTime: d.meta?.virtualTime ?? '--:--:--',
      tick: d.meta?.tick ?? 0,
    });
  },

  applyState: (s) => {
    const cells = get().cells;
    for (const d of s.cellDeltas || []) {
      if (d.occupied) cells.set(d.id, { occupied: true, sku: d.sku, grade: d.grade });
      else cells.delete(d.id);
    }

    // 작업 로그(신규/완료) 갱신
    const feedPrev = get().orders;
    const evs = [];
    for (const o of s.orders || []) evs.push({ kind: 'new', ...o, t: s.virtualTime });
    for (const o of s.done || []) evs.push({ kind: 'done', ...o, t: s.virtualTime });
    const orders = evs.length ? [...evs.reverse(), ...feedPrev].slice(0, 40) : feedPrev;

    // 관제 이벤트 토스트
    const events = (s.events && s.events.length)
      ? [...s.events.map((e) => ({ ...e, t: s.virtualTime })).reverse(), ...get().events].slice(0, EVENTS_MAX)
      : get().events;

    // KPI 시계열
    const kpiHistory = s.kpi
      ? [...get().kpiHistory, { t: s.virtualTime, energy: s.kpi.energyKwh, co2: s.kpi.co2Kg, done: s.kpi.completed, fill: s.kpi.fillRate }].slice(-HISTORY_MAX)
      : get().kpiHistory;

    set({
      cranes: s.cranes || [],
      kpi: s.kpi || null,
      cycles: s.cycles || null,
      exceptions: s.exceptions ?? get().exceptions,
      tms: s.tms ?? get().tms,
      facility: s.facility ?? get().facility,
      virtualTime: s.virtualTime,
      tick: s.tick,
      orders,
      events,
      kpiHistory,
      cellsVersion: s.cellDeltas && s.cellDeltas.length ? get().cellsVersion + 1 : get().cellsVersion,
    });
  },

  // 명령 결과 즉시 반영 (저지연)
  applyPatch: (p) => {
    const cells = get().cells;
    for (const d of p.cellDeltas || []) {
      if (d.occupied) cells.set(d.id, { occupied: true, sku: d.sku, grade: d.grade });
      else cells.delete(d.id);
    }
    const events = (p.events && p.events.length)
      ? [...p.events.map((e) => ({ ...e, t: p.virtualTime })).reverse(), ...get().events].slice(0, EVENTS_MAX)
      : get().events;
    set({
      cells,
      cellsVersion: get().cellsVersion + 1,
      exceptions: p.exceptions ?? get().exceptions,
      events,
    });
  },
}));
