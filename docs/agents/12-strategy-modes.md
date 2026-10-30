## Strategy Modes — scoped exception to the non-Gann boundary (2026-09-23, project owner direction)

> **Explain-only reversed 2026-10-22 (owner, Chuck): techniques that align
> first, the rest with their own levels.** In his words: "Highlight all the
> strategies that align with gsps first. All other strategies can get their own
> s/l, entry and tp1 (no mtp for anything that doesnt align with Gann trade
> plan)." His reasoning, given when told it overrules the 2026-10-16 rule below:
> "if an indicator is misaligned from a Gann method, and a user chooses to
> trust it, that would be a user choice. But to say that the indicator doesn't
> align with Gann, and then force them to align with Gann, isn't appropriate.
> We can guide users to the water, but we can NEVER force them to drink. Which
> is why that indicator feature is available. For anyone who wants the chance
> to create for themselves." So GSPS guides (Gann's plan is the default, and
> the techniques that agree with it are listed first) and never forces.
> Built in `lib/strategies/compare.ts`: a technique **aligns** when it has
> armed in the plan's direction, or, armed in neither, its lean agrees with
> the plan; armed against the plan never aligns, and with no Gann plan nothing
> does. An aligned technique trades GSPS's plan (entry, stop, TP1, MTP) and
> shows its reading of those levels. Every other technique offers its own
> entry, stop and TP1, **never an MTP**: the master take profit belongs to
> Gann's plan alone. `/api/strategy-levels/compare` reads every mode the tier
> allows plus the person's active scripts on one bar fetch, ranked aligned
> first; `/api/strategy-levels` returns `aligned` and the mode's own `levels`
> (no MTP) when it doesn't align. The order ticket lists them ("Read every
> technique"), and "Trade these levels" puts a non-aligned technique's entry
> (as the limit), stop and TP1 into a Manual Override, without the plan's
> crossing line, `entryKind` or failed-top target, and names the technique
> (`techniqueSource`), so placement waits for no Gann crossing on it
> (`confirmEntry`) and judges it as the person's own order. The risk rules
> still apply, as to any order: the 5-point stop cap, Gann's capital rules,
> the tenth at risk and the series of losses. The technique's levels lapse
> once the person changes the side, stop or target. The saved default
> technique's line (`plan-reading-line.tsx`: setup card, signal card, Guided,
> plan-scoped Automation) shows the technique's own levels when it doesn't
> align. Unchanged: nothing here reaches the scan, the score, the gates,
> GSPS's plan or any automated order; the tier gating; the script editor's
> rule test, which still shows every line the author wrote (`mtpr` included)
> because it tests the script, not a trade. The 2026-10-16 note below is
> history where it says "explain-only" or that no level reaches the ticket.

