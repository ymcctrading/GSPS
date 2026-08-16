-- Renumbered from 0008_intraday_alerts.sql: it originally shared the 0008
-- prefix with 0008_order_lifecycle_reconciliation.sql. A lexicographic sort
-- would apply this one first, which is backwards from how the two were
-- actually rolled out (see CHANGELOG.md). Content unchanged; already-applied
-- databases are unaffected by the rename.
--
-- Intraday Alerts Table
-- Tracks alert triggers within a trading day, enabling repeated signals to re-alert on each polling cycle.
-- This allows the same signal to trigger an alert again if it persists or repeats in subsequent polls.

-- ============ intraday_alerts (per-signal, per-poll cycle) ============
create table public.intraday_alerts (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  signal_id text not null, -- links to scan_event.scan_id from a particular scan
  scan_event_id uuid references public.scan_events (id) on delete set null,
  -- Alert metadata
  alert_type text not null check (alert_type in ('new_signal', 'repeated_signal', 'confirmed_signal')),
  score int not null check (score between 0 and 9),
  signal_type text check (signal_type in ('bullish', 'bearish', 'none')),
  timeframe text not null check (timeframe in ('1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w', '1mo', '1y')),
  -- Entry level and targets
  entry_level numeric,
  stop_loss_level numeric,
  take_profit_1_level numeric,
  master_profit_level numeric,
  -- Poll cycle tracking: marks which poll cycle this alert was triggered in
  -- Allows same signal to alert again in next poll if it repeats
  poll_cycle_timestamp timestamptz not null, -- timestamp of the scan/poll that triggered this alert
  -- Notification state
  notified boolean not null default false,
  notified_at timestamptz,
  notified_via text[] not null default '{}', -- e.g., ['email', 'push', 'in_app']
  -- Additional context
  metadata jsonb not null default '{}', -- contextual data: price, bias, gann_root, etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite key: one alert per symbol + signal per poll cycle
  unique (user_id, symbol, signal_id, poll_cycle_timestamp)
);

create index intraday_alerts_user_idx on public.intraday_alerts (user_id, created_at desc);
create index intraday_alerts_symbol_idx on public.intraday_alerts (symbol, created_at desc);
create index intraday_alerts_signal_idx on public.intraday_alerts (signal_id);
create index intraday_alerts_poll_cycle_idx on public.intraday_alerts (poll_cycle_timestamp desc);
create index intraday_alerts_notified_idx on public.intraday_alerts (user_id, notified) where notified = false;

alter table public.intraday_alerts enable row level security;

create policy "own intraday alerts" on public.intraday_alerts
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);
