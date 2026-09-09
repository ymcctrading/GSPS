# Gann & Sara Cross-Market Confluence Layers

Implements the "GSPS Gann & Sara Cross-Market Integration Addendum"
(2026-08-28). Out-of-phase relative to the Q1 roadmap (see `ROADMAP.md`) —
built as a direct-request addendum, not a scheduled initiative.

## Controlling clarification

GSPS is a multi-market, governed analysis and trade-plan platform. The Gann
Protocol and Sara Sniper Strat are **not** GSPS's sole resources, and neither
may bypass core market, account, safety, validation, or user-tier controls.

- **Gann Protocol** — GSPS's North Star: numerical/coordinate context (root,
  harmonic mapping, potential price coordinates, confluence and target
  refinement).
- **Sara Sniper Strat** — a cross-market price-action, multi-timeframe
  confirmation framework; an authorized strategy/confluence module.
- **GSPS Core** — regime detection, qualification, account-aware risk, trade
  lifecycle, education, audit and tier governance. Neither framework
  substitutes for GSPS Core, and GSPS remains broader than both.

## Decision hierarchy

Enforced by construction: neither confluence module ever writes to
`SignalGates`, never sets a state's `tradeable`, and is computed additively
alongside the four scanner states, not merged into them.

1. Market-data integrity and instrument eligibility
2. Account state, buying power, risk budget, correlation and cooldown/lock state
3. Market-specific execution constraints and event-risk controls
4. Valid market regime and confirmed GSPS strategy signal
5. Gann Protocol alignment or neutrality
6. Sara Sniper Strat alignment or neutrality
7. Tier eligibility, user education display, and user confirmation

Gann/Sara alignment may improve rank, refine a coordinate, or support
higher-tier confluence. Neutrality does not invalidate a fully qualified GSPS
trade. Material conflict may downgrade a setup, require stronger
confirmation, reduce permitted risk, or leave it watchlist-only — it never
forces an entry or exit by itself, and this codebase does not implement any
such downgrade logic yet (the alignment read is currently display/audit
only; wiring it into scoring is unscheduled follow-up work).

## Where the logic actually comes from

The addendum requires "independently designed public concepts" with
provenance metadata, and explicitly forbids inferring any personally sourced
numerical logic that hasn't been supplied in an authorized written
specification. Both modules are built by **wrapping code that already
existed and was already authorized**, not by inventing new rules:

- **Gann Confluence Layer** (`lib/signals/confluence/gann.ts`) wraps
  `lib/gann/squareOf9.ts` (Square of 9), `lib/gann/fans.ts` (Gann fan
  angles), and `lib/gann/timeCycles.ts` (time-cycle windows) — all
  independently implemented, public-domain Gann techniques already in
  production use in the legacy scan scorer (`lib/scanTicker.ts`).
- **Sara Sniper Strat Confluence Layer** (`lib/signals/confluence/sara.ts`)
  wraps `lib/strat/patterns.ts`'s closed-bar reversal/continuation taxonomy
  (`2-2`, `1-2-2`, `3-2-2`, `2-1-2`, `3-1-2`, `PMG`) — the same pattern codes
  `CHANGELOG.md` documents as "Gann/Sara Sniper Strat" pattern codes, already
  implemented and already routed through `lib/education/patterns.ts`'s
  `PATTERN_GLOSSARY_TERM` to keep proprietary naming off user-facing
  surfaces.

### What is deliberately *not* implemented

The addendum introduces one net-new piece of vocabulary with no
authorized specification behind it: **"Material Number versus Harmonic Node
classification."** Per the addendum ("Claude Code must not infer missing
rules"), `GannConfluenceResult.materialNumberClassification` is hard-typed to
the single value `"notImplemented"` and will stay that way until a user
supplies an authorized written specification for it. Nothing in this
codebase fabricates that classification.

### Digital Root / Vortex 1–9 engine — now implemented