> **Narrowed 2026-10-16 (owner, confirming his 2026-10-01 note): explain-only.**
> "Gann's method is still how we plot the chart; the indicator of choice will
> just [be] how we explain the math on the front end." Asked whether that means
> modes and scripts only explain levels while Gann's plan sets them, he said
> yes. So a Strategy Mode or custom script no longer fills the order ticket's
> stop or target: the "Use these levels" buttons are gone, and the ticket shows
> the technique's reading next to Gann's plan (agrees or disagrees with its
> direction, its own levels marked "for comparison only"). The evaluators,
> chart overlays, script authoring and backtest stay as they were. Where this
> section below says a mode may "generate" or supply levels a human acts on,
> read it as this narrower rule.
>
> **Built the same day:** `lib/strategies/explain/` gives each of the nine
> modes, and any custom script, a reader that takes GSPS's plan and returns
> words only (`PlanReading`: a lean, a summary, one line per plan level). It
> has no output that can become a level, score, gate or order. The order
> ticket sends the plan to `/api/strategy-levels` and
> `/api/strategy-plugins/[id]/evaluate`, which return `reading`, and shows it
> in both protocol and manual mode, read on `EXECUTION_TIMEFRAME`. Owner
> decisions for the rest of the rollout: the setup card shows a one-line
> reading for the saved default technique, the chart switches the chosen
> technique's overlay on automatically, scripts keep `entry`/`stop`/`tp1r`/
> `mtpr` as optional lines, and every surface that shows a plan's levels gets
> the reading where it fits (cross-platform rule above).
>
> **Rolled out the same day.** `components/strategies/plan-reading-line.tsx`
> shows the saved default technique's reading of the plan on the setup card
> (so the daily lists, scanner rows, tracked, saved and intraday alerts), the
> ticker page's plan card, Guided Mode and plan-scoped Automation. It shows
> nothing for Novice or a saved default of GSPS's own plan. Choosing a
> technique in the ticket switches its chart overlay on (VWAP, Donchian and
> stochastic were added to `lib/indicators.ts` for this). Deliberate gaps:
> open positions (their levels may be a person's own edits, not the plan),
> scan history (an old plan read against today's bars), the Novice home
> summary (Novice has no techniques) and notifications (no per-person
> technique is known when they are sent). VWAP now anchors at the latest
> session in the mode, the reading and the chart alike
> (`lib/strategies/math.ts#latestSession`), so it arms only on intraday bars.
> Follow-up the same day: a script's `entry`/`stop`/`tp1r`/`mtpr` lines are
> optional (a block with none is signal-only), and `/api/strategy-levels`
> no longer sends a built-in mode's own prices, only the direction it arms in.

The "Gann-grounded platform" section above states a boundary "that must not
move": no non-Gann indicator (PSAR, Supertrend, RSI, MACD, Bollinger, the
STRAT bar-sequence taxonomy, etc.) may feed a scored criterion, a signal
gate, a trade plan, an entry, a stop, a target, or any verdict GSPS itself
issues. **This section is a deliberate, narrow, explicit exception to that
line, not a repeal of it** — the project owner asked directly for entry/
stop/target generation off PSAR+Supertrend and off Sara Strat bar patterns
(and, by the same reasoning, a small family of other well-known indicator
strategies), for a user's own opt-in intraday/swing trading. Per this file's
own established pattern (see "WD Gann precedence" and "Astrology" above),
the project owner is the one party who can amend a standing principle here,
and does so by writing the amendment down rather than silently patching
around it — this is that write-down.

**What is exempted, precisely, and what is not.** A new, separate system —
`lib/strategies/*`, "Strategy Modes" — may generate its own entry, stop
loss, first target, and master target from a named, real, citably-existing
(non-Gann) trading technique. Nothing about the core Gann-grounded verdict
engine changes:

- **Gann remains the default and the only substance behind GSPS's own
  verdict.** `ScanResult.levels`, the scored criteria, `SignalGates`, the
  scorecard, the Automated Portfolio Manager, and plan-scoped Automation are
  all untouched and continue to read only the Gann pipeline
  (`lib/gann/entryTrigger.ts`, `lib/strat/levels.ts`). A Strategy Mode result
  is never substituted into any of those.
- **Opt-in and one-at-a-time.** A human explicitly selects exactly one
  non-Gann mode for a given chart/order ticket (defaulting to Gann); modes
  are never combined, averaged, or auto-selected, and never persist as a
  silent account-wide override of the scored verdict.
- **A Strategy Mode result is the same kind of thing as a human typing a
  manual stop/target into the order ticket** — a computed suggestion a human
  chooses to act on — not a new GSPS-issued verdict. It carries its own
  label (which mode produced it) at every point it's displayed, so it is
  never presented as, or confused with, the Gann trade plan.
- **The underlying indicator math still must not leak into the display-only
  family.** `lib/indicators.ts` (the chart-overlay module, per the
  "Charting indicators" audit outcome above) keeps its own guarantee intact
  — Strategy Modes compute their own copy of any shared formula
  (`lib/strategies/math.ts`) rather than importing the display module, so
  that module's header comment ("must never feed... a trade plan") stays
  literally true.

**Modes built under this exception** (2026-09-23, nine total — six at first
write-down, three more the same day per direct follow-up request): PSAR+
Supertrend agreement-flip reversal, Sara Strat bar-pattern precision entry
(reusing `lib/strat/patterns.ts#detectPatterns`'s own trigger/stop, the same
taxonomy the "Gann-grounded platform" audit already investigated and kept
for display/confluence use), EMA9/SMA20 crossover, Bollinger Band reversion,
RSI(14) overbought/oversold reversal, MACD(12/26/9) momentum crossover, VWAP
reclaim/loss, Stochastic(14/3/3) crossover, and Donchian channel breakout —
see `lib/strategies/` and `docs/STRATEGY_MODES.md` for the architecture and
each mode's three-question design rationale (required by the mandate below
even though gate 1, Gann sourcing, is answered "none, deliberately" for
every mode here).
**Tenth mode, 2026-10-28 (owner: "GSPS should compute Elliott Wave"):**
`elliottWave`, a wave 3 entry from the shared count in
`lib/strategies/elliottCount.ts` (Elliott's three rules; diagonals, flats and
triangles not counted), Expert and Wall Street. The same count draws the
chart's "Elliott Wave" overlay and feeds the School's live examples, and every
surface says it is one valid count, not a forecast. Same boundary: it never
reaches the scan, score, gates, GSPS's plan or an automated order. Owner's
rule of the same day: user-facing copy teaches public methods like this one
and never names or describes the house method's sources.

