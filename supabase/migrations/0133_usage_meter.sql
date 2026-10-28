-- GSPS — the free-tier usage meter (owner, 2026-10-28: "track how close we are
-- to reaching our limit(s)", alerts at 25 to 99%, and "never allow us to use
-- all 100% of our limits unless it is within the last two days of the allotted
-- month"). Read and written by /api/ops/usage (lib/ops/usageStore.ts) with the
-- service role only; no member reads these rows.
--
--   usage_events     one row per use reported: a CI job's billed minutes, a
--                    deployment, or a reconciliation from a measured count.
--                    `key` makes a report idempotent (a retried job or a
--                    second workflow reporting the same deployment counts once).
--   usage_alerts     the thresholds already sent, one per meter, period and
--                    threshold, so each is sent once a period.
--   usage_readings   each meter's latest reading and hold, written by every
--                    check and report, so a session (or the merge queue)
--                    reads the hold with one select, without the secret.
--   usage_overrides  an urgent production fix the owner approved, letting it
--                    through the 99% hold until `until`.
--
-- The hourly check reads the database's size and the email ledger, which no
-- event reports (pg_cron, as the other scheduled jobs: migration 0089).
--
-- To stop the hourly check:
--   select cron.unschedule('gsps-usage-check');

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  meter text not null check (meter in ('github_actions', 'vercel_deployments')),
  units numeric not null check (units >= 0),
  key text not null unique,
  detail jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists usage_events_meter_time_idx on public.usage_events (meter, occurred_at);

create table if not exists public.usage_alerts (
  meter text not null,
  period_key text not null,
  threshold integer not null,
  used numeric not null,
  sent_at timestamptz not null default now(),
  primary key (meter, period_key, threshold)
);

create table if not exists public.usage_readings (
  meter text primary key,
  used numeric not null,
  usage_limit numeric not null,
  percent numeric not null,
  hold boolean not null,
  reason text not null,
  read_at timestamptz not null default now()
);

create table if not exists public.usage_overrides (
  id bigint generated always as identity primary key,
  meter text not null,
  until timestamptz not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.usage_events enable row level security;
alter table public.usage_alerts enable row level security;
alter table public.usage_overrides enable row level security;
alter table public.usage_readings enable row level security;
revoke all on public.usage_events, public.usage_alerts, public.usage_overrides, public.usage_readings from anon, authenticated;

-- The database's size, for the meter. Service role only.
create or replace function public.usage_database_bytes()
returns bigint
language sql
stable
security definer
set search_path = public
as $fn$
  select pg_database_size(current_database());
$fn$;

revoke execute on function public.usage_database_bytes() from public, anon, authenticated;
grant execute on function public.usage_database_bytes() to service_role;

-- A meter's total over a window, summed in the database: a month of CI jobs
-- runs to thousands of rows, past the API's 1,000-row page. Service role only.
create or replace function public.usage_sum(p_meter text, p_since timestamptz, p_until timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(sum(units), 0) from public.usage_events
  where meter = p_meter and occurred_at >= p_since and occurred_at <= p_until;
$fn$;

revoke execute on function public.usage_sum(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.usage_sum(text, timestamptz, timestamptz) to service_role;

select cron.schedule('gsps-usage-check', '7 * * * *', $$select gsps_ops.call_endpoint('/api/ops/usage?check=1')$$);
