-- GSPS — PostgreSQL schema (Phase 0)
-- ----------------------------------------------------------------------------
-- Derived from the DDL in the architecture transcript (Doc 4 §First Tasks),
-- reconciled with the 4-tier model and the paper/simulation posture. Live-money
-- columns exist so the ledger design is future-proof, but Phase 0 writes only
-- paper rows (is_paper = true). No live execution until a licensed partner +
-- compliance sign-off (review log O-1 / Q-7).

-- Enumerations -----------------------------------------------------------------
CREATE TYPE platform_tier AS ENUM (
  'PRACTICE', 'STANDARD', 'INVESTOR_MODE', 'SYSTEM_MASTERY'
);
CREATE TYPE risk_profile AS ENUM ('PASSIVE', 'MODERATE', 'AGGRESSIVE');
CREATE TYPE directional_bias AS ENUM ('BULLISH', 'BEARISH', 'BOTH');
CREATE TYPE order_side AS ENUM ('BUY', 'SELL');
CREATE TYPE order_type AS ENUM ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT');
CREATE TYPE order_status AS ENUM ('ACCEPTED', 'FILLED', 'REJECTED', 'CANCELLED');
CREATE TYPE scan_bias AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');
CREATE TYPE output_state AS ENUM ('Execute', 'Watch', 'Reject');

-- Users & entitlements ---------------------------------------------------------
CREATE TABLE users (
  user_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  display_name   TEXT,
  tier           platform_tier NOT NULL DEFAULT 'PRACTICE',
  tier_renews_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-user automation dials (System Mastery). Read even in lower tiers so the
-- settings persist across upgrades.
CREATE TABLE user_automation_profiles (
  user_id             UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  risk_profile        risk_profile NOT NULL DEFAULT 'MODERATE',
  bias                directional_bias NOT NULL DEFAULT 'BOTH',
  volatility_dollar   NUMERIC(18,4),           -- $ move trigger (nullable)
  volatility_percent  NUMERIC(6,3),            -- % move trigger (nullable)
  extended_hours_on   BOOLEAN NOT NULL DEFAULT false,
  automation_enabled  BOOLEAN NOT NULL DEFAULT false, -- global kill switch (S-8)
  max_daily_loss      NUMERIC(18,4),           -- safety cap (S-8)
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order ledger -----------------------------------------------------------------
CREATE TABLE order_ledger (
  order_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  side          order_side NOT NULL,
  order_type    order_type NOT NULL,
  quantity      NUMERIC(18,6) NOT NULL,
  limit_price   NUMERIC(18,6),
  stop_price    NUMERIC(18,6),
  status        order_status NOT NULL DEFAULT 'ACCEPTED',
  avg_fill_price NUMERIC(18,6),
  is_paper      BOOLEAN NOT NULL DEFAULT true,   -- Phase 0: always true
  client_tag    TEXT,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at     TIMESTAMPTZ
);
CREATE INDEX idx_order_ledger_user ON order_ledger(user_id, submitted_at DESC);

-- Micro-fee revenue ledger -----------------------------------------------------
CREATE TABLE platform_transaction_revenue_ledger (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES order_ledger(order_id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  fee_amount     NUMERIC(18,6) NOT NULL DEFAULT 0,
  is_paper       BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily scan runs (backs the scanner cache / dashboard status) ------------------
CREATE TABLE daily_scan_runs (
  run_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'RUNNING',  -- RUNNING/FRESH/STALE/ERROR
  universe      TEXT[] NOT NULL,
  error         TEXT
);

CREATE TABLE daily_scan_results (
  result_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES daily_scan_runs(run_id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  bias          scan_bias NOT NULL,
  output_state  output_state NOT NULL,
  score         SMALLINT NOT NULL,
  rvol          NUMERIC(8,2),
  rank          SMALLINT,                         -- 1..15 within its bias block
  payload       JSONB NOT NULL                    -- full ScanResult
);
CREATE INDEX idx_scan_results_run ON daily_scan_results(run_id, bias, rank);
