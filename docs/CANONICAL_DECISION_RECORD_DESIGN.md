# Canonical decision record — design

Design PR for the one item `docs/DOCTRINE_ALIGNMENT_STATUS.md` still lists
open, per the sequencing `docs/CANONICAL_DECISION_RECORD_HANDOFF.md` already
laid out: propose the join/field design here, in docs, before writing any
schema. **This document proposes; it does not migrate, backfill, or touch
production.** Read the handoff doc first — this one assumes it.

## What this corrects in the handoff

The handoff describes three schema generations to reconcile
(`scan_results`/`daily_scans`, `scan_executions`/`visible_scan_results`,
`ScanResult`). There is a fourth, from `0005_learning_brain.sql`:
`scan_events`, `signal_lifecycle_events`, `execution_events`, `user_actions`
— a standalone audit-log schema with its own free-text `scan_id`/`signal_id`/
`order_id` keys, never foreign-keyed to `scan_results` at all.

It is also, as far as this repo's call graph shows, **unwired**: `lib/learning/db.ts`
reads/writes it, `lib/learning/record.ts` and `app/api/learning/record-event/route.ts`
expose it, but nothing in the live scan pipeline (`app/api/batch-scan/route.ts`,
`lib/entitlements/scan-fanout.ts`) or the order path (`lib/trade/place-order.ts`)
calls that route or those functions. It is reachable only by a caller invoking
the API directly. This design treats it as a fourth, currently-dormant
generation rather than ignoring it — see "Learning Brain event log" below —
but does not fold it into the canonical record's write path in this pass,
since doing so would be new wiring, not reconciliation of what already runs.

## Decision: the canonical id is `scan_results.id` (and `daily_scans.id`)

No new table. `orders`/`positions` already carry `scan_result_id uuid
references public.scan_results(id)` — that FK is already the trade-lineage
anchor the PRD's "a trade or paper trade can be traced back to the
originating decision record" requires. The gap is entirely that
`scan_results` doesn't yet carry the fields the PRD's Signal Context / Trade
Map entities require, and doesn't link to the model version or the
entitlement-era execution record.

This closes the handoff's open question #3 explicitly: trade lineage keeps
pointing at `scan_results`/`daily_scans`, not at `scan_executions`. Nothing
about `orders.scan_result_id` or `positions.scan_result_id` changes.

`daily_scans` (the market-wide sibling, same migration) gets the identical
new columns for symmetry — it has no per-user order to link, but it is read
for lineage by the same public-facing surfaces and there is no reason its
shape should diverge from `scan_results`.

## New columns (additive migration — not written in this PR)

On both `public.scan_results` and `public.daily_scans`:

| Column | Type | Source | Null means |
|---|---|---|---|
| `scan_execution_id` | `uuid references public.scan_executions(id) on delete set null` | `execution.id`, already in scope in `app/api/batch-scan/route.ts` at the point it calls `persistScanHistory` | Row predates this column, or was written by a path that doesn't create a `scan_executions` row (e.g. `daily_scans`' own cron, which may need its own execution row — see Open questions) |
| `model_version` | `int` | `getActiveWeightSet()`'s existing `version` field (`lib/scoring/active-weights.ts`) — already computed per scan, just never stamped | No live `score_adjustment` model was adopted yet; the scan ran on `DEFAULT_CRITERION_WEIGHTS`. This is real provenance, not a missing value — never backfilled to a guess. |
| `session` | `text` | Whatever the scan pipeline already classifies extended-hours context as (session state used for the reference-price disclosure the PRD requires) | Not classified for this row (pre-dates the column) |
| `timeframe` | `text` | The governing/execution timeframe already resolved per scan (currently lives on `ScanResult`/`executionBar` typing, not persisted) | Same |
| `data_freshness_status` | `text` | `ScanResult.dataLag` (`lib/data/latency.ts` already produces fresh/lagging/stale wording) | Same |
| `pivot_plan` | `text` | `TradeLevels.pivotPlan` (`lib/types.ts`) — currently only reachable via the untyped `detail` jsonb | No trade plan was actionable for this row (Watch/Reject/Stand Down), so there is no counter-scenario to store |
| `record_schema_version` | `smallint not null default 1` | Literal constant at write time | N/A — always set |

`record_schema_version` is deliberately a different field from `model_version`:
the former versions the **shape** of this record (so a future redesign of
what a canonical record contains doesn't have to be inferred from which
columns happen to be null), the latter versions the **scoring** that produced
it. Conflating them would make it impossible to tell "old row, new model"
from "new row, no model" apart.

All seven columns are nullable (`record_schema_version` excepted) and
default-free otherwise, so the migration is a pure additive `ALTER TABLE` —
no backfill, no rewrite of historical rows, nothing existing readers
(`lib/portfolio/reconcile.ts`, `components/scan/*`, `app/api/portfolio/route.ts`,
`app/api/orders/route.ts`) need to change to keep working, per the handoff's
"do not break existing readers" constraint.

## Write-path changes this design implies (a later PR, not this one)

