import { skuMaster, skuPopularityWeights } from '../data/skuMaster.js';

/**
 * 수요 모델 — 매 틱마다 "이번 틱에 어떤 주문이 몇 건 들어오는가"를 결정.
 *
 * 현실성 3요소:
 *   1) 포아송 도착   : 균등 랜덤이 아니라 평균 λ의 포아송 분포로 주문 건수 결정.
 *   2) 시간대 피크   : 시간대별 load 배율(오전 입고/오후 출고)로 λ와 IN/OUT 비율 가변.
 *   3) ABC 인기도    : SKU 선택을 파레토 80/20 가중(weightedPick)으로 — A급이 자주 출고.
 *
 * 모든 무작위성은 주입된 Rng 인스턴스에서 파생 → 시드 고정 시 완전 재현.
 */
export class DemandModel {
  /**
   * @param {import('./rng.js').Rng} rng
   * @param {object} simConfig sim.config.js의 simConfig
   */
  constructor(rng, simConfig) {
    this.rng = rng;
    this.cfg = simConfig;
  }

  /**
   * 이번 틱에 도착할 주문 '의도' 목록을 생성.
   * 실제 SKU 유효성(출고 시 재고 존재 여부)은 OrderGenerator가 최종 결정한다.
   *
   * @param {number} hourOfDay 현재 가상 시각의 시(0~23)
   * @param {number} [fillRate] 현재 적재율(0~1) — 입출고 균형 피드백용
   * @returns {Array<{ type:'INBOUND'|'OUTBOUND', sku:object }>}
   */
  generateForTick(hourOfDay, fillRate = 0.5) {
    const profile = this.cfg.hourlyProfile[hourOfDay] ?? { load: 1, inRatio: 0.5 };

    // 분당 λ → 틱당 λ로 환산 후 시간대 load 배율 적용.
    const tickFractionOfMinute = this.cfg.tickMs / 60_000;
    const lambda = this.cfg.baseArrivalPerMin * tickFractionOfMinute * profile.load;

    // 적재율 피드백 — 가득 차면 출고 우세, 비면 입고 우세 (목표 ~50% 밴드).
    // 현실 WMS의 입고 스로틀/출고 가속을 반영하며, 창고가 포화/고갈되지 않게 유지.
    const inRatio = Math.min(0.9, Math.max(0.1, profile.inRatio + (0.5 - fillRate) * 0.9));

    const count = this.rng.poisson(lambda);
    const intents = [];
    for (let i = 0; i < count; i++) {
      const type = this.rng.random() < inRatio ? 'INBOUND' : 'OUTBOUND';
      const sku = this.rng.weightedPick(skuMaster, skuPopularityWeights);
      intents.push({ type, sku });
    }
    return intents;
  }
}
