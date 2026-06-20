/**
 * 물류 트랜잭션 영속화 (env 게이트, 비차단).
 *
 * DATABASE_URL(예: Neon)이 있으면 주문/이벤트를 Postgres에 적재합니다. 없으면 완전 비활성
 * (시뮬은 in-memory + JSONL 이벤트로그로 동작). 실시간성을 위해 **버퍼링 후 배치 flush**로
 * 틱 루프를 절대 막지 않습니다(쓰기 실패도 시뮬에 영향 없음).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let pool = null;
let buffer = [];
let timer = null;

/** DB 초기화 — DATABASE_URL 없으면 {enabled:false}. */
export async function initDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return { enabled: false };
  const pg = (await import('pg')).default;
  pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }, // Neon SSL
    max: 4,
  });
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');
  await pool.query(readFileSync(schemaPath, 'utf8'));
  timer = setInterval(flush, 2000);
  timer.unref?.();
  return { enabled: true };
}

/** 이벤트 적재 큐잉 (비차단). */
export function recordEvent(type, payload, simTick) {
  if (!pool) return;
  buffer.push({ type, payload, simTick });
  if (buffer.length >= 250) flush();
}

async function flush() {
  if (!pool || buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    const tuples = [];
    const params = [];
    batch.forEach((e, i) => {
      const b = i * 3;
      tuples.push(`($${b + 1},$${b + 2},$${b + 3})`);
      params.push(e.type, JSON.stringify(e.payload), e.simTick ?? null);
    });
    await pool.query(`INSERT INTO events (type, payload, sim_tick) VALUES ${tuples.join(',')}`, params);
  } catch {
    // 비차단: 적재 실패해도 시뮬레이션은 계속.
  }
}

export async function closeDb() {
  if (timer) clearInterval(timer);
  await flush();
  await pool?.end?.().catch(() => {});
}
