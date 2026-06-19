/**
 * SKU 마스터 — 물품 기준 정보.
 *
 * ABC 분석 기반으로 등급을 부여합니다(파레토 80/20):
 *   - A급: 품목 수는 적지만(약 20%) 출고 빈도가 매우 높음 → 출하장 근처 슬로팅 대상.
 *   - B급: 중간.
 *   - C급: 품목 수는 많지만(약 50%) 회전이 느림.
 *
 * `popularity`는 수요 모델의 weightedPick 가중치로 사용됩니다(높을수록 자주 주문).
 */

/** 등급별 정의 — 품목 수 비중과 인기도(주문 가중치). */
const GRADE_SPEC = {
  A: { share: 0.2, popularity: 8 }, // 20% 품목이 회전의 대부분
  B: { share: 0.3, popularity: 3 },
  C: { share: 0.5, popularity: 1 },
};

/** 마스터에 등록할 총 SKU 수. */
const SKU_COUNT = 60;

/**
 * 결정론을 위해, 등급 분배는 인덱스 비율로 고정합니다(난수 미사용).
 * 예: SKU_COUNT=60 → A 12개, B 18개, C 30개.
 */
function buildSkuMaster() {
  const skus = [];
  const aCount = Math.round(SKU_COUNT * GRADE_SPEC.A.share);
  const bCount = Math.round(SKU_COUNT * GRADE_SPEC.B.share);

  const counters = { A: 0, B: 0, C: 0 };
  for (let i = 0; i < SKU_COUNT; i++) {
    let grade;
    if (i < aCount) grade = 'A';
    else if (i < aCount + bCount) grade = 'B';
    else grade = 'C';

    counters[grade] += 1;
    const seq = String(counters[grade]).padStart(3, '0');

    skus.push({
      sku: `SKU-${grade}-${seq}`, // 예: SKU-A-001
      grade,
      popularity: GRADE_SPEC[grade].popularity, // 수요 가중치
      // 팔레트당 표준 입고 수량 범위 (주문 수량 생성에 사용).
      unitsPerPallet: grade === 'A' ? 12 : grade === 'B' ? 8 : 5,
    });
  }
  return skus;
}

/** 불변 SKU 마스터 목록. */
export const skuMaster = Object.freeze(buildSkuMaster());

/** 인기도 가중치 배열 (skuMaster와 동일 순서) — weightedPick에 직접 전달. */
export const skuPopularityWeights = Object.freeze(skuMaster.map((s) => s.popularity));

/** sku 코드 → 마스터 객체 빠른 조회. */
export const skuById = Object.freeze(
  Object.fromEntries(skuMaster.map((s) => [s.sku, s])),
);
