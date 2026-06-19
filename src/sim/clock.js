import { EventEmitter } from 'node:events';

/**
 * SimClock — 틱 기반 가상 시계.
 *
 * 실시간 매 (tickMs / speed) 밀리초마다 1틱 전진하고, 1틱은 가상시간 tickMs 만큼
 * 흐릅니다. speed를 올리면 가상시간이 빨라져 하루치 운영을 몇 분에 압축 재현합니다.
 *
 * 이벤트:
 *   'tick' → { tick, virtualMs, virtualTime, hourOfDay }
 *
 * 디지털 트윈의 심장 — 모든 주문/상태 갱신이 이 틱에 동기화됩니다.
 */
export class SimClock extends EventEmitter {
  /**
   * @param {object} opts
   * @param {number} opts.tickMs   1틱이 나타내는 가상 시간(ms). 기본 1000(=가상 1초).
   * @param {number} opts.speed    배속 (실시간 대비). 기본 1.
   * @param {number} opts.startHour 시작 가상 시각(0~24). 기본 0.
   */
  constructor({ tickMs = 1000, speed = 1, startHour = 0 } = {}) {
    super();
    this.tickMs = tickMs;
    this.speed = speed;
    this.tick = 0;
    // 가상시간 누적(ms). 시작 시각만큼 오프셋.
    this.virtualMs = startHour * 3600_000;
    this._startVirtualMs = this.virtualMs;
    this._timer = null;
  }

  /** 실시간 인터벌(ms) — 배속이 클수록 짧아짐. */
  get intervalMs() {
    return Math.max(1, Math.round(this.tickMs / this.speed));
  }

  /** 현재 가상 시각의 시(hour) 0~23. */
  get hourOfDay() {
    return Math.floor(this.virtualMs / 3600_000) % 24;
  }

  /** 'HH:MM:SS' 형식의 가상 시각 문자열. */
  get virtualTime() {
    const totalSec = Math.floor(this.virtualMs / 1000);
    const h = Math.floor(totalSec / 3600) % 24;
    const m = Math.floor(totalSec / 60) % 60;
    const s = totalSec % 60;
    const p = (n) => String(n).padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(s)}`;
  }

  /** 시작 이후 경과한 가상 시간(시 단위, 소수). */
  get elapsedHours() {
    return (this.virtualMs - this._startVirtualMs) / 3600_000;
  }

  /** 클록 시작. 이미 동작 중이면 무시. */
  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._advance(), this.intervalMs);
  }

  /** 클록 정지. */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * 1틱 동기 전진 (setInterval 없이 즉시). 헤드리스 배치 실행(예: Single vs Dual
   * 비교 하네스)에서 N틱을 실시간 대기 없이 결정론적으로 돌리는 데 사용.
   */
  tickOnce() {
    this._advance();
  }

  _advance() {
    this.tick += 1;
    this.virtualMs += this.tickMs;
    this.emit('tick', {
      tick: this.tick,
      virtualMs: this.virtualMs,
      virtualTime: this.virtualTime,
      hourOfDay: this.hourOfDay,
    });
  }
}
