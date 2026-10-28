-- GSPS — 0124: keep what each member was shown, one row a setup a day
--
-- visible_scan_results gets a row for every setup on every scan a member is
-- shown: about 25,000 rows (4 MB) a weekday in October 2026 across 24
-- members and 43 scans, of which only about 1,150 are distinct setups a
-- member saw that day (2026-10-26: 25,466 rows, 1,138 distinct; 10-27:
-- 24,974 and 1,148). At that rate it fills the database's 500 MB in about
-- four months (docs/SCALE_AUDIT.md, re-read 2026-10-28).
--
-- Gann kept a record of every trade and read it back; the record of what
-- each member was shown is kept the same way, indefinitely (S-07), but as
-- one row a member, setup, side and New York day: when it was first and
-- last shown, on how many scans, and its best rank. That keeps a verifiable
-- record of what each member was shown and when (the nightly recap judges
-- what members were shown), at about a twentieth of the size. The raw rows
-- stay 14 New York days, for any check that needs a single scan's list, then go.
--
-- Nothing in the app reads visible_scan_results (grep, 2026-10-28: only
-- writers in lib/entitlements/scan-fanout.ts and app/api/batch-scan), so
-- pruning it changes no surface.
--
-- A recurring process that returns rather than drains ("Cycles as
-- architecture"): each run rolls up every complete New York day still held
-- raw, recomputing it from the rows, so a missed night is caught by the
-- next and a rerun changes nothing.
--
-- Rollback:
--   select cron.unschedule('gsps-visible-scan-rollup');
--   drop function if exists gsps_ops.rollup_visible_scan_results();
--   drop table if exists public.visible_scan_daily;

create table if not exists public.visible_scan_daily (
  profile_id uuid not null references auth.users (id) on delete cascade,
  shown_on date not null,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  first_shown_at timestamptz not null,
  last_shown_at timestamptz not null,
  scans_shown int not null check (scans_shown >= 1),
  best_rank int not null check (best_rank >= 1),
  primary key (profile_id, shown_on, symbol, side)
);

create index if not exists visible_scan_daily_shown_on_idx
  on public.visible_scan_daily (shown_on);

alter table public.visible_scan_daily enable row level security;

create policy "own visible scan daily" on public.visible_scan_daily
  for select using (auth.uid () = profile_id);

create index if not exists visible_scan_results_visible_at_idx
  on public.visible_scan_results (visible_at);

create or replace function gsps_ops.rollup_visible_scan_results()
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  today_ny date := (now() at time zone 'America/New_York')::date;
begin
  insert into public.visible_scan_daily as d
    (profile_id, shown_on, symbol, side, first_shown_at, last_shown_at, scans_shown, best_rank)
  select
    v.profile_id,
    (v.visible_at at time zone 'America/New_York')::date,
    v.symbol,
    v.side,
    min(v.visible_at),
    max(v.visible_at),
    count(distinct v.scan_execution_id),
    min(v.rank)
  from public.visible_scan_results v
  where (v.visible_at at time zone 'America/New_York')::date < today_ny
  group by 1, 2, 3, 4
  on conflict (profile_id, shown_on, symbol, side) do update set
    first_shown_at = excluded.first_shown_at,
    last_shown_at  = excluded.last_shown_at,
    scans_shown    = excluded.scans_shown,
    best_rank      = excluded.best_rank;

  -- Whole New York days only, so every day still held raw is complete and
  -- recomputing it above never overwrites a day with part of its rows.
  delete from public.visible_scan_results
  where visible_at < ((today_ny - 14)::timestamp at time zone 'America/New_York');
end;
$fn$;

revoke execute on function gsps_ops.rollup_visible_scan_results() from public, anon, authenticated;

-- 08:00 UTC daily: after every evening job, before the premarket scan.
select cron.schedule('gsps-visible-scan-rollup', '0 8 * * *', $$select gsps_ops.rollup_visible_scan_results()$$);
