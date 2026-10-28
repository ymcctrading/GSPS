# Evaluation ledger: a proposal, not applied

Status: **proposed only.** This SQL is not in `supabase/migrations/` and has not been
applied anywhere. It needs Chuck's approval, then a numbered migration, then the
migration applied before any code that writes it is merged.

## Why

The October 27 recap had to rebuild what happened to each stock from five tables that
were never designed to answer "how far did this stock get":

- `coarse_gate_telemetry` keeps one row per stock per day, and each scan overwrites it.
  The day's last reading survives. When a stock first cleared the pre-filter is lost.
  `updated_at` is never refreshed (no trigger), so it can't date the reading either.
- `universe_sweep` stores the selected candidate only. It keeps no stop, no targets
  and none of the alternatives it set aside.
- `intraday_focus` stores the list. Nothing records which names the scan actually
  timed, or which it deferred for capacity.
- `intraday_system_alerts` stores detections. The bar that was read is in
  `metadata.dataTimestamp`, and when its data could first be seen is stored nowhere.
- Deliveries are spread over the bell, the panel, email and push.

## Design

One row per **(session date, symbol)**, written with an upsert. Each stage keeps the
*first* time it was reached, so the row is written at most a few times a session.
There is never a row per quote or per scan.

```sql
create table public.evaluation_ledger (
  session_date        date        not null,
  symbol              text        not null,
  -- Pre-session standing (read once, from the lists built before the open)
  focus_basis_date    date,
  focus_rank          smallint,
  sweep_state         text,
  sweep_score         numeric(3,1),
  sweep_direction     text,
  sweep_entry         numeric,
  -- First time each stage was reached that session (null = never)
  first_prefilter_at  timestamptz,
  first_shortlist_at  timestamptz,
  first_full_score    numeric(3,1),
  first_full_state    text,
  first_queued_at     timestamptz,
  queue_tier          text,
  deferred_scans      smallint    not null default 0,
  first_discovery_at  timestamptz,
  discovery_kinds     text[],
  -- Detection timing kept apart: market event, data availability, evaluation
  first_detect_kind   text,
  first_detect_bar_open   timestamptz,  -- market event (the bar read)
  first_detect_usable_at  timestamptz,  -- bar close + feed delay
  first_detect_eval_at    timestamptz,  -- when the scan evaluated it
  first_delivered_at  timestamptz,      -- first reached a member
  strategy_version    text,
  updated_at          timestamptz not null default now(),
  primary key (session_date, symbol)
);

alter table public.evaluation_ledger enable row level security;
-- No policies: service role only. Hindsight data goes to the owner's two
-- accounts through owner-gated routes (lib/auth/owner.ts), never to a member.
revoke all on public.evaluation_ledger from anon, authenticated;

create index evaluation_ledger_session_idx on public.evaluation_ledger (session_date);

-- Write rule: each first_* column is set only while it is null, so a repeated
-- or late write can't move a first time later. Upserts go through this
-- function, which the service role calls in batches of ~200 rows.
create or replace function public.ledger_touch(rows jsonb) returns void
language sql security invoker as $$
  insert into public.evaluation_ledger as l (session_date, symbol, first_prefilter_at, first_shortlist_at,
    first_full_score, first_full_state, first_queued_at, queue_tier, first_discovery_at, discovery_kinds,
    first_detect_kind, first_detect_bar_open, first_detect_usable_at, first_detect_eval_at, first_delivered_at,
    strategy_version)
  select (r->>'session_date')::date, r->>'symbol', (r->>'first_prefilter_at')::timestamptz,
    (r->>'first_shortlist_at')::timestamptz, (r->>'first_full_score')::numeric, r->>'first_full_state',
    (r->>'first_queued_at')::timestamptz, r->>'queue_tier', (r->>'first_discovery_at')::timestamptz,
    case when r ? 'discovery_kinds' then array(select jsonb_array_elements_text(r->'discovery_kinds')) end,
    r->>'first_detect_kind', (r->>'first_detect_bar_open')::timestamptz, (r->>'first_detect_usable_at')::timestamptz,
    (r->>'first_detect_eval_at')::timestamptz, (r->>'first_delivered_at')::timestamptz, r->>'strategy_version'
  from jsonb_array_elements(rows) r
  on conflict (session_date, symbol) do update set
    first_prefilter_at     = coalesce(l.first_prefilter_at, excluded.first_prefilter_at),
    first_shortlist_at     = coalesce(l.first_shortlist_at, excluded.first_shortlist_at),
    first_full_score       = coalesce(l.first_full_score, excluded.first_full_score),
    first_full_state       = coalesce(l.first_full_state, excluded.first_full_state),
    first_queued_at        = coalesce(l.first_queued_at, excluded.first_queued_at),
    queue_tier             = coalesce(l.queue_tier, excluded.queue_tier),
    first_discovery_at     = coalesce(l.first_discovery_at, excluded.first_discovery_at),
    discovery_kinds        = coalesce(l.discovery_kinds, excluded.discovery_kinds),
    first_detect_kind      = coalesce(l.first_detect_kind, excluded.first_detect_kind),
    first_detect_bar_open  = coalesce(l.first_detect_bar_open, excluded.first_detect_bar_open),
    first_detect_usable_at = coalesce(l.first_detect_usable_at, excluded.first_detect_usable_at),
    first_detect_eval_at   = coalesce(l.first_detect_eval_at, excluded.first_detect_eval_at),
    first_delivered_at     = coalesce(l.first_delivered_at, excluded.first_delivered_at),
    strategy_version       = coalesce(l.strategy_version, excluded.strategy_version),
    updated_at             = now()
  -- Skip the write entirely when nothing new would be set.
  where (l.first_prefilter_at is null and excluded.first_prefilter_at is not null)
     or (l.first_shortlist_at is null and excluded.first_shortlist_at is not null)
     or (l.first_queued_at is null and excluded.first_queued_at is not null)
     or (l.first_discovery_at is null and excluded.first_discovery_at is not null)
     or (l.first_detect_eval_at is null and excluded.first_detect_eval_at is not null)
     or (l.first_delivered_at is null and excluded.first_delivered_at is not null);
$$;
revoke all on function public.ledger_touch(jsonb) from public, anon, authenticated;

-- Retention: 400 days (a year of sessions plus a quarter to compare against).
select cron.schedule('evaluation-ledger-retention', '30 9 * * 0',
  $$delete from public.evaluation_ledger where session_date < current_date - 400$$);
```

`deferred_scans` is counted in a separate, bounded update by the intraday scan: one
statement per scan for the deferred names, `deferred_scans = least(deferred_scans + 1, 32767)`.

## Cost (estimated, not measured)

- **Rows:** about 836 symbols a session at most, about 210,000 a year, and fewer in
  practice, since a row exists only once a stock reaches a stage. At roughly 300 bytes
  a row plus the index, that is about 70 MB at the 400-day cap.
- **Writes:** most scans change nothing, and the `where` clause skips the update. A
  write happens only the first time a stage is reached: roughly one batched call per
  scan.
- **Scan latency:** one batched RPC per scan, run after the scan's own writes.
  Measure it with the scan's `mark()` breadcrumbs before calling it acceptable.

## Rollout

1. Chuck approves the table and the retention period.
2. The migration is numbered and applied.
3. The writers merge behind `GSPS_EVALUATION_LEDGER=1`, off by default:
   - the market scan writes the pre-filter, shortlist and discovery stages;
   - the intraday scan writes the queue and detection stages;
   - the delivery modules write the delivered stage.
4. The recap reads the ledger first and falls back to today's reconstruction.

None of the writers are built yet.
