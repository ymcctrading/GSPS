-- GSPS — 0116: the scan's profile fan-out runs as its own job
--
-- Production bug, 2026-10-22. The scheduled market scan fanned each run out to
-- every member (visible results, monitors, alerts) inside the scan's own 60s
-- request, starting new members only before +45s. The scan finishes its own
-- work at about +42s to +48s, so on 10 of that day's 19 runs the fan-out
-- reached no member at all, on the rest at most 6 of 24 (one round of
-- `FAN_OUT_CONCURRENCY`), and at 21:45 UTC the six it started ran the request
-- past 60s. Now the scan stores what the fan-out needs here and returns; the
-- worker route (/api/scan-fanout, lib/entitlements/fanout-queue.ts) reads it
-- every minute and works through the members with a budget of its own,
-- recording each one done so the next call resumes where the last stopped.
--
-- Server-only: written and read with the service role. RLS is on with no
-- policy, so no member can read either table (the payload carries the full
-- scan results, breakdown included, which stay server-side: R-021).
--
-- Forward-only.
--
-- Rollback:
--   select cron.unschedule('gsps-scan-fanout');
--   drop table if exists public.scan_fanout_job_profiles;
--   drop table if exists public.scan_fanout_jobs;

create table if not exists public.scan_fanout_jobs (
  id uuid primary key default gen_random_uuid(),
  scan_execution_id uuid not null references public.scan_executions (id) on delete cascade,
  source text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  claimed_until timestamptz,
  completed_at timestamptz,
  outcome text check (outcome in ('completed', 'superseded', 'expired'))
);

create index if not exists scan_fanout_jobs_pending_idx
  on public.scan_fanout_jobs (created_at desc)
  where completed_at is null;

alter table public.scan_fanout_jobs enable row level security;

create table if not exists public.scan_fanout_job_profiles (
  job_id uuid not null references public.scan_fanout_jobs (id) on delete cascade,
  profile_id uuid not null,
  done_at timestamptz not null default now(),
  primary key (job_id, profile_id)
);

alter table public.scan_fanout_job_profiles enable row level security;

-- Every minute while any scheduled scan can run (10:30 UTC prep through the
-- 21:45 market scan), weekdays. A call with nothing pending reads one row and
-- returns. Until the route is deployed the call returns 404 and nothing
-- happens.
select cron.schedule('gsps-scan-fanout', '* 10-22 * * 1-5', $$select gsps_ops.call_endpoint('/api/scan-fanout')$$);