- `app/api/batch-scan/route.ts`'s `persistScanHistory` — populate the seven
  columns from data the request already has in scope (`execution.id`, the
  `getActiveWeightSet()` result, and fields already present on each `r:
  ScanResult`). No new provider fetch, no new query.
- `lib/entitlements/scan-fanout.ts` — same treatment for scheduled-scan writes,
  so scheduled and manual scans produce the same record shape (the doctrine's
  "same rule path" requirement, extended from scoring logic to record format).
- `lib/backtest/*` / `lib/backtest/strategyVersion.ts` — confirm a replay
  stamps the `model_version` and `record_schema_version` it ran against, so a
  backtest result is comparable to a live record's shape rather than merely
  its score.
- The daily cron that writes `daily_scans` — needs its own decision on
  whether each cron run gets a `scan_executions` row (nothing currently
  creates one outside the entitlement/batch-scan path) or whether
  `scan_execution_id` simply stays null for market-wide scans. See Open
  questions.

This is intentionally left for the Write-path PR the handoff's suggested
approach calls for — this design PR fixes the shape, not the callers.

## Learning Brain event log (the fourth generation)

Recommendation: **do not wire `scan_events`/`execution_events` into the
canonical record in this pass.** It is currently dormant (see above); wiring
a dormant audit log into a live write path is new functionality, and the
canonical-decision-record task is reconciliation of what already runs, not
an unrelated feature addition. Two honest options for a later, separate
decision, recorded here so it isn't silently dropped:

1. Retire it — if the Learning Brain event schema was superseded by
   `scan_results` + `learning_models`/`learning_coefficients` and was never
   completed, say so in `docs/MODEL_REGISTRY.md` and stop carrying it as an
   apparently-live table.
2. Wire it — add `scan_result_id uuid references public.scan_results(id)`
   to `scan_events` and `execution_events` (both additive, both empty tables
   in production today so no backfill risk), and call
   `app/api/learning/record-event` from the batch-scan and order-placement
   paths.

Neither is decided here. Flagging it is this design doc's job; picking one
belongs to whoever scopes that follow-up, with the roadmap-phase and
direct-request conventions `AGENTS.md` already requires.

## PRD acceptance criteria, checked against this design

- *A scan can return Stand Down or Wait with an explanation; it must not
  force a directional plan.* — Unaffected; already true (`ScanDecision.outputState`).
- *An actionable Trade Map cannot be generated without a risk level, data
  freshness state, timeframe, and pivot condition.* — This design makes
  `data_freshness_status`, `timeframe`, and `pivot_plan` real, queryable
  columns instead of values that exist only in-memory or buried in `detail`
  jsonb, so this becomes something a database contract test can assert
  directly.
- *A user can inspect why a plan was produced without seeing proprietary
  intermediate formulas.* — Unaffected; `detail` still only ever receives
  `redactScanResult(r).decision.summary`, never the scoring breakdown.
- *A trade or paper trade can be traced back to the originating decision
  record and model version.* — This is the one the design closes:
  `orders.scan_result_id` → `scan_results.model_version` is now one join,
  not an unresolved gap.
- *The same rule path is used consistently in live scanning and
  replay/backtest evaluation.* — Extended by the write-path proposal above
  (backtests stamp the same `model_version`/`record_schema_version` shape).

## Open questions for whoever picks up the Migration PR

1. Does `daily_scans`' cron get its own `scan_executions` row (extending
   that table's `source` check constraint with a `daily_cron` value), or
   does `scan_execution_id` simply stay null for every `daily_scans` row?
   Leaning towards the latter — `scan_executions` was built for the
   entitlement/visibility system, and a market-wide scan has no per-user
   visibility to gate — but this is a real design choice, not a detail.
2. Should `model_version` be constrained to reference
   `learning_models(version)` where `model_type = 'score_adjustment'`? A
   plain FK can't express the composite `(model_type, version)` uniqueness
   without also carrying `model_type` as a column; a `CHECK` against a
   subquery is possible but couples the migration to that table's current
   shape. Proposal: no FK, just a plain `int` — `learning_models` rows are
   never deleted (`status` moves through `draft → approved → live →
   deprecated` in place per its governance rules), so there is no orphan
   risk to guard against with a hard constraint.

## What this design deliberately does not do

- Does not create a sixth schema generation, or a new join table — extends
  the two tables (`scan_results`, `daily_scans`) that already sit at the
  center of the trade-lineage graph.
- Does not touch `learning_models`/`learning_coefficients` governance
  semantics (draft/approved/live/deprecated, never mutated in place) — reads
  that registry's current version, does not change how it's managed.
- Does not apply a migration, backfill a historical row, or change anything
  in production. This is the docs-only first step the handoff's suggested
  approach calls for; the Migration PR is separate, comes after review of
  this design, and needs the same explicit confirmation `AGENTS.md` requires
  for any production-affecting change.
- Does not decide the Learning Brain event log's fate — flags it for a
  separate, explicit decision.