**Tier-gated** (2026-09-23, direct project-owner instruction, same day as
the follow-up above): Novice has no Strategy Mode access at all — no
selector shown, only the structural/Gann plan; Pro (STANDARD) is scoped to
`macdMomentum`/`rsiReversal`/`maCrossover`/`vwap`; Expert and Wall Street get
all nine. See `lib/entitlements/policy.ts#allowedStrategyModes` and
`lib/strategies/access.ts`, checked server-side on every read/write
(`/api/strategy-levels`, `/api/strategy-mode-preference`) — no client
component computes its own idea of which modes a tier gets. This is an
access-control decision, not a technique-sourcing one: AGENTS.md's
Three-question mandate questions 1/2 (Gann sourcing, Dewey's cycle
checklist) don't apply to the gate itself, only question 3 does (Hermetic
Polarity — the same framing the mandate's own novice/expert interface-design
worked example already gives this exact shape of tiered-depth decision). See
`docs/STRATEGY_MODES.md`'s "Tier gating" section for the full reasoning and
why each mode landed where it did.

**What this does not open the door to.** This is not a general license to
weaken the non-Gann boundary elsewhere. The scored criteria, signal gates,
and the Gann trade plan are exactly as off-limits to these indicators as
before; the resolved gate-1 status of the scored criteria (see "Gann-derived
AND measured") is unaffected; the "Expanded
indicator library" Q2 roadmap item's own boundary ("no indicator added there
may feed a scored criterion...") is unaffected. This exception is scoped to
one new, clearly-labeled, opt-in system and nothing else.

**Custom-script/plugin system — all four phases (DSL + evaluator, plugin
registry + CRUD API, chart-plotting + level-generation hook, backtesting)
built 2026-09-23/25.** The project owner also asked about a
TradingView-style system where a user (or GSPS) can author and plot a new
indicator/strategy that generates its own levels the same way. `lib/strategies/custom/`
now has a small, safe, declarative condition/action DSL and a tree-walking
interpreter — text source is parsed by a whitelist-only recursive-descent
parser (`parser.ts`) into a bounded AST (`limits.ts`: max source length,
node count, nesting depth, indicator period/offset), then interpreted
(`interpret.ts`) into a function of the exact `(bars: Bar[]) => X | null`
shape `StrategyEvaluator` already uses. No `eval`/`new Function`/`vm`
anywhere, no loop or recursion in the language itself, no dynamic
identifier resolution outside `parser.ts`'s indicator/series whitelist —
see `types.ts`'s header for the full three-question design basis. A
compiled script's result is `CustomScriptLevels`, deliberately NOT shoehorned
into `StrategyLevels`/`StrategyModeId` (a closed union the nine built-ins
and `registry.ts` depend on staying closed) — it carries the script's own
`scriptId`/`scriptName`/`author`/`version` instead, satisfying hard rule 5
structurally rather than by convention. Verified: 22 unit tests including
exact parity against `evaluateMaCrossover` for an equivalent hand-written
rule, `tsc --noEmit` clean, lint clean, `check-banned-terms.mjs` clean.

Design decisions confirmed with the project owner before building (2026-09-23,
applying the Three-question mandate rather than engineering preference alone):
- **Textual grammar, not JSON-only.** Hermetic Correspondence — the text an
  author writes mirrors the AST 1:1, no opaque JSON-tree authoring. Safety is
  unaffected: the parser only ever emits nodes from the closed whitelist,
  identical to what a JSON-only front end would have validated.
- **Script authoring is Wall Street-tier only** (not extended to Expert
  alongside the nine built-in modes) — authoring is categorically more
  sensitive than selecting a pre-vetted built-in mode, so it sits one rung
  above "sees all built-in modes."
- **Private to the authoring user only, no marketplace, in v1.** A
  GSPS-curated/shared script is functionally identical in trust level to
  adding an official tenth built-in mode to `lib/strategies/` directly (GSPS
  wrote it, so it isn't untrusted the way a user script is) — routing it
  through the untrusted-script pipeline instead would be redundant, not
  safer, and cross-user script execution reopens exactly the trust problem
  the private-only scoping avoids. Read through Polarity (the same framing
  this section already gives the system overall): a script author trades
  their own method, they do not get to issue verdicts to other users.

**Phase 2 — plugin registry + CRUD API (built 2026-09-23).**
`supabase/migrations/0081_strategy_plugins.sql` adds `strategy_plugins`
(current state per script; owner-only RLS, private to the authoring user)
and `strategy_plugin_versions` (append-only, one row per saved `source`
edit — a `name`/`active` edit alone does not bump `version`). No compiled-
AST or evaluator column is stored anywhere — every read path recompiles
`source` through `compileCustomScript` on demand, so there is nothing
cached that could drift from the source of truth (AGENTS.md's orphan-
module audit outcome 5/8's "can never drift" lesson, applied here by
construction rather than by a registry-vs-code equality test like
`strategy_modules`' own, since this registry's content is user-authored,
not a static GSPS list). `/api/strategy-plugins` (list, create) and
`/api/strategy-plugins/[id]` (read + version history, edit, delete) — every
write checks `isCustomScriptAuthoringAllowedForPolicy` server-side and
compiles `source` via `compileCustomScript` before persisting; an invalid
script is rejected with the parser's own error message, never stored
half-valid. Verified: extended `access.test.ts`/`policy.test.ts` covering
the new gate, full suite 1882/1882 passing, `tsc --noEmit` clean, lint
clean (0 errors), `check-banned-terms.mjs` clean.

**Phase 3 — chart-plotting + level-generation hook (built 2026-09-25).**
`lib/strategies/custom/plot.ts` walks a compiled script's AST and extracts
every distinct named indicator/extreme reference (bare `open`/`high`/`low`/
`close`/`volume` and compound arithmetic are walked into, not plotted, so
only single named techniques ever appear as a line — the same convention
every built-in overlay follows) into a full, unshifted series per
reference, computed once even if the script reads it at several offsets.
`/api/strategy-plugins/[id]/evaluate` (new) computes one script's levels
*and* its plotted series for a symbol/timeframe in one call — private to
the authoring user (the plugin lookup is scoped to `user_id = auth user`,
so the route structurally cannot evaluate another account's script) — and
zips each series to its bar's own timestamp rather than returning bare
index-aligned arrays, since the chart's own candle fetch is a separate
request and time is the only safe join key across two independently-fetched
bar series. Wired into `components/chart/candles.tsx` via the exact same
`addLine`/`LineSeries` pattern the built-in SMA/EMA/Bollinger/PSAR/
Supertrend overlays already use (a small fixed color palette cycles across
a script's series, since the DSL assigns none of its own) — no parallel
rendering system, per the design doc's own instruction. Wired into
`components/trade/order-ticket.tsx`'s manual stop/target section the same
way the built-in Strategy Mode "Check levels"/"Use these levels" flow
already works: a "Custom script" picker (empty when the signed-in user has
no saved scripts, whatever the reason) that fetches the same evaluate route
and only ever fills the manual fields on an explicit click — never
auto-applied, always labeled by the script's own rationale (which itself
names the script and author). Verified: 5 new `plot.ts` tests (including
exact parity against `lib/strategies/math.ts`'s own `sma`/`ema`), full suite
1887/1887 passing, `tsc --noEmit` clean, lint clean (0 errors — 40 warnings,
all pre-existing except one `react-hooks/set-state-in-effect` warning of a
class already tolerated twice elsewhere in `candles.tsx`), build clean (all
three new routes compiled), `check-banned-terms.mjs` clean.

**Phase 4 — backtesting (built 2026-09-25).**
`lib/backtest/replayCustomScript.ts` walks one script forward over a
symbol/timeframe's history, re-evaluating it against every closed-history
window the same growing-window shape `replaySignals.ts#replaySignalEngine`
uses, and records an event only where the script actually armed —
evidence-gathering only, deliberately not a trade simulation (no fill/stop/
target-touch model, same restraint `replaySignals.ts`'s own header
documents, for the same "public accuracy claims outrunning validated
methodology" reason — a custom script is user-authored and this project has
no reviewed fill-simulation methodology for arbitrary author-defined entry/
stop/target logic). `/api/strategy-plugins/[id]/backtest` (new) wires it in,
same private-to-author scoping as `../evaluate/route.ts`. Verified: 5 new
`replayCustomScript.ts` tests (compile-failure handling, event ordering,
armed-count invariants, identity labeling, a flat-data zero-arm case), full
suite 1892/1892 passing, `tsc --noEmit` clean, lint clean (0 errors, no new
warnings), build clean (all four `/api/strategy-plugins/*` routes
compiled), `check-banned-terms.mjs` clean.

**Authoring UI (built 2026-09-25).** Never one of the four numbered
phases, but the CRUD API had no front end — `/settings/scripts`
(`app/(app)/settings/scripts/page.tsx`,
`components/settings/custom-script-editor.tsx`) is a thin client over
`/api/strategy-plugins*` that trusts nothing it hasn't fetched from those
routes, including authoring eligibility itself (`GET /api/strategy-plugins`
now also returns `authoringEnabled`, resolved server-side, since an empty
script list alone can't distinguish "no scripts yet" from "this tier can't
author them"). Reachable only from a plain-text link on the Settings page
(`components/settings/custom-scripts-settings.tsx`, itself gated on
`authoringEnabled`, rendering nothing otherwise), not the main nav — same
off-nav placement `components/app/nav.tsx`'s own header comment documents
for Glossary. The backtest panel repeats Phase 4's "evidence only, not a
performance claim" wording in the UI itself, not just the API response.
Verified: `tsc --noEmit` clean, lint clean (0 errors, 0 new warnings), full
suite still 1892/1892 (no route-level UI tests, matching this codebase's
existing convention — `app/api/**` and `app/(app)/**` have none), build
clean (`/settings/scripts` compiled, statically prerendered),
`check-banned-terms.mjs` clean. Not exercised in a live browser in this
session (no Supabase-authenticated environment available here) — say so
rather than claiming a manual click-through happened.

**Production verification pass (2026-09-27).** Migration 0081 had merged but
was **never applied to production**, so the whole feature was dead on the live
site. The UI hid that by turning the 500 into "not included on your plan".
Applied with project-owner sign-off. RLS was verified and the editor now shows
load errors. `0080_tier_promotion_three_paths.sql` had the same gap and was
applied in the same pass, also with sign-off. The live browser
click-through ran on 2026-10-16 and passed end to end (save, reload, check
levels, backtest, chart overlay, order ticket, `/promotion`); see
`docs/STRATEGY_MODES.md`'s "Production verification pass" and "Live
click-through". Generalises the live-weights lesson: **merging a
migration is not applying it.**

Any strategy plugin built or extended under this family must continue to
satisfy the rules this section states: opt-in, one-at-a-time, never
touching the Gann verdict, tier-gated and server-resolved only, and clearly
labeled.

