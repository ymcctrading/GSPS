-- Suppression log for lib/shadow/compare.ts's operator drift alert email —
-- without it, a persistent drift would re-email the operator on every
-- scheduled-scan run (currently twice a day: the 6:00/9:15 ET jobs in
-- lib/entitlements/scheduled-scan.ts) rather than once until it clears.
--
-- One row per alert actually sent (not per drift check — a withheld/null
-- verdict writes nothing here). `evaluateShadowDrift` reads the most recent
-- row before sending and skips the send (but still returns the `DriftAlert`
-- and still logs the console.warn) if one was sent inside the cooldown
-- window.
--
-- Server-only, same posture as shadow_signals (0053) and every other table
-- this series of migrations has added: RLS enabled, no client select/
-- insert/update policy.
--
-- Rollback: `drop table if exists public.shadow_drift_alerts cascade;`

create table public.shadow_drift_alerts (
  id uuid primary key default gen_random_uuid (),
  reason text not null,
  shadow_trades integer not null,
  shadow_expectancy_r numeric not null,
  backtest_expectancy_r numeric not null,
  alerted_at timestamptz not null default now()
);

create index shadow_drift_alerts_alerted_at_idx
  on public.shadow_drift_alerts (alerted_at desc);

alter table public.shadow_drift_alerts enable row level security;

-- No select/insert/update policy: server-only via service_role.
