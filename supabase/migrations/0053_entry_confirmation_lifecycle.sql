-- Mandatory entry confirmation + idempotent candidate-plan creation, per the
-- "GSPS Implementation Brief" single-source-of-truth spec pack (2026-08-31).
--
-- Two additive changes to public.trade_plans (0045_trade_plan_lifecycle.sql):
--
-- 1. A new pre-entry state, `awaiting_entry_confirmation`, inserted between
--    `qualified` and `armed`. Per the spec: "Price often breaks/sweeps beyond
--    an entry level before returning. A touch, break, sweep, or indicator
--    flip alone is not an executable entry." A plan auto-created from a
--    qualifying signal now stops at this state instead of jumping straight
--    to `armed`; `armed` is only reachable once entry-confirmation evidence
--    (recorded in the new `entry_confirmation` column) proves a completed
--    break/retest/confirmation sequence. See lib/lifecycle/entryConfirmation.ts
--    for the evidence shape and the `entryReady` gate, and
--    lib/lifecycle/transitions.ts for the enforcement on the `arm` event.
--
-- 2. `signal_fingerprint` + a partial unique index, so a scan rerunning the
--    same qualifying signal (same ticker/timeframe/strategy version/signal
--    fingerprint) cannot create a second candidate plan. NULL fingerprints
--    (plans created before this migration, or by a caller that supplies
--    none) are excluded from the uniqueness check rather than colliding on
--    NULL = NULL, which Postgres already treats as distinct -- the `where`
--    clause is belt-and-suspenders documentation of that fact.
--
-- Also extends trade_plan_audit.kind with `plan_auto_created`, the event the
-- spec requires ("PLAN_AUTO_CREATED_FROM_QUALIFYING_SIGNAL") every
-- scan-pipeline-originated plan must record.
--
-- Rollback:
--   alter table public.trade_plan_audit drop constraint trade_plan_audit_kind_check;
--   alter table public.trade_plan_audit add constraint trade_plan_audit_kind_check
--     check (kind in ('plan_edit', 'user_action', 'price_event', 'notification', 'execution', 'imported_fill'));
--   drop index if exists public.trade_plans_signal_fingerprint_idx;
--   alter table public.trade_plans drop column if exists signal_fingerprint;
--   alter table public.trade_plans drop column if exists entry_confirmation;
--   alter table public.trade_plans drop constraint trade_plans_state_check;
--   alter table public.trade_plans add constraint trade_plans_state_check
--     check (state in ('watchlist', 'qualified', 'armed', 'entered', 'tp1_reached',
--       'tp2_reached', 'master_reached', 'runner', 'closed', 'expired', 'invalidated'));
--   (Only safe to roll back while no row is in `awaiting_entry_confirmation`.)

alter table public.trade_plans
  add column if not exists signal_fingerprint text,
  add column if not exists entry_confirmation jsonb not null default '{}'::jsonb;

create unique index if not exists trade_plans_signal_fingerprint_idx
  on public.trade_plans (user_id, instrument, timeframe, strategy_version, signal_fingerprint)
  where signal_fingerprint is not null;

alter table public.trade_plans drop constraint if exists trade_plans_state_check;
alter table public.trade_plans add constraint trade_plans_state_check
  check (state in (
    'watchlist', 'qualified', 'awaiting_entry_confirmation', 'armed', 'entered',
    'tp1_reached', 'tp2_reached', 'master_reached', 'runner',
    'closed', 'expired', 'invalidated'
  ));

alter table public.trade_plan_audit drop constraint if exists trade_plan_audit_kind_check;
alter table public.trade_plan_audit add constraint trade_plan_audit_kind_check
  check (kind in (
    'plan_edit', 'user_action', 'price_event', 'notification', 'execution',
    'imported_fill', 'plan_auto_created'
  ));