Unlike Material Number/Harmonic Node, the active 1–9 Digital Root/Vortex
system *does* have an authorized written specification: the "GSPS
Implementation Blueprint" (v1.0, 2026-09-08, project owner) — a full
engineering spec that supersedes the earlier "GSPS Gann-Centered
Foundation" plain-English report for exact API/formula details. It supplies
the exact formula (`DR(n) = 1 + ((n − 1) mod 9)`), the zero/null/invalid =
absence rule, the fixed polarity-pair table (1↔8, 2↔7, 3↔6, 4↔5, 9↔9), and
the three-way `vortex_class` (`VORTEX_FLOW` = {1,2,4,8,7,5}, `POLARITY_AXIS`
= {3,6}, `COMPLETION_NODE` = {9}) — explicitly a "GSPS hypothesis," not a
proven causal law, and explicitly forbidding a root from independently
creating or overriding a live entry, stop, or gate (blueprint §7.4).

`lib/gann/digitalRoot.ts` is a direct port of the blueprint's reference
functions (`digitalRoot1to9`, `calculateGannDr` for the legacy
decimal-strip path, `gannComplement`, `resolvesToCompletion`, `vortexClass`,
`classifyConfluence`), each carrying full provenance via
`DigitalRootFeature`. `evaluateGannConfluence`
(`lib/signals/confluence/gann.ts`) wires it in as
`GannConfluenceResult.vortexContext` — a `price_dr`/`time_dr` pair (blueprint
§18's `gann_context` shape) computed from normalized positive integers
(ticks off the anchor low, bars since that anchor), never the raw price or
date, with their `relationship` classified per §7.3's confluence types.
`VORTEX_FLOW_TRANSITION`/`ONE_RENEWAL_TRANSITION` need a prior stored
reading to detect a root *changing* between scans; nothing persists that
yet, so `classifyConfluence` never produces either — documented as deferred
in `lib/gann/digitalRoot.ts`, not guessed at. This is confluence/context
only, same as every other field on this result: it never sets alignment on
its own, never overrides a safety/account/eligibility gate, and is not
(yet) rendered in `components/scan/confluence-card.tsx` — surfacing it in
the UI, behind the approved "GSPS Signal Calculation" / "Signal Flow"
labels in `lib/constants/gspsTerminology.ts`, is unscheduled follow-up
work. See `docs/GANN_BLUEPRINT_TRACEABILITY.md` for the full
section-by-section traceability matrix against the blueprint.

Similarly, the addendum's four unsupported markets (options, futures, forex,
commodities — see below) are reported as `unsupported` rather than having
their required adapter mechanics (Greeks, contract roll, pip conversion,
delivery/roll, etc.) approximated from the equities/crypto paths that do
exist.

## Market adapters

`lib/signals/confluence/marketAdapters.ts` is the addendum's per-market
adapter registry (`MARKET_ADAPTER_REGISTRY`), matching its "Market-specific
adapters" table one row per market. GSPS's data layer (`AssetClass` in
`lib/types.ts`) supports two of the seven markets today:

| Market | Status | Why |
|---|---|---|
| Equities/ETFs | `supported` | Routed through the existing `us_equity` data path |
| Crypto | `supported` | Routed through the existing `crypto` data path |
| Options | `unsupported` | No options-specific data/mechanics adapter exists in GSPS yet |
| Futures | `unsupported` | No futures data path exists in GSPS yet |
| Forex | `unsupported` | No forex data path exists in GSPS yet |
| Commodities | `unsupported` | No commodities data path exists in GSPS yet |

`routeMarketAdapter(assetClass)` is called first inside both
`evaluateGannConfluence` and `evaluateSaraConfluence` — a signal always
routes through the correct adapter before either module produces anything,
and an unsupported market returns a structured `notImplemented` result
rather than silently reusing equities behavior.

## Module shape

Both modules follow the same evaluator pattern as the existing four scanner
states (`lib/signals/states/*`):

