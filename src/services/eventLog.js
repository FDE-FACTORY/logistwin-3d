import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * EventLog — JSONL 이벤트 소싱 라이터.
 *
 * 모든 주문 이벤트를 한 줄당 하나의 JSON으로 append합니다(append-only).
 * 이 스트림은 향후:
 *   - PostgreSQL 적재(배치 ETL)의 원천,
 *   - 시뮬레이션 리플레이(time-travel) 및 감사(audit)의 근거,
 *   - Phase 2 'Single vs Dual' 알고리즘 공정 비교의 입력
 * 으로 재사용됩니다.
 *
 * 파일명에 seed를 포함해, 동일 seed 실행끼리 결과를 대조할 수 있게 합니다.
 */
export class EventLog {
  /**
   * @param {object} opts
   * @param {number} opts.seed   파일명 식별용 시드
   * @param {string} [opts.dir]  출력 디렉터리 (기본 'logs')
   */
  constructor({ seed, dir = 'logs' }) {
    this.path = join(dir, `events-${seed}.jsonl`);
    mkdirSync(dirname(this.path), { recursive: true });
    // append 모드 — 기존 로그에 이어 쓰지 않고 매 실행마다 새로 시작하려면 flags:'w'.
    this._stream = createWriteStream(this.path, { flags: 'w' });
    this.count = 0;
  }

  /**
   * 이벤트 1건 기록.
   * @param {string} type  이벤트 유형 (예: 'order')
   * @param {object} payload 직렬화 가능한 데이터
   */
  append(type, payload) {
    this._stream.write(JSON.stringify({ type, ...payload }) + '\n');
    this.count += 1;
  }

  /** 버퍼 flush 후 스트림 종료. */
  close() {
    return new Promise((resolve) => this._stream.end(resolve));
  }
}
