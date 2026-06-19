import { create } from 'zustand';

/**
 * 디지털 트윈 클라이언트 상태 (zustand).
 *
 * - init: 정적 레이아웃(config) + 점유 셀 + 크레인 모델/초기 스냅샷.
 * - state: 매 틱 크레인 보간 좌표, 셀 점유 delta, 신규/완료 주문, KPI·ESG.
 *
 * 셀은 Map(id→{occupied,sku,grade})으로 보관하고, 매 틱 delta를 in-place 반영한 뒤
 * `cellsVersion`을 증가시켜 렌더러가 인스턴스 메시를 갱신하게 합니다(틱당 복사 회피).
 */
export const useStore = create((set, get) => ({
  connected: false,
  view: '3D', // '3D' | '2D' — 뷰 모드
  config: null,
  craneModelInfo: null,
  cranes: [],
  kpi: null,
  cycles: null,
  virtualTime: '--:--:--',
  tick: 0,
  orders: [], // 최근 주문/완료 피드 (최대 40)
  cells: new Map(),
  cellsVersion: 0,

  setConnected: (v) => set({ connected: v }),
  setView: (v) => set({ view: v }),

  applyInit: (d) => {
    const cells = new Map();
    for (const c of d.occupied) cells.set(c.id, { occupied: true, sku: c.sku, grade: c.grade });
    set({
      config: d.config,
      craneModelInfo: d.crane?.model ?? null,
      cranes: d.cranes ?? [],
      kpi: d.kpi ?? null,
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
    // 주문 피드 갱신 (신규 + 완료를 합쳐 앞쪽에 누적).
    const feed = get().orders;
    const events = [];
    for (const o of s.orders || []) events.push({ kind: 'new', ...o, t: s.virtualTime });
    for (const o of s.done || []) events.push({ kind: 'done', ...o, t: s.virtualTime });
    const orders = events.length ? [...events.reverse(), ...feed].slice(0, 40) : feed;

    set({
      cranes: s.cranes || [],
      kpi: s.kpi || null,
      cycles: s.cycles || null,
      virtualTime: s.virtualTime,
      tick: s.tick,
      orders,
      cellsVersion: (s.cellDeltas && s.cellDeltas.length ? get().cellsVersion + 1 : get().cellsVersion),
    });
  },
}));
