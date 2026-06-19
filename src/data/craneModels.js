/**
 * 스태커 크레인 제원 카탈로그.
 *
 * 제원이 다른 여러 크레인 모델을 정의하고, 시뮬레이션에 선택 투입할 수 있게 합니다.
 * 선택한 모델의 제원(주행/승강 속도, 포크 시간)이 이동 시간·처리량·에너지에 직접 반영되어,
 * "어떤 크레인을 투입할지"에 따른 운영 성과 차이를 비교할 수 있습니다.
 *
 * 각 모델은 3D 렌더용 치수(dimensions)와 에셋 참조(modelRef)도 포함합니다 → Phase 3에서
 * 제원별 실사 3D 모델(glTF)을 매핑해 선택 투입합니다.
 *
 * ⚠️ 제원 값은 일반적인 AS/RS 스태커 크레인 범위를 반영한 **대표/예시값**입니다
 *    (특정 제조사 사양 아님). 실제 장비 스펙을 받으면 이 파일만 교체하면 됩니다.
 */
export const craneModels = {
  compact: {
    id: 'compact',
    name: 'Compact-6',
    class: '저층·고속형',
    horizontalSpeed: 4.0, // m/s
    verticalSpeed: 1.2, // m/s
    forkTimeSec: 6,
    maxLevels: 6,
    maxPayloadKg: 500,
    dimensions: { mastHeightM: 7.0, baseWidthM: 1.0, baseDepthM: 2.2, forkReachM: 1.1 },
    modelRef: 'crane_compact.glb',
  },
  standard: {
    id: 'standard',
    name: 'Standard-8',
    class: '표준형',
    horizontalSpeed: 2.0,
    verticalSpeed: 1.0,
    forkTimeSec: 8,
    maxLevels: 8,
    maxPayloadKg: 1000,
    dimensions: { mastHeightM: 9.0, baseWidthM: 1.1, baseDepthM: 2.6, forkReachM: 1.2 },
    modelRef: 'crane_standard.glb',
  },
  highbay: {
    id: 'highbay',
    name: 'HighBay-12',
    class: '초고층형',
    horizontalSpeed: 3.0,
    verticalSpeed: 0.9,
    forkTimeSec: 9,
    maxLevels: 12,
    maxPayloadKg: 1000,
    dimensions: { mastHeightM: 13.0, baseWidthM: 1.2, baseDepthM: 3.0, forkReachM: 1.2 },
    modelRef: 'crane_highbay.glb',
  },
  heavyduty: {
    id: 'heavyduty',
    name: 'HeavyDuty-10',
    class: '중량물형',
    horizontalSpeed: 2.0,
    verticalSpeed: 0.6,
    forkTimeSec: 12,
    maxLevels: 10,
    maxPayloadKg: 1500,
    dimensions: { mastHeightM: 11.0, baseWidthM: 1.4, baseDepthM: 3.4, forkReachM: 1.4 },
    modelRef: 'crane_heavyduty.glb',
  },
};

/** 기본 모델 — 기존 시뮬레이션/벤치마크와 동일 제원(표준형). */
export const defaultCraneModelId = 'standard';

/** 카탈로그 ID 목록. */
export const craneModelIds = Object.keys(craneModels);

/**
 * 모델 ID → 모델 객체. 미지정 시 기본 모델, 알 수 없는 ID면 에러(목록 안내).
 * @param {string} [id]
 */
export function resolveCraneModel(id) {
  if (!id) return craneModels[defaultCraneModelId];
  const model = craneModels[id];
  if (!model) {
    throw new Error(`알 수 없는 크레인 모델 '${id}'. 사용 가능: ${craneModelIds.join(', ')}`);
  }
  return model;
}
