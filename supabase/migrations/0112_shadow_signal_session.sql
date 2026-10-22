-- The forward test's call is a plan on the session it trades (2026-10-22).
--
-- Every signal before today was recorded after the close (20:29 to 22:19 UTC)
-- and walked against the rest of that day, where nothing can fill. Gann chose
-- his stocks from the completed daily charts the night before and traded them
-- in the next session, so `session_date` is the New York session a signal
-- trades: its own day when recorded before the close, otherwise the next
-- trading day (lib/shadow/record.ts#shadowTradeSession, which writes it from
-- now on). Two runs on one session recorded the same plan twice (four pairs on
-- 2026-10-19), so one plan is now one row a session.
--
-- Backfill: weekday rule only. No row recorded before this migration falls
-- next to a market holiday or an early close (all are 2026-09-29 to
-- 2026-10-22), so the calendar module's holidays are not needed here. Every
-- stored symbol is a US equity or fund (checked 2026-10-22); a crypto pair is
-- matched by its slash, as the scans write it.
--
-- `checked_at` is when the evaluator last read a still-pending row, so each
-- pass turns to the rows read least recently and a trade held for days never
-- crowds out newer ones (lib/shadow/evaluate.ts).
--
-- Rollback:
--   drop index if exists public.shadow_signals_plan_session_idx;
--   alter table public.shadow_signals drop column if exists checked_at;
--   alter table public.shadow_signals drop column if exists session_date;
-- (the duplicate rows removed below are not restored; they were copied to
-- /mnt/project-files/shadow/ before this was applied).

-- No scan inserts between the backfill, the dedupe and the index.
lock table public.shadow_signals in share row exclusive mode;

alter table public.shadow_signals add column if not exists session_date date;
alter table public.shadow_signals add column if not exists checked_at timestamptz;

update public.shadow_signals s
set session_date = case
  when s.symbol like '%/%' then (s.scanned_at at time zone 'America/New_York')::date
  when extract(isodow from (s.scanned_at at time zone 'America/New_York')) between 1 and 5
    and (s.scanned_at at time zone 'America/New_York')::time < time '16:00'
    then (s.scanned_at at time zone 'America/New_York')::date
  else (
    select d::date
    from generate_series(
      (s.scanned_at at time zone 'America/New_York')::date + 1,
      (s.scanned_at at time zone 'America/New_York')::date + 7,
      interval '1 day'
    ) d
    where extract(isodow from d) between 1 and 5
    order by d
    limit 1
  )
end
where s.session_date is null;

-- One row a plan a session: keep the first recorded, drop the repeats.
delete from public.shadow_signals s
using public.shadow_signals k
where s.strategy_version = k.strategy_version
  and s.symbol = k.symbol
  and s.direction = k.direction
  and s.entry = k.entry
  and s.stop_loss = k.stop_loss
  and s.session_date = k.session_date
  and (k.created_at, k.id) < (s.created_at, s.id);

-- The recorder's upsert conflict target. Not partial, so PostgREST can name
-- it; a row with no session (none after this migration) never conflicts.
create unique index if not exists shadow_signals_plan_session_idx
  on public.shadow_signals (strategy_version, symbol, direction, entry, stop_loss, session_date);
