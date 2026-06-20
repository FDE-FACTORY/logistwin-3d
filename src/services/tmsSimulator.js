/**
 * TMS(배송 차량 추적) 시뮬레이터 — 창고 밖 공급망까지 확장하는 통합 관제용.
 *
 * 가상의 배송 트럭이 물류센터(DC)에서 출발해 수도권 배송지를 순회하다 복귀합니다.
 * 실제 지도 API(Kakao) 키가 있으면 프론트가 그 위에 폴리라인/마커를 렌더하고,
 * 키가 없으면 좌표 기반 시뮬 맵으로 폴백합니다(좌표 규약은 동일: {lat, lng}).
 *
 * 컴플라이언스(개인위치정보):
 *   - 트럭별 `consent`(위치 수집 동의)가 없으면 위치를 마스킹.
 *   - 업무 시간(08~20시) 외에는 위치 수집을 자동 차단(마스킹).
 */
const DC = { lat: 37.4563, lng: 126.7052, name: '인천 물류센터' }; // 인천 일대

function lerp(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

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
    // 수도권 대략 범위
    return { lat: 37.42 + this.rng.random() * 0.34, lng: 126.80 + this.rng.random() * 0.46 };
  }

  _newTruck(i) {
    const stopCount = this.rng.int(2, 3);
    const stops = [this.dc];
    for (let s = 0; s < stopCount; s++) stops.push(this._randDest());
    stops.push(this.dc);
    return {
      id: `TRK-${String(i + 1).padStart(2, '0')}`,
      plate: `${this.rng.int(10, 99)}바 ${this.rng.int(1000, 9999)}`,
      stops,
      seg: 0,
      t: this.rng.random(),
      speed: 0.003 + this.rng.random() * 0.004,
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

  _status(tr) {
    if (tr.seg === 0) return '배송 출발';
    if (tr.seg >= tr.stops.length - 2) return '센터 복귀';
    return '배송 중';
  }

  /** 현재 스냅샷 (마스킹 적용). */
  snapshot(hourOfDay) {
    const businessHours = hourOfDay >= 8 && hourOfDay < 20;
    return {
      dc: this.dc,
      businessHours,
      consentGlobal: this.consentGlobal,
      trucks: this.trucks.map((tr) => {
        const masked = !this.consentGlobal || !tr.consent || !businessHours;
        const pos = lerp(tr.stops[tr.seg], tr.stops[tr.seg + 1], tr.t);
        const remainSeg = tr.stops.length - 1 - tr.seg;
        const etaMin = Math.round((remainSeg - tr.t) * 18); // 구간당 ~18분 근사
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
