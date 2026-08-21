-- Market-wide intraday alerts, written by the scheduled background scan
-- (GitHub Actions → GET /api/intraday-scan with CRON_SECRET, see
-- .github/workflows/intraday-scan.yml) rather than a signed-in user's
-- browser tab. `intraday_alerts` (0016) is per-user by design — its RLS and
-- NOT NULL user_id assume a request made on someone's behalf — so this is a
-- separate table rather than a schema change to that one. Same shape as
-- `daily_scans` (0001): no user_id, readable by any signed-in user, written
-- only by the service role.

create table public.intraday_system_alerts (
  id uuid primary key default gen_random_uuid (),
  symbol text not null,
  signal_id text not null,
  signal_type text not null check (signal_type in ('bullish', 'bearish')),
  score int not null check (score between 0 and 9),
  entry_level numeric,
  stop_loss_level numeric,
  take_profit_1_level numeric,
  poll_cycle_timestamp timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- One row per symbol+signal per scan run, same grain as intraday_alerts.
  unique (symbol, signal_id, poll_cycle_timestamp)
);

create index intraday_system_alerts_poll_cycle_idx on public.intraday_system_alerts (poll_cycle_timestamp desc);
create index intraday_system_alerts_symbol_idx on public.intraday_system_alerts (symbol, created_at desc);

alter table public.intraday_system_alerts enable row level security;

create policy "system intraday alerts readable" on public.intraday_system_alerts
  for select using (auth.role () = 'authenticated');
