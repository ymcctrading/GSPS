-- Notification log
-- One row per notification attempt (not per alert — a single alert fanned out
-- to email + SMS + push writes up to three rows), backing the settings page's
-- history dashboard and the "send test alert" button's feedback.

create table public.notification_log (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- intraday_alerts has no natural single-row FK target for a fanned-out
  -- notification (one alert, several channels, no unique id column of its
  -- own to point at outside the composite key) — carried as plain text
  -- instead, same tradeoff the column comment in 0008 already accepts for
  -- `signal_id`.
  alert_id uuid references public.intraday_alerts (id) on delete set null,
  symbol text not null,
  channel text not null check (channel in ('email', 'sms', 'push')),
  status text not null check (status in ('sent', 'failed', 'skipped_quiet_hours', 'skipped_preference')),
  message text,
  provider_response text,
  created_at timestamptz not null default now()
);

create index notification_log_user_idx on public.notification_log (user_id, created_at desc);

alter table public.notification_log enable row level security;

create policy "own notification log" on public.notification_log
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);
