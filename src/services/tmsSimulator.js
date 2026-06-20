/**
 * TMS(배송 차량 추적) 시뮬레이터 — 창고 밖 공급망까지 확장하는 통합 관제용.
 *
 * 가상의 배송 트럭이 물류센터(DC)에서 출발해 수도권 배송지를 순회하다 복귀합니다.
 * 실제 지도 API(Kakao) 키가 있으면 프론트가 그 위에 폴리라인/마커를 렌더하고,
 * 키가 없으면 좌표 기반 시뮬 맵으로 폴백합니다(좌표 규약은 동일: {lat, lng}).
 *
 * 컴플라이언스(개인위치정보):
 *   - 트럭별 `consent`(위치 수집 동의)가 없으면 위치를 마스킹.
 *   - 업무 시간(06~23시) 외에는 위치 수집을 자동 차단(마스킹).
 */
const DC = { lat: 37.4563, lng: 126.7052, name: '인천 물류센터' }; // 인천 일대

// 간이 도로망 — 주요 간선의 경도(세로축)·위도(가로축) 라인. 경로가 이 격자를 따라 직각 주행.
const GRID_LNGS = [126.78, 126.9, 127.02, 127.14, 127.26];
const GRID_LATS = [37.44, 37.54, 37.64, 37.74];

function lerp(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}
const nearest = (arr, v) => arr.reduce((m, x) => (Math.abs(x - v) < Math.abs(m - v) ? x : m), arr[0]);

export class TmsSimulator {
  /**
   * @param {import('../sim/rng.js').Rng} rng
   * @param {object} [opts] { count }
   */
  constructor(rng, { count = 6 } = {}) {
    this.rng = rng;
    this.dc = DC;
    this.consentGlobal = true; // 전역 동의(데모 토글)
    this.trucks = Array.from({ length: count }, (_, i) => this._newTruck(i));
  }

  _randDest() {
    // 배송지는 도로 격자 교차점 부근(간선 접근).
    const lng = GRID_LNGS[this.rng.int(0, GRID_LNGS.length - 1)] + (this.rng.random() - 0.5) * 0.02;
    const lat = GRID_LATS[this.rng.int(0, GRID_LATS.length - 1)] + (this.rng.random() - 0.5) * 0.02;
    return { lat, lng };
  }

  /** 두 지점 사이를 도로 격자를 따라 직각으로 잇는 경유점(끝점 b 포함). */
  _roadLeg(a, b) {
    const horizFirst = this.rng.random() < 0.5;
    // 격자선에 맞춘 코너 — 한 축은 간선 경도/위도에 스냅.
    const corner = horizFirst
      ? { lat: a.lat, lng: nearest(GRID_LNGS, b.lng) }
      : { lat: nearest(GRID_LATS, b.lat), lng: a.lng };
    return [corner, { lat: b.lat, lng: b.lng }];
  }

  _newTruck(i) {
    const stopCount = this.rng.int(2, 3);
    const dests = [];
    for (let s = 0; s < stopCount; s++) dests.push(this._randDest());
    // DC → 배송지들 → DC, 각 구간을 도로 추종 경유점으로 전개.
    const stops = [this.dc];
    let prev = this.dc;
    for (const d of [...dests, this.dc]) {
      for (const wp of this._roadLeg(prev, d)) stops.push(wp);
      prev = d;
    }
    return {
      id: `TRK-${String(i + 1).padStart(2, '0')}`,
      plate: `${this.rng.int(10, 99)}바 ${this.rng.int(1000, 9999)}`,
      stops,
      stopCount, // 실제 배송지 수(상태 판정용)
      seg: 0,
      t: this.rng.random(),
      speed: 0.006 + this.rng.random() * 0.006,
      consent: this.rng.random() > 0.18, // 일부 미동의 차량
    };
  }

  /** 매 틱 전진. hourOfDay로 업무시간 판단. */
  tick() {
    for (const tr of this.trucks) {
      tr.t += tr.speed;
      if (tr.t >= 1) {
        tr.t = 0;
        tr.seg += 1;
        if (tr.seg >= tr.stops.length - 1) {
          // 경로 완료 → 새 배송 경로 배정
          const idx = Number(tr.id.slice(4)) - 1;
          const fresh = this._newTruck(idx);
          fresh.id = tr.id;
          fresh.plate = tr.plate;
          fresh.consent = tr.consent;
          Object.assign(tr, fresh);
        }
      }
    }
  }

  _frac(tr) {
    return (tr.seg + tr.t) / Math.max(1, tr.stops.length - 1);
  }

  _status(tr) {
    const f = this._frac(tr);
    if (f < 0.12) return '배송 출발';
    if (f > 0.72) return '센터 복귀';
    return '배송 중';
  }

  /** 현재 스냅샷 (마스킹 적용). */
  snapshot(hourOfDay) {
    const businessHours = hourOfDay >= 6 && hourOfDay < 23; // 택배 운영시간(06~23시)
    return {
      dc: this.dc,
      businessHours,
      consentGlobal: this.consentGlobal,
      roads: { lngs: GRID_LNGS, lats: GRID_LATS },
      trucks: this.trucks.map((tr) => {
        const masked = !this.consentGlobal || !tr.consent || !businessHours;
        const pos = lerp(tr.stops[tr.seg], tr.stops[tr.seg + 1], tr.t);
        const etaMin = Math.max(2, Math.round((1 - this._frac(tr)) * 52) + 3); // 잔여 진행률 기반
        return {
          id: tr.id,
          plate: tr.plate,
          status: this._status(tr),
          consent: tr.consent,
          masked,
          etaMin,
          stops: tr.stops.length,
          lat: masked ? null : Number(pos.lat.toFixed(5)),
          lng: masked ? null : Number(pos.lng.toFixed(5)),
          route: masked ? null : tr.stops.map((s) => ({ lat: Number(s.lat.toFixed(5)), lng: Number(s.lng.toFixed(5)) })),
        };
      }),
    };
  }

  setConsentGlobal(v) {
    this.consentGlobal = !!v;
  }
}
