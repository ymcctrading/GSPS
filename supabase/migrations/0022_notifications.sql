-- Notification system infrastructure
-- Supports email, SMS, and browser push with quiet hours and history tracking

create type notification_channel as enum ('email', 'sms', 'push');
create type notification_status as enum ('pending', 'sent', 'failed', 'bounced');

-- ============ notification_preferences ============
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- channel toggles
  email_enabled boolean default true,
  sms_enabled boolean default false,
  push_enabled boolean default false,

  -- alert filtering
  min_score int default 5 check (min_score >= 0 and min_score <= 9),
  notify_on_verdict text default 'execute' check (notify_on_verdict in ('execute', 'watch', 'any')),

  -- quiet hours (24-hour format, per timezone)
  quiet_hours_enabled boolean default false,
  quiet_start time,  -- e.g. 21:00:00 (9pm)
  quiet_end time,    -- e.g. 06:00:00 (6am)
  user_timezone text default 'America/New_York',

  -- contact info
  phone_number text,  -- E.164 format: +1234567890

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index notification_preferences_user_idx on public.notification_preferences (user_id);

alter table public.notification_preferences enable row level security;

create policy "own notification preferences" on public.notification_preferences
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ notification_log ============
create table public.notification_log (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- what triggered the notification
  scan_result_id uuid references public.scan_results (id) on delete set null,
  symbol text not null,
  direction text not null check (direction in ('bullish', 'bearish')),
  score int not null check (score between 0 and 9),

  -- delivery details
  channel notification_channel not null,
  status notification_status not null default 'pending',
  recipient text,  -- email address or phone number

  -- timing
  triggered_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,

  -- error tracking
  error_message text,
  provider_response jsonb,  -- SendGrid/Twilio response

  -- for dedup: track if already sent for this symbol in the last N hours
  signal_hash text,  -- hash of symbol+direction+score to avoid dupes

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notification_log_user_created_idx on public.notification_log (user_id, created_at desc);
create index notification_log_symbol_idx on public.notification_log (user_id, symbol, created_at desc);
create index notification_log_status_idx on public.notification_log (status) where status != 'sent';
create index notification_log_signal_hash_idx on public.notification_log (user_id, signal_hash, created_at desc);

alter table public.notification_log enable row level security;

create policy "own notification log" on public.notification_log
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ Helper function: check if in quiet hours ============
create or replace function public.is_in_quiet_hours(user_id uuid)
returns boolean as $$
declare
  prefs public.notification_preferences;
  current_time time;
  user_tz text;
begin
  select * into prefs from public.notification_preferences where user_id = $1;

  if prefs is null or not prefs.quiet_hours_enabled then
    return false;
  end if;

  user_tz := coalesce(prefs.user_timezone, 'America/New_York');
  current_time := (now() at time zone user_tz)::time;

  -- if quiet_start < quiet_end (e.g., 21:00 - 06:00 wrapped overnight)
  if prefs.quiet_start < prefs.quiet_end then
    return current_time >= prefs.quiet_start and current_time < prefs.quiet_end;
  else
    -- wraps overnight (e.g., 21:00 to 06:00)
    return current_time >= prefs.quiet_start or current_time < prefs.quiet_end;
  end if;
end;
$$ language plpgsql security definer;

-- ============ Helper function: get enabled channels for user ============
create or replace function public.get_enabled_notification_channels(user_id uuid)
returns notification_channel[] as $$
declare
  channels notification_channel[];
  prefs public.notification_preferences;
begin
  select * into prefs from public.notification_preferences where user_id = $1;

  if prefs is null then
    return '{email}'::notification_channel[];
  end if;

  select array_agg(channel) into channels
  from (
    select 'email'::notification_channel as channel where prefs.email_enabled
    union all
    select 'sms'::notification_channel as channel where prefs.sms_enabled
    union all
    select 'push'::notification_channel as channel where prefs.push_enabled
  ) c;

  return coalesce(channels, '{}'::notification_channel[]);
end;
$$ language plpgsql security definer;
