import { warehouseConfig, totalCells } from '../config/warehouse.config.js';
import { cellId } from '../utils/ids.js';

/**
 * 3D AS/RS 창고 모델.
 *
 * config로부터 고층 랙 격자(Aisle × Side × Bay(X) × Level(Z))를 생성하고,
 * 각 셀에 미터 단위 `position`(3D 렌더 + 크레인 주행거리/상승높이 연산용)을 부여합니다.
 *
 * 좌표 변환 (render space, 미터):
 *   position.x = bay 방향 수평 거리      (출하장 bay 0 기준)  → 크레인 X축 전진
 *   position.y = 적재 높이               (1층 = 0)            → 크레인 Z축 상승
 *   position.z = 통로 횡 위치            (통로 간격 × 통로번호 + side 오프셋)
 */
export class Warehouse {
  /** @param {object} config warehouse.config.js의 warehouseConfig */
  constructor(config = warehouseConfig) {
    this.config = config;
    this.cells = [];
    this.byId = new Map();
    this._build();
  }

  _build() {
    const { aisles, sidesPerAisle, baysPerSide, levels, cellSize, aisleSpacing } =
      this.config;
    const sides = sidesPerAisle === 2 ? ['L', 'R'] : ['L'];

    for (let aisle = 1; aisle <= aisles; aisle++) {
      for (const side of sides) {
        for (let bay = 0; bay < baysPerSide; bay++) {
          for (let level = 1; level <= levels; level++) {
            const id = cellId(aisle, side, bay, level);
            const cell = {
              id,
              aisle,
              side,
              x: bay, // 베이 인덱스 (가로 위치)
              z: level, // 층수
              position: {
                x: bay * cellSize.width,
                y: (level - 1) * cellSize.height,
                z:
                  (aisle - 1) * aisleSpacing +
                  (side === 'R' ? cellSize.depth : 0),
              },
              occupied: false,
              reserved: false, // 크레인 배정 중(입고 목적지/출고 대상) — 중복 할당 방지
              pallet: null, // { sku, grade, quantity, storedAt }
            };
            this.cells.push(cell);
            this.byId.set(id, cell);
          }
        }
      }
    }
  }

  /** 비어 있는 첫 셀(예약 제외) 반환, 없으면 null. */
  findEmptyCell() {
    return this.cells.find((c) => !c.occupied && !c.reserved) ?? null;
  }

  /** 무작위 빈 셀 (예약 제외, 시드 RNG 주입). */
  findRandomEmptyCell(rng) {
    const empties = this.cells.filter((c) => !c.occupied && !c.reserved);
    if (empties.length === 0) return null;
    return rng ? rng.pick(empties) : empties[0];
  }

  /** 해당 SKU가 적재된 셀 하나 반환(예약 제외, 출고 가능), 없으면 null. */
  findCellBySku(sku, rng) {
    const matches = this.cells.filter(
      (c) => c.occupied && !c.reserved && c.pallet?.sku === sku,
    );
    if (matches.length === 0) return null;
    return rng ? rng.pick(matches) : matches[0];
  }

  /** 재고가 있는(출고 가능) 셀 하나를 무작위로 반환, 없으면 null. */
  findAnyStockedCell(rng) {
    const stocked = this.cells.filter((c) => c.occupied && !c.reserved && c.pallet?.sku);
    if (stocked.length === 0) return null;
    return rng ? rng.pick(stocked) : stocked[0];
  }

  /** 입고 가능한 빈 셀 목록 (예약 제외). aisle 지정 시 해당 통로만. */
  emptyCells({ aisle } = {}) {
    return this.cells.filter(
      (c) => !c.occupied && !c.reserved && (aisle == null || c.aisle === aisle),
    );
  }

  /** 해당 SKU가 적재된 출고 가능 셀 목록 (예약 제외). aisle 지정 시 해당 통로만. */
  cellsWithSku(sku, { aisle } = {}) {
    return this.cells.filter(
      (c) =>
        c.occupied &&
        !c.reserved &&
        c.pallet?.sku === sku &&
        (aisle == null || c.aisle === aisle),
    );
  }

  /** 셀을 작업 배정용으로 예약 (크레인 도착 전 중복 할당 방지). */
  reserve(cell) {
    cell.reserved = true;
  }

  /** 셀에 팔레트 적재 (입고). 예약 해제. */
  store(cell, pallet) {
    cell.occupied = true;
    cell.reserved = false;
    cell.pallet = pallet;
  }

  /** 셀에서 팔레트 추출 (출고). 예약 해제, 추출된 팔레트 반환. */
  retrieve(cell) {
    const pallet = cell.pallet;
    cell.occupied = false;
    cell.reserved = false;
    cell.pallet = null;
    return pallet;
  }

  /**
   * 출하장(I/O)에서 해당 셀까지 크레인 이동 거리(미터) — 성분별 분해.
   * Phase 2 ESG 엔진에서 수평/수직을 각기 다른 전력 계수로 환산하기 위해 분리 제공.
   *   - horizontal : X축 전진 거리
   *   - vertical   : Z축 상승 높이
   *   - aisleShift : 통로 전환 횡 이동
   */
  distanceFromIO(cell) {
    const { cellSize, aisleSpacing, ioStation } = this.config;
    const horizontal = cell.x * cellSize.width;
    const vertical = (cell.z - 1) * cellSize.height;
    const aisleShift = Math.abs(cell.aisle - ioStation.aisle) * aisleSpacing;
    return { horizontal, vertical, aisleShift, total: horizontal + vertical + aisleShift };
  }

  /** 현재 점유 셀 목록 (프론트 초기 렌더용 직렬화 형태). */
  occupiedCells() {
    const out = [];
    for (const c of this.cells) {
      if (c.occupied) {
        out.push({ id: c.id, aisle: c.aisle, side: c.side, x: c.x, z: c.z, sku: c.pallet?.sku, grade: c.pallet?.grade });
      }
    }
    return out;
  }

  /** 현재 창고 통계. */
  stats() {
    const total = this.cells.length;
    const occupied = this.cells.reduce((n, c) => n + (c.occupied ? 1 : 0), 0);
    return {
      total,
      occupied,
      empty: total - occupied,
      fillRate: total === 0 ? 0 : occupied / total,
    };
  }
}

/** 셀 총개수 — config 기반(빌드 없이 계산). */
export { totalCells };
