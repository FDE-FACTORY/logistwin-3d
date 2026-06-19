import { OrderType } from '../models/order.js';
import { energyKwh, carbonKg } from './energy.js';

/**
 * KpiCollector — 실시간 운영 지표 집계기.
 *
 * 주문 스트림을 구독하여 누적 KPI를 갱신합니다. 이 지표들은 Phase 4 ESG/생산성
 * 대시보드 차트의 데이터 소스가 됩니다.
 *
 * 집계 항목:
 *   - throughput      : 누적 처리 주문 수 (IN/OUT 분리)
 *   - queueDepth      : 현재 작업 큐 깊이 (백로그)
 *   - fillRate        : 창고 적재율 (점유 셀 / 전체 셀)
 *   - inOutRatio      : 입고:출고 비율
 *   - totalTravel(m)  : 누적 크레인 주행거리 (수평+수직+통로전환) — ESG 전력 환산 대비
 */
export class KpiCollector {
  /** @param {import('../models/warehouse.js').Warehouse} warehouse */
  constructor(warehouse) {
    this.warehouse = warehouse;
    // 생성된 주문(수요)
    this.inbound = 0;
    this.outbound = 0;
    // 처리 완료된 주문(크레인 사이클 종료)
    this.completedIn = 0;
    this.completedOut = 0;
    this.totalTravel = 0; // 총 주행거리(m)
    this.travelH = 0; // 수평 주행(m)
    this.travelV = 0; // 수직 승강(m)
    this.peakQueueDepth = 0;
  }

  /**
   * 생성된 주문 1건 반영.
   * @param {object} order
   * @param {number} queueDepth 현재 큐 깊이
   */
  record(order, queueDepth) {
    if (order.type === OrderType.INBOUND) this.inbound += 1;
    else this.outbound += 1;
    if (queueDepth > this.peakQueueDepth) this.peakQueueDepth = queueDepth;
  }

  /** 크레인이 처리 완료한 주문 1건 반영. */
  recordCompletion(order) {
    if (order.type === OrderType.INBOUND) this.completedIn += 1;
    else this.completedOut += 1;
  }

  /** 크레인 주행거리 누적 (이동 단계마다 호출). seg = { h, v, meters }. */
  addTravel(seg) {
    this.totalTravel += seg.meters;
    this.travelH += seg.h;
    this.travelV += seg.v;
  }

  /** 현재 스냅샷. */
  snapshot(queueDepth = 0) {
    const generated = this.inbound + this.outbound;
    const completed = this.completedIn + this.completedOut;
    const stats = this.warehouse.stats();
    return {
      generated,
      inbound: this.inbound,
      outbound: this.outbound,
      completed,
      completedIn: this.completedIn,
      completedOut: this.completedOut,
      inOutRatio:
        this.outbound === 0
          ? `${this.inbound}:0`
          : `${(this.inbound / this.outbound).toFixed(2)}:1`,
      queueDepth,
      peakQueueDepth: this.peakQueueDepth,
      fillRate: stats.fillRate,
      occupied: stats.occupied,
      totalCells: stats.total,
      totalTravelM: Math.round(this.totalTravel),
      travelH: this.travelH,
      travelV: this.travelV,
      energyKwh: energyKwh(this.travelH, this.travelV),
      co2Kg: carbonKg(energyKwh(this.travelH, this.travelV)),
    };
  }

  /** 콘솔 요약 한 줄. */
  formatLine(queueDepth = 0) {
    const s = this.snapshot(queueDepth);
    const fill = (s.fillRate * 100).toFixed(1);
    return (
      `📊 KPI │ 생성 ${s.generated} / 완료 ${s.completed} (IN ${s.completedIn}/OUT ${s.completedOut}) │ ` +
      `큐 ${s.queueDepth} (peak ${s.peakQueueDepth}) │ 적재율 ${fill}% │ ` +
      `주행 ${s.totalTravelM.toLocaleString()}m │ ⚡${s.energyKwh.toFixed(1)}kWh`
    );
  }
}
