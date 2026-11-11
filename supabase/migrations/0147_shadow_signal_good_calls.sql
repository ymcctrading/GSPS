-- GSPS: score every recorded card as a good or bad call (owner, 2026-11-10).
--
-- Owner's definition: after the entry fills, the first target (TP1) reached
-- before the stop is a good call; the stop first is a bad call; a card that
-- never fills is counted apart. lib/shadow/goodCall.ts is the rule,
-- lib/shadow/evaluate.ts writes it, lib/shadow/daily.ts reads it.
--
-- tp1: the card's first target, as published. Rows recorded before this
--   migration have none (their `target` is the master target), so they get
--   no call and are left out of the good-call tally, not guessed.
-- call_outcome: good | bad | open | unresolved | no_fill; null until read
--   (or no tp1). `unresolved`: filled, neither level reached within the
--   horizon (lib/shadow/goodCall.ts GOOD_CALL_MAX_SESSIONS); never re-read.
--
-- Additive and nullable. DEPLOY ORDER: apply this before the code that
-- writes it is deployed (the recorder's insert and the evaluator's select
-- name both columns and fail without them). The index serves the
-- evaluator's pass over calls still open after the trade's exit.

alter table public.shadow_signals
  add column if not exists tp1 numeric,
  add column if not exists call_outcome text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shadow_signals_call_outcome_check'
  ) then
    alter table public.shadow_signals
      add constraint shadow_signals_call_outcome_check
      check (call_outcome is null or call_outcome in ('good', 'bad', 'open', 'unresolved', 'no_fill'));
  end if;
end $$;

create index if not exists shadow_signals_open_calls_idx
  on public.shadow_signals (checked_at nulls first)
  where call_outcome = 'open';
