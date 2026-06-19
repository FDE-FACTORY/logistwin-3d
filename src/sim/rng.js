/**
 * 시드 기반 의사난수 발생기(PRNG) — mulberry32.
 *
 * 시뮬레이션의 모든 무작위성은 이 인스턴스 하나에서 파생됩니다.
 * → 동일한 seed로 시작하면 주문 시퀀스가 완전히 동일하게 재현됩니다.
 *   (테스트, 디버깅, 그리고 Phase 2의 'Single vs Dual 공정 비교'의 전제 조건)
 *
 * Node 내장 Math.random은 시드를 줄 수 없어 사용하지 않습니다.
 */
export class Rng {
  /** @param {number} seed 32비트 정수 시드 */
  constructor(seed = 42) {
    // 0 시드 방지 및 32비트로 정규화.
    this._state = (seed >>> 0) || 0x9e3779b9;
  }

  /** [0, 1) 균등 분포 실수. (mulberry32) */
  random() {
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 정수 (양 끝 포함). */
  int(min, max) {
    return min + Math.floor(this.random() * (max - min + 1));
  }

  /** 배열에서 균등 무작위 1개. */
  pick(arr) {
    return arr[Math.floor(this.random() * arr.length)];
  }

  /**
   * 가중치 기반 무작위 선택.
   * @param {Array} items  후보 배열
   * @param {number[]} weights items와 동일 길이의 양수 가중치
   */
  weightedPick(items, weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = this.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1]; // 부동소수 오차 보정
  }

  /**
   * 포아송 분포 표본 (Knuth 알고리즘).
   * 단위 시간당 평균 lambda번 발생하는 사건의 실제 발생 횟수를 반환.
   * 주문 '도착'을 균등 랜덤보다 현실적으로 모델링하는 데 사용.
   */
  poisson(lambda) {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= this.random();
    } while (p > L);
    return k - 1;
  }
}
