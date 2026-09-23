-- Drops the confluence-module evaluation audit trail 0048 created
-- (gann_evaluations, sara_evaluations) and the trade_plans columns 0048
-- added to reference it, per the 2026-09-17 orphan-module audit's decision
-- on what that audit trail was actually for.
--
-- Zero rows were ever written to either table. 0048's own comment already
-- called them "unscheduled follow-up work" the day it shipped, and 0065's
-- header (a later migration, same audit thread) reconfirmed "nothing reads
-- CONFLUENCE_MODULES either -- the module registry and the
-- gann_evaluations/sara_evaluations audit-trail tables 0048 created are all
-- still unwired... it does not make the non-drift guarantee real."
--
-- Per AGENTS.md's Gann-grounded-platform audit obligation, an unwired
-- component is a defect to justify or replace, not a thing to leave parked
-- indefinitely. This audit's finding: persistence was never genuinely
-- needed for what these two tables actually promised. Both modules already
-- carry a per-output `ConfluenceEvidence.explanationTrace` in-process (see
-- lib/signals/confluence/types.ts) and attach it to `ScanResult.signals` on
-- every scan -- the "versioned and reconstructible from stored inputs"
-- requirement (docs/GANN_SARA_CONFLUENCE.md's acceptance table) is already
-- met at the point a caller actually needs it, without a second,
-- never-written persistence layer duplicating it. Building the write path
-- properly (a `signal_id` scheme, a write on every scan without slowing the
-- scan path, RLS-correct linking back to whichever `trade_plan` it informed)
-- is real, unscheduled work with no requester and no roadmap phase behind
-- it -- keeping the schema live "so it can land without a further migration"
-- (0048's own words) is exactly the kind of neutral-default non-Gann
-- infrastructure the audit obligation says to justify or remove, not carry
-- forever on the strength of a name. `strategy_modules` is NOT touched by
-- this migration -- it has a real, if thin, purpose (queryable module
-- identity independent of a deploy) and is now checked for drift against
-- lib/signals/confluence/registry.ts's CONFLUENCE_MODULES by
-- lib/signals/confluence/__tests__/registry-db-alignment.test.ts, added in
-- the same change as this migration.
--
-- If a real requirement for a persisted per-scan confluence audit trail
-- shows up later, re-derive the schema against that requirement rather than
-- reviving this one verbatim -- these two tables were speced before any
-- concrete consumer existed, which is exactly the design that let them go
-- unwired for three weeks. Rollback (recreating the original 0048 shape) is
-- `0048_gann_sara_confluence_modules.sql` itself, replayed after this
-- migration.

alter table public.trade_plans
  drop column if exists gann_alignment,
  drop column if exists sara_alignment,
  drop column if exists gann_module_version,
  drop column if exists sara_module_version,
  drop column if exists gann_evaluation_id,
  drop column if exists sara_evaluation_id;

drop table if exists public.sara_evaluations;
drop table if exists public.gann_evaluations;
