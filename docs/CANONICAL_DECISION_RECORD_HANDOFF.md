# Canonical decision record — handoff

Machine-oriented handoff for a fresh Claude Code session. Read this file
first; it is self-contained. Do not assume any memory of the session that
wrote it.

> **Status update:** the Design PR this document's "Suggested approach"
> calls for (step 1) is done — see `docs/CANONICAL_DECISION_RECORD_DESIGN.md`.
> It also corrects this document's "three pieces to reconcile" framing: there
> is a fourth, `0005_learning_brain.sql`'s `scan_events`/`execution_events`
> schema, currently unwired. Read the design doc before starting the
> Migration PR (step 2) — it makes concrete field-level decisions this
> document deliberately left open (e.g. section 3's "decide whether that
> stays `scan_result_id`" — the design doc decides: yes).

## Task

Unify the pieces below into the single versioned "canonical decision
record" the doctrine set requires — the PRD's "Required entities and
contracts" table (Signal context → Structure zone → Trade Map → Order/trade
→ Learning record), reconstructible end to end from one record version.
This is the one item `docs/DOCTRINE_ALIGNMENT_STATUS.md` (read that file
next) left open after Phases 0/1/3/4/5 — everything else in that status
doc is already implemented; do not duplicate it.

## Repository and production identifiers

| System | Identifier / state |
|---|---|
| GitHub repository | `ymcctrading/GSPS` |
| Default branch | `main` |
| Supabase production | `vebhpmmzxixlhujlptue` (`ACTIVE_HEALTHY`, Postgres 17) — confirmed live via the Supabase MCP connector, all migrations through `0041`/Phase 5 applied |
| Non-production reference in older docs | `vlbsrhxghghfkjbttqha` — do not target this; it is not the deployed project |
| Migration convention | Additive only, `000N_description.sql`, unique numeric prefix — `npm run check:migrations` (gated in `.github/workflows/test.yml`) enforces this. Never edit or renumber a historical migration. |
| Branching | Feature branch off `main`, PR against `main`, name the roadmap phase in the PR (`ROADMAP.md`'s Q1–Q4, or `N/A` with a one-line reason — this is doctrine/infrastructure work, likely `N/A` unless it's been scheduled into a roadmap phase by the time you read this). See `AGENTS.md` and `CONTRIBUTING.md`. |
| Deploys | `vercel.json` has `git.deploymentEnabled: true` — a push builds a preview, a merge to `main` deploys to production immediately. Never merge to `main` unless explicitly asked. |

## Why this exists (context, don't re-derive it)

Five doctrine documents (Foundational Doctrine, Integrated Execution
Doctrine, PRD, Strategic Blueprint, and an external Doctrine Alignment
Audit) were reconciled against the shipped Phase 0/1/3/4/5 work (PRs
#116–#121). Almost everything in them was already implemented, just not
always labeled as such — see `docs/DOCTRINE_ALIGNMENT_STATUS.md` and
`docs/MODEL_REGISTRY.md` for that mapping. The one requirement with real
remaining engineering weight is this one: the pieces of a decision record
exist, but they are three separate, only loosely-linked generations of
schema rather than one explicit versioned contract.

## Current state — the pieces to reconcile, exactly as they exist today

Read the actual files before changing anything; this table is a map, not
a substitute.

1. **`public.scan_results`** (migration `0001_initial_schema.sql`) — the
   original per-user scan record. `user_id, symbol, asset_class, direction,
   score, output_state, entry, stop_loss, take_profit_1, master_profit,
   detail jsonb, created_at`. `detail` is an escape hatch, not a typed
   contract. `public.daily_scans` is the market-wide sibling with the same
   shape.
2. **`public.scan_executions` / `public.visible_scan_results`**
   (migration `0036_entitlement_usage_and_monitors.sql`, Phase 3B) — the
   entitlement-era record of *that a scan ran* and *what a plan let a user
   see* from it, separately: `scan_executions(profile_id, source,
   policy_version, started_at, finished_at, eligible_count, visible_count,
   result_fresh_as_of)`; `visible_scan_results(scan_execution_id,
   profile_id, symbol, side, rank, visible_at)`. Note `policy_version` and
   `result_fresh_as_of` already exist here — they are the closest thing to
   a record-version and freshness field today, but they describe the
   *execution*, not the *setup* (no entry/stop/targets/risk on this table
   at all — that lives only in `scan_results` / the in-memory type below).
3. **`ScanResult`** (`lib/types.ts`, in-memory only, never persisted with
   full fidelity) — the richest representation: `symbol, assetClass,
   scannedAt, currentPrice, direction, setupKind, trends, gann, pattern,
   armedPatterns, levels (TradeLevels), dataLag (freshness), executionBar,
   decision (ScanDecision — score, outputState, breakdown), liquidity,
   error/errorCode`. This is what the API and UI actually work with, and
   it is the natural source of a Signal Context + Trade Map contract — but
   it has no `id`, no version, no explicit session/timeframe-governing
   field, no pivot/counter-scenario field (that's assembled downstream in
   `components/scan/intraday-alerts.tsx` / guided copy, not carried on the
   type itself), and nothing ties one instance of it back to the DB rows
   above.
4. **`public.orders` / `public.positions`** (migration
   `0001_initial_schema.sql`, extended by `0017_positions_side.sql`,
   `0018_order_greeks_and_targets.sql`) — both carry `scan_result_id uuid
   references public.scan_results(id)`, i.e. they already link to
   generation (1), not generation (2) or (3). `lib/portfolio/reconcile.ts`
   and `lib/brokers/simulator.ts` are the read/write paths.
5. **`public.learning_models` / `public.learning_coefficients`**
   (migration `0005_learning_brain.sql`) — the model/version registry (see
   `docs/MODEL_REGISTRY.md`). Already versioned and governed correctly;
   the gap is that nothing on (1)–(4) records *which* `learning_models`
   version scored it. `lib/scoring/active-weights.ts` reads the live
   version at scan time but the result never stamps that version onto the
   scan record.

The doctrine's acceptance criteria this has to satisfy (verbatim from the
PRD):

