/**
 * ESG 에너지 모델 — 크레인 주행거리를 전력 소모량·탄소 배출량으로 환산.
 *
 * 수평 주행과 수직 승강은 전력 특성이 다릅니다(중력을 거스르는 승강이 단위 거리당
 * 더 큰 에너지 소모). 따라서 두 성분을 분리해 선형 환산합니다:
 *
 *   energy(kWh) = 수평거리(m) × kWhPerMeterH + 수직거리(m) × kWhPerMeterV
 *   carbon(kgCO2) = energy(kWh) × kgCO2PerKwh
 *
 * 계수는 예시값(설명용)입니다. Single vs Dual **상대 절감 %**는 계수 선택과 무관하게
 * 견고합니다(동일 계수로 두 시나리오를 비교하므로).
 */
export const energyModel = Object.freeze({
  kWhPerMeterH: 0.008, // 수평 주행 1m당 전력
  kWhPerMeterV: 0.03, // 수직 승강 1m당 전력 (중력 부하로 약 4배)
  kgCO2PerKwh: 0.4424, // 전력 1kWh당 탄소배출 (한국 전력 배출계수 근사)
});

/** 수평/수직 주행거리(m) → 전력(kWh). */
export function energyKwh(horizontalM, verticalM, model = energyModel) {
  return horizontalM * model.kWhPerMeterH + verticalM * model.kWhPerMeterV;
}

/** 전력(kWh) → 탄소배출(kgCO2). */
export function carbonKg(kwh, model = energyModel) {
  return kwh * model.kgCO2PerKwh;
}
