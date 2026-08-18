-- Notification preferences
-- One row per user: channel toggles, quiet hours, score threshold, and the
-- per-channel delivery targets (phone number, Web Push subscription).
--
-- Numbered 0021 rather than immediately after the current latest (0009) —
-- several agents are adding migrations in parallel worktrees off the same
-- base branch, and this number was assigned up front so none of them collide.

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Channel toggles. Off by default: notifications are opt-in.
  email_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  push_enabled boolean not null default false,
  -- Quiet hours: a local time-of-day window (not a UTC one) in the user's
  -- timezone, suppressing sends while `now` falls inside [start, end). Equal
  -- start/end means no quiet hours; the pair may wrap past midnight
  -- (e.g. 22:00-06:00), which lib/notifications/quiet-hours.ts accounts for.
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  quiet_hours_enabled boolean not null default false,
  timezone text not null default 'America/New_York',
  -- Delivery targets.
  phone_number text,
  push_subscription jsonb,
  -- Minimum intraday_alerts.score (0-9) required to notify. 7 matches the
  -- app-wide "Execute" threshold (lib/scoring/score.ts).
  min_score int not null default 7 check (min_score between 0 and 9),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "own notification preferences" on public.notification_preferences
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);