- A scan can return Stand Down or Wait with an explanation; it must not
  force a directional plan. *(Already true — `ScanDecision.outputState`
  and the near-miss/Watch handling in `lib/guided`.)*
- An actionable Trade Map cannot be generated without a risk level, data
  freshness state, timeframe, and pivot condition.
- A user can inspect why a plan was produced without seeing proprietary
  intermediate formulas. *(Already true — `redactDecision` /
  `PublicScoreSummary` in `lib/scoring/public-summary.ts`.)*
- **A trade or paper trade can be traced back to the originating decision
  record and model version.** *(Currently: traceable to `scan_results`,
  not to a model version — this is the concrete hole.)*
- The same rule path is used consistently in live scanning and
  replay/backtest evaluation. *(Already true — see `docs/BACKTESTING.md`.)*

## What "done" looks like

Not a rewrite of any of the five pieces above — an explicit link between
them, expressed as real schema, not a convention someone has to remember:

1. A `record_version` (or similarly named) field, or a single new join
   table, that ties a `scan_results` row (or its `scan_executions` /
   `visible_scan_results` counterpart, once you've decided whether to
   consolidate those two lineages or just bridge them) to the
   `learning_models.version` that scored it, at the time it was scored —
   not resolved after the fact from whatever is live now.
2. The freshness/session/pivot fields the PRD requires on the Trade Map
   output, persisted (today they exist transiently on `ScanResult` and in
   UI copy, but `scan_results.detail` is the only place they could land in
   the DB today, and it's untyped jsonb).
3. `orders`/`positions` still resolve back to one canonical id — decide
   whether that stays `scan_result_id` (rename the referenced generation
   underneath it) or whether trade lineage needs to point at the
   entitlement-era tables instead. Whichever you pick, do not silently
   leave both lineages populated for new rows — that recreates exactly the
   "two competing scan-record schemas" problem this work exists to close.
4. `lib/backtest/*` and `lib/learning/record.ts` write outcomes against
   whatever the unified id turns out to be, so a replay result is
   traceable to the same record shape a live scan produces (the doctrine's
   "same rule path" requirement already holds for scoring logic; this
   extends it to the record format).

## What NOT to do

- Do not touch `scan_results`/`scan_executions` in a way that breaks
  existing readers (`lib/portfolio/reconcile.ts`,
  `components/scan/*`, `app/api/portfolio/route.ts`,
  `app/api/orders/route.ts`) without updating them in the same change.
  Additive migrations only, per repo convention — see `supabase/AGENTS.md`.
- Do not invent a sixth schema generation. The task is reconciliation, not
  another parallel table.
- Do not touch `learning_models`' governance semantics (draft → approved →
  live → deprecated, never mutate a live row) — this work reads that
  registry, it doesn't change it.
- Do not apply a production migration, merge to `main`, or change
  production configuration without the explicit confirmation this repo's
  conventions already require (see `AGENTS.md`).
- Do not expose any new field that leaks scoring internals — run
  `scripts/check-banned-terms.mjs` before proposing any new public-facing
  field name, same as every other doctrine-scoped change in this repo.

## Suggested approach

This is large enough to be its own multi-PR sequence, not one commit:

1. **Design PR (docs only):** propose the actual join/field design against
   the five pieces above, get it reviewed, before writing schema. Put it
   in `docs/` next to this file.
2. **Migration PR:** the additive schema change(s) implementing the
   reviewed design, plus updated RLS, plus `scripts/check-migrations.mjs`
   passing.
3. **Write-path PR(s):** wire the scan pipeline, order/position creation,
   and learning-record writes to populate the new link(s). Update
   `lib/portfolio/reconcile.ts` and the broker simulator/live paths
   together, not separately — they read the same `scan_result_id` today
   and must not diverge.
4. **Read-path / UI PR:** anywhere that currently reads `scan_results` or
   `scan_executions` directly for lineage should read the unified link
   instead, so "traceable to the originating decision record and model
   version" is actually true end to end, not just true in the database.

Verify against the PRD's acceptance criteria (quoted above) at the end of
step 4, not just "the migration ran."

## Files to read before writing any code

- `docs/DOCTRINE_ALIGNMENT_STATUS.md`, `docs/MODEL_REGISTRY.md` — what's
  already done, so this doesn't duplicate it.
- `lib/types.ts` — the in-memory `ScanResult`/`TradeLevels`/`ScanDecision`
  contract.
- `supabase/migrations/0001_initial_schema.sql`,
  `0036_entitlement_usage_and_monitors.sql`,
  `0005_learning_brain.sql` — the three schema generations.
- `lib/portfolio/reconcile.ts`, `lib/brokers/simulator.ts`,
  `lib/trade/place-order.ts` — current `scan_result_id` read/write paths.
- `lib/scoring/active-weights.ts`, `lib/backtest/propose-weights.ts` — how
  a model version is resolved today (and isn't stamped anywhere).
- `supabase/AGENTS.md`, `AGENTS.md` — migration and workflow conventions.
