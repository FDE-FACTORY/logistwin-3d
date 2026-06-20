-- LogisTwin 3D — 물류 트랜잭션 영속화 스키마 (Neon Postgres)
-- DATABASE_URL 설정 시 서버 기동에서 멱등 실행됩니다.

CREATE TABLE IF NOT EXISTS events (
  id         BIGSERIAL PRIMARY KEY,
  type       TEXT        NOT NULL,         -- order | done | exception | slotting | compliance ...
  payload    JSONB       NOT NULL,
  sim_tick   INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_type    ON events (type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,                -- INBOUND | OUTBOUND
  sku        TEXT,
  grade      TEXT,
  quantity   INTEGER,
  sim_tick   INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_sku ON orders (sku);
