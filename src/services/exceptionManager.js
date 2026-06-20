/**
 * 예외 관리자 — 가상의 '재고 불일치(Inventory Mismatch)' 예외를 주입·해소.
 *
 * 실제 현장처럼 시스템 수량과 실재고가 어긋나는 상황을 무작위로 발생시켜, 관제 화면에
 * 경고를 띄우고 관리자가 [조치 지시]로 해소하는 양방향 워크플로를 시연합니다.
 * 예외가 걸린 셀은 `cell.exception=true`로 표시되어 3D/2D에서 강조됩니다.
 */
const EXC_TYPES = [
  { type: 'STOCK_MISMATCH', label: '재고 불일치', detail: (id) => `${id}: 시스템 수량과 실재고 불일치 — 실사 필요` },
  { type: 'BARCODE_FAIL', label: '바코드 인식 실패', detail: (id) => `${id}: 팔레트 바코드 스캔 실패 — 수동 확인` },
  { type: 'CELL_BLOCKED', label: '셀 간섭 감지', detail: (id) => `${id}: 셀 점유 센서 이상 — 적재물 정렬 확인` },
];

export class ExceptionManager {
  constructor() {
    this.active = new Map(); // id -> exception
    this._seq = 0;
  }

  /** 무작위 점유 셀에 예외 1건 주입. 반환: 예외 객체 또는 null. */
  inject(warehouse, rng, tick) {
    const occupied = warehouse.cells.filter((c) => c.occupied && !c.exception);
    if (occupied.length === 0) return null;
    const cell = rng ? rng.pick(occupied) : occupied[0];
    const spec = rng ? rng.pick(EXC_TYPES) : EXC_TYPES[0];
    this._seq += 1;
    const exc = {
      id: `EXC-${String(this._seq).padStart(4, '0')}`,
      cellId: cell.id,
      sku: cell.pallet?.sku ?? null,
      type: spec.type,
      label: spec.label,
      detail: spec.detail(cell.id),
      tick,
      severity: spec.type === 'STOCK_MISMATCH' ? 'high' : 'medium',
    };
    this.active.set(exc.id, exc);
    cell.exception = true;
    return exc;
  }

  /** 예외 해소. 반환: 해소된 예외 또는 null. */
  resolve(id, warehouse) {
    const exc = this.active.get(id);
    if (!exc) return null;
    this.active.delete(id);
    const cell = warehouse.byId.get(exc.cellId);
    if (cell) cell.exception = false;
    return exc;
  }

  /**
   * 자동 해소 — 발생 후 ttlTicks가 지난 예외를 운영자가 처리한 것으로 간주해 클리어.
   * 무인 데모에서 경보가 영구히 쌓이지 않게 하고, 현장의 '발생→조치→해소' 수명주기를 반영.
   * 반환: 자동 해소된 예외 배열.
   */
  autoResolve(warehouse, tick, ttlTicks) {
    const expired = [];
    for (const exc of this.active.values()) {
      if (tick - exc.tick >= ttlTicks) expired.push(exc);
    }
    for (const exc of expired) {
      this.active.delete(exc.id);
      const cell = warehouse.byId.get(exc.cellId);
      if (cell) cell.exception = false;
    }
    return expired;
  }

  list() {
    return [...this.active.values()];
  }

  get count() {
    return this.active.size;
  }
}
