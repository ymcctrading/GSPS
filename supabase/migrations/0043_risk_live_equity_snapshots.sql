-- Novice Risk, Account & Cooldown Engine — live-brokerage equity snapshots.
--
-- lib/risk/metrics.ts needs a time series of account equity to compute the
-- 48h loss, start-of-day loss, and 30-day rolling high-water drawdown — none
-- of which the existing `get_equity_curve` RPC (migration 0023) can answer,
-- since that RPC walks *closed* trades only and these three metrics are
-- explicitly "realized + unrealized" per the spec.
--
-- This table exists to be fed EXCLUSIVELY by lib/risk/service.ts from real,
-- verified live-brokerage reads (lib/risk/live-account.ts) -- never from the
-- paper simulator. The engine's rules do not apply to paper trading, so a
-- paper equity mark has no business in this table; `verified` records
-- whether a given row actually came from a broker read (true) or a
-- fail-closed placeholder (false, see live-account.ts UNREADABLE), never
-- "verified vs. simulated".
--
-- Written opportunistically rather than by a scheduled job: a third Vercel
-- cron is not available (Hobby plan caps at 2/day, both already spoken for
-- -- docs/THIRD_PARTY_LIMITS.md), so this is populated whenever a live-mode
-- order attempt (or, later, any route that reads live account state) already
-- pays for the broker call anyway.
--
-- Same posture as 0036/0042: RLS enabled, owner-read-only, service_role-only
-- write.
--
-- Rollback: `drop table if exists public.risk_live_equity_snapshots cascade;`

create table public.risk_live_equity_snapshots (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references auth.users (id) on delete cascade,
  equity numeric not null,
  verified boolean not null default false,
  recorded_at timestamptz not null default now()
);

create index risk_live_equity_snapshots_profile_recorded_idx
  on public.risk_live_equity_snapshots (profile_id, recorded_at desc);

alter table public.risk_live_equity_snapshots enable row level security;

create policy "own risk live equity snapshots" on public.risk_live_equity_snapshots
  for select using (auth.uid () = profile_id);
