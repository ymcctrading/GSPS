-- Notification system: per-user delivery preferences and a send log.
--
-- Email/phone are captured from the session when a user first saves
-- preferences (not read back out of auth.users on every dispatch), so the
-- daily/intraday dispatch paths can query this table alone with the
-- service-role client rather than joining into the auth schema.

-- ============ notification_preferences ============
create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  phone_number text,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  daily_scan_enabled boolean not null default true,
  intraday_alert_enabled boolean not null default true,
  -- Alerts below this score (0-9, same scale as scan_results/daily_scans) are
  -- never sent, regardless of channel.
  min_score int not null default 7 check (min_score between 0 and 9),
  -- Minutes since local midnight (0-1439). Both null = no quiet hours. A
  -- start > end window wraps past midnight (e.g. 22:00-06:00).
  quiet_hours_start smallint check (quiet_hours_start between 0 and 1439),
  quiet_hours_end smallint check (quiet_hours_end between 0 and 1439),
  timezone text not null default 'America/New_York',
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "own notification preferences" on public.notification_preferences
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ notification_log (alert history) ============
create table public.notification_log (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  source text not null check (source in ('daily_scan', 'intraday_alert')),
  source_id text,
  symbols text[] not null default '{}',
  subject text,
  status text not null check (status in ('sent', 'failed', 'skipped_quiet_hours', 'skipped_disabled')),
  error text,
  created_at timestamptz not null default now()
);

create index notification_log_user_idx on public.notification_log (user_id, created_at desc);

alter table public.notification_log enable row level security;

-- Readable and insertable by the owning user (the intraday path dispatches
-- with the user's own session client); the daily-scan fan-out writes other
-- users' rows too, which only the service role can do (bypasses RLS).
create policy "own notification log read" on public.notification_log
  for select using (auth.uid () = user_id);

create policy "own notification log insert" on public.notification_log
  for insert with check (auth.uid () = user_id);