- **Input**: asset class/symbol, price/bar history, and the confirming
  direction to score alignment against (the scan's already-confirmed bias —
  neither module decides direction on its own).
- **Output**: `alignment` (`aligned | conflict | neutral | notImplemented`),
  module identity/version (`ConfluenceModuleMeta`), and an `evidence` object
  carrying `calculationVersion`, `inputs`, `sourceTimestamp`, and a
  human-readable `explanationTrace` — every output is versioned and
  reconstructible from stored inputs, per the addendum.
- Sara evaluates **closed candles only** (`detectPatterns` already enforces
  this — see `lib/strat/patterns.ts`'s header comment).

## Feature flags

`lib/signals/confluence/flags.ts`'s `isConfluenceModuleEnabled(moduleId,
market)` gates whether a module runs at all. Each module defaults to enabled
for `equities`/`crypto` (the two supported markets) and can be disabled
platform-wide via `GSPS_DISABLE_GANN_CONFLUENCE=1` /
`GSPS_DISABLE_SARA_CONFLUENCE=1` without touching core scanning code.
Disabled means the field is `null` on `ScanResult.signals` — never attempted,
never a degraded/error state — so core GSPS scanning is unaffected either
way.

## Wiring

`lib/scanTicker.ts` computes both modules (when enabled) alongside the four
scanner states and attaches them to `ScanResult.signals.gannConfluence` /
`.saraConfluence`. `lib/signals/publicSummary.ts`'s `redactScanSignals`
strips each module's `evidence.inputs`/`explanationTrace` before an API
response, matching the redaction rule already applied to the four states'
per-criterion breakdowns. `components/scan/confluence-card.tsx` renders the
three-way framework identity (Gann North Star / Sara confluence module / GSPS
Core governance) the addendum's acceptance criteria require.

## Persistence

`supabase/migrations/0048_gann_sara_confluence_modules.sql` adds:

- `strategy_modules` — a DB mirror of
  `lib/signals/confluence/registry.ts`'s static module list (module id,
  type, display name, authorized source, version, markets it's enabled for,
  status, owner).
- `gann_evaluations` / `sara_evaluations` — append-only snapshots of what
  each module computed for a given `signal_id`, including a
  `payload_snapshot` for full reconstruction. `gann_evaluations.node_
  classification` is constrained to the single value `not_implemented` at
  the database level, matching the code-level contract above.
- `trade_plans` gains `gann_alignment` / `sara_alignment` (jsonb),
  `gann_module_version` / `sara_module_version` (text), and
  `gann_evaluation_id` / `sara_evaluation_id` (nullable FKs) so a generated
  plan can carry both modules' evidence without duplicating the payload.

No code in this repository writes to `gann_evaluations`/`sara_evaluations`
yet — persistence wiring (writing a row per scan, linking it to a trade plan)
is unscheduled follow-up work; the schema exists so it can land without a
further migration.

## Acceptance criteria status

| Criterion | Status |
|---|---|
| App shows Gann North Star / Sara module / GSPS Core identity | Done — `components/scan/confluence-card.tsx` |
| Signal routes through the correct market adapter before qualifying | Done — `routeMarketAdapter` runs first in both evaluators |
| Disabling Gann/Sara does not break core scanning | Done — additive, feature-flagged, `null` when disabled |
| Failed data/account/cooldown/market constraint can't be overridden | Done by construction — neither module touches `SignalGates` or a state's `tradeable` |
| Confluence outputs are versioned and reconstructible | Done — `ConfluenceModuleMeta.version` + `ConfluenceEvidence` on every output; DB schema added |
| No confidential/undocumented third-party logic implemented | Done — both modules wrap existing, already-authorized public-domain/internal logic; the one net-new field (Material Number/Harmonic Node) stays `notImplemented` |
| branch → migration → tests → Vercel preview → PR; no merge/deploy without approval | Migration and tests included in this change; PR opened per repo workflow — no merge to `main` or deploy performed |
