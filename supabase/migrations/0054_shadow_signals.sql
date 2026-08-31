-- Phase 7 ("Validation and monitoring") of the "Claude Code Build Roadmap"
-- spec pack — the shadow-tracking piece the implementation tracker
-- (docs/CLAUDE_CODE_ROADMAP_TRACKER.md) flagged as the one item with no
-- code at all: running the live strategy in parallel against real-time
-- data without executing, then comparing what it would have done against
-- what the backtest harness (lib/backtest/*) predicts for the same
-- strategy version.
--
-- One row per Execute-tier signal recorded from the trusted scheduled scan
-- (never a user-initiated scan — this is platform-wide signal-quality
-- tracking, not a per-user feature). `outcome`/`r_multiple`/`evaluated_at`
-- start null and are filled in once the signal's hold window has elapsed;
-- see lib/shadow/evaluate.ts.
--
-- Server-only, same posture as 0036/0042/0046/0049: RLS enabled, no client
-- select/insert/update policy — there is no user-facing surface for this
-- yet, and a client should not be able to read internal validation data
-- that has not been vetted for public display, let alone insert into it.
--
-- Rollback: `drop table if exists public.shadow_signals cascade;`

create table public.shadow_signals (
  id uuid primary key default gen_random_uuid (),
  symbol text not null,
  direction text not null check (direction in ('bullish', 'bearish')),
  pattern text,
  strategy_version text not null,
  entry numeric not null,
  stop_loss numeric not null,
  target numeric not null,
  score numeric not null,
  source text not null,
  scanned_at timestamptz not null,
  outcome text check (outcome in ('win', 'loss', 'timeout')),
  r_multiple numeric,
  bars_held integer,
  evaluated_at timestamptz,
  created_at timestamptz not null default now()
);

-- One shadow row per symbol per scan run: a retried or re-triggered
-- scheduled-scan job must not double-count the same signal.
create unique index shadow_signals_symbol_scanned_at_idx
  on public.shadow_signals (symbol, scanned_at);

-- The evaluation pass scans for rows still pending, oldest first.
create index shadow_signals_pending_idx
  on public.shadow_signals (scanned_at)
  where outcome is null;

alter table public.shadow_signals enable row level security;

-- No select/insert/update policy: server-only via service_role, same as
-- policy_values (0049) and the risk-engine tables (0042).
