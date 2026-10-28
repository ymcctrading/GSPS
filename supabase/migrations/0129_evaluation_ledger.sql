-- GSPS — 0129: the evaluation ledger, how far each stock got each session
--
-- Owner, 2026-10-28 ("I approve all 5", on the October 27 coverage report):
-- one row per session and symbol recording the first time each stage of the
-- pipeline was reached, so the owner's recap reads what happened instead of
-- rebuilding it from tables that overwrite themselves
-- (docs/proposals/2026-10-28-evaluation-ledger.md has the reasoning).
--
-- Bounded by design: at most one row per symbol per session, written only the
-- first time a stage is reached (a write that would set nothing is skipped),
-- never a row per quote or per scan. Kept 400 days (owner-approved).
--
-- Hindsight data: service role only. RLS on with no policy, and every grant
-- revoked from members; it reaches the owner's two accounts through
-- owner-gated routes only (lib/auth/owner.ts) and never feeds a score, plan,
-- order or notification. The intraday scan reads the session's discoveries
-- from it to give them queue slots (lib/scanner/queue.ts): an examination
-- order, not a trade.
--
-- Rollback:
--   select cron.unschedule('evaluation-ledger-retention');
--   drop function if exists public.ledger_touch(jsonb);
--   drop function if exists public.ledger_deferred(date, text[]);
--   drop table if exists public.evaluation_ledger;

create table if not exists public.evaluation_ledger (
  session_date            date        not null,
  symbol                  text        not null,
  first_prefilter_at      timestamptz,
  first_shortlist_at      timestamptz,
  first_full_score        numeric(3,1),
  first_full_state        text,
  first_discovery_at      timestamptz,
  discovery_rank          smallint,
  discovery_kinds         text[],
  discovery_data_as_of    timestamptz,
  first_queued_at         timestamptz,
  queue_tier              text,
  deferred_scans          smallint    not null default 0 check (deferred_scans >= 0),
  first_detect_kind       text,
  first_detect_side       text,
  first_detect_bar_open   timestamptz,
  first_detect_usable_at  timestamptz,
  first_detect_eval_at    timestamptz,
  strategy_version        text,
  updated_at              timestamptz not null default now(),
  primary key (session_date, symbol)
);

alter table public.evaluation_ledger enable row level security;
revoke all on public.evaluation_ledger from anon, authenticated;

create index if not exists evaluation_ledger_discovery_idx
  on public.evaluation_ledger (session_date, first_discovery_at desc)
  where first_discovery_at is not null;

-- Each first_* column is set only while it is null, so a repeated or late
-- write can't move a first time. A row whose write would set nothing new is
-- skipped by the WHERE clause. Batches of up to a few hundred rows.
create or replace function public.ledger_touch(p_rows jsonb)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  insert into public.evaluation_ledger as l (
    session_date, symbol, first_prefilter_at, first_shortlist_at, first_full_score, first_full_state,
    first_discovery_at, discovery_rank, discovery_kinds, discovery_data_as_of, first_queued_at, queue_tier,
    first_detect_kind, first_detect_side, first_detect_bar_open, first_detect_usable_at, first_detect_eval_at,
    strategy_version)
  select
    (r->>'session_date')::date, upper(r->>'symbol'),
    (r->>'first_prefilter_at')::timestamptz, (r->>'first_shortlist_at')::timestamptz,
    (r->>'first_full_score')::numeric, r->>'first_full_state',
    (r->>'first_discovery_at')::timestamptz, (r->>'discovery_rank')::smallint,
    case when jsonb_typeof(r->'discovery_kinds') = 'array' then array(select jsonb_array_elements_text(r->'discovery_kinds')) end,
    (r->>'discovery_data_as_of')::timestamptz,
    (r->>'first_queued_at')::timestamptz, r->>'queue_tier',
    r->>'first_detect_kind', r->>'first_detect_side', (r->>'first_detect_bar_open')::timestamptz,
    (r->>'first_detect_usable_at')::timestamptz, (r->>'first_detect_eval_at')::timestamptz,
    r->>'strategy_version'
  from jsonb_array_elements(p_rows) r
  where r->>'session_date' is not null and coalesce(r->>'symbol', '') <> ''
  on conflict (session_date, symbol) do update set
    first_prefilter_at     = coalesce(l.first_prefilter_at, excluded.first_prefilter_at),
    first_shortlist_at     = coalesce(l.first_shortlist_at, excluded.first_shortlist_at),
    first_full_score       = coalesce(l.first_full_score, excluded.first_full_score),
    first_full_state       = coalesce(l.first_full_state, excluded.first_full_state),
    first_discovery_at     = coalesce(l.first_discovery_at, excluded.first_discovery_at),
    discovery_rank         = coalesce(l.discovery_rank, excluded.discovery_rank),
    discovery_kinds        = coalesce(l.discovery_kinds, excluded.discovery_kinds),
    discovery_data_as_of   = coalesce(l.discovery_data_as_of, excluded.discovery_data_as_of),
    first_queued_at        = coalesce(l.first_queued_at, excluded.first_queued_at),
    queue_tier             = coalesce(l.queue_tier, excluded.queue_tier),
    first_detect_kind      = coalesce(l.first_detect_kind, excluded.first_detect_kind),
    first_detect_side      = coalesce(l.first_detect_side, excluded.first_detect_side),
    first_detect_bar_open  = coalesce(l.first_detect_bar_open, excluded.first_detect_bar_open),
    first_detect_usable_at = coalesce(l.first_detect_usable_at, excluded.first_detect_usable_at),
    first_detect_eval_at   = coalesce(l.first_detect_eval_at, excluded.first_detect_eval_at),
    strategy_version       = coalesce(l.strategy_version, excluded.strategy_version),
    updated_at             = now()
  where (l.first_prefilter_at is null and excluded.first_prefilter_at is not null)
     or (l.first_shortlist_at is null and excluded.first_shortlist_at is not null)
     or (l.first_discovery_at is null and excluded.first_discovery_at is not null)
     or (l.first_queued_at is null and excluded.first_queued_at is not null)
     or (l.first_detect_eval_at is null and excluded.first_detect_eval_at is not null);
$$;

-- One count per scan for the names the intraday queue deferred for capacity.
create or replace function public.ledger_deferred(p_session date, p_symbols text[])
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  insert into public.evaluation_ledger as l (session_date, symbol, deferred_scans)
  select p_session, upper(s), 1 from unnest(p_symbols) s where coalesce(s, '') <> ''
  on conflict (session_date, symbol) do update set
    deferred_scans = least(l.deferred_scans + 1, 32767),
    updated_at = now();
$$;

revoke all on function public.ledger_touch(jsonb) from public, anon, authenticated;
revoke all on function public.ledger_deferred(date, text[]) from public, anon, authenticated;
grant execute on function public.ledger_touch(jsonb) to service_role;
grant execute on function public.ledger_deferred(date, text[]) to service_role;

-- Retention: 400 days, Sundays 09:30 UTC.
select cron.schedule(
  'evaluation-ledger-retention',
  '30 9 * * 0',
  $$delete from public.evaluation_ledger where session_date < current_date - 400$$
);
