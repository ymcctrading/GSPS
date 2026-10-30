## Gann-grounded platform — standing principle

Gann's methodology is the substance of this platform, not one input among
several. This holds on **every** surface, not just the scored criteria:
scanning, level construction, trade lifecycle, exits, risk, education copy,
and UI. Project owner direction, 2026-09-16.

The "WD Gann precedence" principle above governs **conflicts** — whose
answer wins when GSPS and the sources disagree. This one governs **scope**:
a component with no Gann grounding is a defect to be justified or replaced,
not a neutral default.

**This is the platform's governing substance, not one of its features.**
Project-owner direction, restated 2026-09-17: Gann's methodology runs the
entire platform. Scanning, scoring, level construction, entry triggers, stops,
targets, risk, lifecycle, charting, education copy and UI. Any component that
is not Gann-grounded is a defect to be replaced, grounded, or explicitly
justified — never a neutral default, and never "fine because it's only
display."

**MANDATORY, EVERY SESSION: verify platform-wide, do not trust this list.**
Every prior list in this file has turned out to be incomplete, and each time
the gap was found by sweeping rather than by reading. The verification is
cheap and it is not optional:

```
# Non-Gann techniques. Use word boundaries — unanchored "RSI" matches
# "reve<RSI>on" and will hand you a false count.
grep -rnE '\b(RSI|MACD|Bollinger|Wilder|adx|Supertrend|PSAR|Ichimoku|Elliott|Wyckoff|Keltner|Donchian|Fibonacci)\b' \
  --include=*.ts --include=*.tsx lib/ app/ components/ | grep -v __tests__

# Moving averages and VWAP. Added 2026-09-26: the regex above can't see them,
# and the 2026-09-25 audit found them feeding the verdict (F2.5). Hits under
# lib/strategies/, lib/indicators.ts, lib/analysis/indicators.ts and
# components/chart/ are the documented Strategy Modes / chart-overlay
# exceptions. Anything else needs a reason.
grep -rnE '\b(sma|smaSeries|ema|vwap|anchoredVwap|SMA|EMA|VWAP)\b' \
  --include=*.ts --include=*.tsx lib/ app/ components/ | grep -v __tests__ \
  | grep -vE '^(lib/strategies/|lib/indicators\.ts|lib/analysis/indicators\.ts|components/chart/)'
```

Then confirm each hit is dead, documented, or gone. **A component is only
"not live" once you have traced it to zero consumers** — an exported symbol,
an API route, a chart overlay and a database row are all live surfaces, and
three of those are invisible in a code diff. See "Live weights incident"
below for what trusting a diff cost.

**Audit obligation.** The platform contains non-Gann substance that predates
this principle. The list below was verified against code on 2026-09-16 and
extended on 2026-09-17 — it is a starting point, not an exhaustive one, and a
future session should re-check rather than trust it:

- **STRAT pattern detection** (`lib/strat/patterns.ts`) — `2-2`, `1-2-2`,
  `3-2-2`, `3-1-2`, `PMG`. Rob Smith's STRAT, not Gann. **This taxonomy has
  two distinct uses and they have different verdicts — do not collapse
  them.** It used to feed the `patternArmed` scored criterion and every trade
  plan's entry price (**resolved 2026-09-17**: renamed `entryTriggerArmed` and
  regrounded on `lib/gann/entryTrigger.ts` — see "Entry pricing moved off
  STRAT" under "Audit outcomes"), and it is separately wrapped by the
  non-gating confluence layer in `lib/signals/confluence/sara.ts`
  (**investigated and deliberately kept** — see "Audit outcomes" below). The
  last residue, `lib/backtest/replay.ts` using the detected pattern to choose
  which bars and which direction to test (finding F2.7/F3.3), was removed
  2026-09-25. The replay now arms exactly as the live scan does, via
  `lib/scan/entrySelection.ts`.
- **Wilder's ADX/DMI** (`lib/signals/indicators.ts#adx`) — **fully resolved
  2026-09-17.** The scored criterion was discarded 2026-09-16 (see "Audit
  outcomes"); the two remaining consumers, `lib/signals/regime.ts` and
  `lib/signals/states/rangeReversion.ts`, were then replaced by
  `lib/gann/trendStrength.ts`. The "different governing spec" carve-out that
  kept them was a stay of execution, not an acquittal — the question they ask
  ("is this trending or ranging") is one Gann's own swing charts answer. No
  caller of `adx()` remained, and the function was deleted as dead code on
  2026-09-25.
- **PSAR/Supertrend** — **resolved for the verdict engine.** The dormant
  `trendOverlayFlips` hook in `lib/signals/regime.ts` and
  `lib/signals/states/trendPullback.ts` was removed 2026-09-17 (see
  `regime.ts`'s header). Both are now computed, but only in the two places
  that are explicitly exempt: the user-driven chart overlays
  (`lib/indicators.ts`, see "Charting indicators" below) and the opt-in
  `psarSupertrend` Strategy Mode (`lib/strategies/psarSupertrend.ts`, see
  "Strategy Modes"). Neither feeds GSPS's own verdict.

- **Classic charting indicators** (`lib/indicators.ts`, `lib/analysis/indicators.ts`)
  — `sma`, `ema`, `bollinger`, `rsi`, `macd`. Found by the sweep above on
  2026-09-17 and absent from every prior version of this list, which is worth
  remembering when deciding whether to run that sweep again. **Not an open item
  — investigated and resolved the same day as a justified exception. See
  "Charting indicators" under Audit outcomes below before touching any of
  it.**

For each: establish a Gann grounding, replace it with the Gann technique
that serves the same purpose, or document explicitly why it is a justified
exception.

**Scope note — "display only" is not an exemption.** A chart overlay or an
education page teaches a method as surely as a scored criterion applies one.
The Sara/STRAT keep below is an exception because the project owner examined
it and decided it, on the record — not because display is categorically
exempt. Nothing is exempt by category.

### Audit outcomes

Worked examples of this obligation applied. Both are project-owner decisions
of 2026-09-16. Add to this list as the audit proceeds — an item resolved
without a record here will be re-litigated by the next session.

**Worked example: `adxTrendStrength` discarded entirely (2026-09-16,
project owner direction).** Not replaced with anything — the first worked
example of this principle's audit obligation running the other way, toward
removal rather than a swap. `adxTrendStrength` (Wilder's ADX/DMI,
`lib/signals/indicators.ts#adx`) was the one scored criterion with no Gann
lineage at all (postdates Gann's death by more than two decades). It
entered `lib/signals/regime.ts` as the Signal & Regime Engine's
trend-confirmation overlay specifically so that engine would not lean on a
PSAR/Supertrend-style indicator alone (the "Cross-platform consistency"
section's own opening example, and the PSAR/Supertrend bullet just above),
then propagated from there into this scorecard by the cross-platform
consistency principle above — never on an independent claim that it
belonged in a Gann-selected setup's score. With no PSAR anywhere in this
repo (`docs/GSPS_AUTOMATION.md` confirms zero matches), the thing it
substituted for does not exist here, so there is nothing left to keep
substituting for; the criterion comes out, full stop, not "quarantined
pending a replacement." The measured inversion (−0.245R, see
`lib/validation/criteria-registry.ts`'s RETIRED entry) was **consistent
with that absence of lineage, not the cause of the removal** — a
non-Gann trend filter measuring against Gann-selected setups is the
expected result of never having belonged, not a porting defect to hunt
down. Generalize the reason, not the number: when a non-Gann criterion on
this scorecard measures against its declared sign, ask first whether it
was ever grounded in the methodology the setups are selected by, before
spending effort hunting a translation bug that may not exist. The
indicator itself (`adx()`) was not removed at the time — `lib/signals/regime.ts` and
`lib/signals/states/rangeReversion.ts` still used it (both replaced the next
day; see "ADX's last two consumers replaced" below) for the different
question the Signal & Regime Engine's own spec asks (is this market
trending or ranging, at all?), which is the "different governing spec"
carve-out the cross-platform consistency principle above names. Only the
scorecard's independent claim that this indicator agreeing with a
Gann-selected setup meant something came out.

**Investigated and kept, not removed: Sara Sniper's bar-sequence taxonomy
(`lib/strat/patterns.ts`, wrapped by `lib/signals/confluence/sara.ts`)
— an explicit, justified exception, by project-owner direction
(2026-09-16), never gating.** The open question was whether this
"candle-counting" presentation already restates a Gann technique this
codebase implements elsewhere, which would upgrade it from tolerated
foreign method to a second display of something Gann-grounded. It does
not. `lib/strat/patterns.ts` classifies each closed bar's high/low against
the prior bar into a shape (`1` inside, `2U`/`2D` directional, `3`
outside), then pattern-matches short, fixed 2–3-bar *sequences* of those
shapes (`2-1-2`, `3-1-2`, `2-2`, `1-2-2`, `3-2-2`, PMG) to arm a trigger and
stop — this is "The Strat" (Rob Smith), a publicly known, non-Gann
methodology; `docs/GANN_SARA_CONFLUENCE.md`'s own "Controlling
clarification" already treats Gann Protocol and Sara Sniper Strat as two
separate, independently-authorized frameworks, neither substituting for
the other. That is a different mechanism from every Gann-grounded
bar-counting rule this codebase does implement: `lib/gann/swingChart.ts`'s
3-day/9-day swing charts count a *run* of closes against the prevailing
trend and flip only once that run reaches a fixed length (3 or 9,
Ch. VII, per `docs/GANN_HISTORICAL_SOURCES.md`); `lib/gann/ruleOfThree.ts`
counts a *run* of same-direction closes (2 or 3, `Wall Street Stock
Selector`, 1930). Both are streak-length counters over a single scalar
(the close's direction). Sara/Strat counts nothing and keeps no running
total — it classifies each bar's shape and looks up a short fixed sequence
of those classifications, a categorically different operation. Checked
against `docs/GANN_HISTORICAL_SOURCES.md` directly: no inside/outside-bar
sequence taxonomy appears anywhere in the Gann primary or secondary
catalog. So this is not "the same rule in different clothes" — it is a
genuine variant with no citable Gann source, which under the numerology
carve-out in "WD Gann precedence" above would normally stay off-limits as a
scored or confluence-gating criterion. It already doesn't gate: `sara.ts` is
additive-only, feature-flagged, and (per the decision hierarchy in
`docs/GANN_SARA_CONFLUENCE.md`) can never set `SignalGates` or a state's
`tradeable`. Kept anyway, by direct project-owner instruction, in the same
tolerated-exception category `digitalRoot.ts` and the research-only
`squareOf20.ts`/`hexagonChart.ts` already occupy: counting candles is
intuitive to read directly off a chart, and other traders may find that
presentation simpler to follow too. Do not remove it on a future audit,
and do not treat it as unjustified foreign substance — the provenance
question has been asked and answered here. If a future session finds an
actual Gann-sourced inside/outside-bar sequence rule this analysis missed,
that would change the classification from "documented exception" to
"Gann-grounded alternative display" — but nothing found so far supports
that.

**Investigated and kept, by project-owner direction (2026-09-17): the
classic charting indicators — and the reason generalises.** The sweep flagged
`lib/indicators.ts`/`lib/analysis/indicators.ts` (`sma`, `ema`, `bollinger`,
`rsi`, `macd`), the live `/api/indicators` route, and the SMA 20 / SMA 50 /
EMA 9 / RSI 14 / MACD 12/26/9 overlays in `components/chart/candles.tsx` as
unexamined non-Gann substance on a user-facing surface. That framing was
wrong, and the correction matters more than the item: **the project owner
asked for these specifically.** They are a deliberate feature, not drift.

The distinction that makes this an exception rather than a hole in the
"Gann-grounded platform" principle: these indicators are **tools the user
drives, not substance the platform asserts.** GSPS's own verdict — what it
scans for, scores, gates, and places orders from — remains entirely Gann. A
chart overlay a trader switches on to examine their own idea makes no claim
on the platform's behalf. The platform is not saying RSI means anything; it is
declining to prevent a competent adult from looking at one.

The intent is explicitly to widen this, not contain it: the roadmap's Q2
"Expanded indicator library for self-directed strategy testing" adds Stochastic,
Keltner, Donchian, OBV, volume profile, configurable periods and saved presets,
so that experienced traders can test their own strategies instead of being
confined to this one. A platform that forces its single method on a
sophisticated user loses that user.

**The boundary that keeps both things true, and the only line that must not
move:** no indicator in this family may feed a scored criterion, a signal
gate, a trade plan, an entry, a stop, a target, or any verdict GSPS itself
issues. The moment one does, it stops being a user's tool and becomes the
platform's substance, and the Gann-grounding principle applies to it in full.
Check that boundary rather than the indicator list.

**Narrow, explicit, later exception:** see "Strategy Modes" below
(2026-09-23) for the one deliberate, project-owner-authorized carve-out from
this line — a separate, clearly-labeled, opt-in system that a human
selects one-at-a-time, never substituted for GSPS's own Gann-grounded
verdict. It does not loosen this boundary for the display-only indicator
family itself, which this section still governs in full.

**Do not remove these on a future Gann-grounding audit**, and do not read the
"display only is not an exemption" rule above as overriding this — that rule
says display is not exempt *by category*, which is exactly why this exception
had to be examined and written down rather than assumed. It was, and it is.

**ADX's last two consumers replaced by Gann's swing structure (2026-09-17).**
`lib/gann/trendStrength.ts` now answers "is this market trending, and which
way" for the regime engine and the range states. The **9-day** chart gives the
direction; the trend is confirmed only when the **3-day** chart's swings are
stepping that way — rising tops AND rising bottoms for a bullish read, falling
for a bearish one. `isGannRangeBound` is defined as the exact negation, so a
market can no longer be judged trending and ranging at once (the old
arrangement had two independently-tuned thresholds on one ADX scale with no
guarantee they partitioned it).

**Two wrong answers were built first, and both are worth knowing because each
looks right in the abstract:**

- **Requiring the 3-day and 9-day charts to agree.** This is what the scored
  `swingChartTrend` criterion does, so it looks like the consistent choice. It
  makes a trend unreachable during any pullback — the 3-day chart flips on
  three closes against the swing, which is what a pullback *is* — and
  `lib/signals/states/trendPullback.ts` exists precisely to evaluate a market
  in one. The two charts answer different questions: the scored criterion asks
  "confirmed at two granularities", the regime engine asks "what is the
  prevailing trend", and that is the 9-day chart's job alone.
- **Counting 9-day reversals as a churn proxy.** A tight oscillation rarely
  strings nine closes together, so it completes almost no swings and scores as
  *low* churn — reading a textbook range as a strong trend. Frequency measures
  how often the chart flips, not whether price is getting anywhere.

The existing regime and state tests caught both without being modified, which
is the argument for fixing the rule rather than the fixtures. Dedicated
coverage is in `lib/gann/__tests__/trendStrength.test.ts`, including a
pulling-back-but-still-trending case that fails under the first wrong answer.

Two constants there are **engineering choices, labelled as such** rather than
dressed up as sourced: which chart supplies the structure pivots, and the
strictness of the rising/falling comparison. Gann gives the chart
construction, not a lookback or tolerance for reading it.

**Entry pricing moved off STRAT onto Gann's own rule (2026-09-17, project-owner
direction) — the largest single Gann-grounding change to date, and the one a
prior audit most badly understated.** `patternArmed` had been described as "one
of nine scored criteria." Tracing it properly found the bar-sequence pattern
also supplied `tradePlanReady` (a hard Execute gate independent of the scored
point), `lib/strat/levels.ts`'s `const entry = pattern.triggerPrice` — **every
trade plan's entry price** — and through `riskPerShare`, **every position
size**. The autonomous portfolio manager was placing orders at STRAT-derived
prices. Stops and targets were already Gann/structural; it was specifically the
entry trigger that was foreign.

Replaced by `lib/gann/entryTrigger.ts`: crossing an old completed swing top or
bottom, plus the "lost motion" allowance — both disclosed in
`docs/GANN_HISTORICAL_SOURCES.md` A8 (the nine Buying Points and nine Selling
Points; the Resistance Level method's overshoot observation). The mechanism is
unchanged — a breakout past a level plus a buffer — but the level is now a
swing extreme rather than the prior bar's high, and the buffer has a citation
rather than being an arbitrary penny. `patternArmed` was **renamed** to
`entryTriggerArmed` rather than retired, so `TOTAL_POINTS` stays 9 and neither
cutoff moved: the substance behind a criterion changed, not how many conditions
the scorecard counts. This closed the last gate-1 failure.

**The accepted trade-off, decided explicitly rather than absorbed silently.**
Gann's trigger needs materially more history than STRAT's: a bar sequence arms
on 2–3 bars, a swing crossing needs *two completed swings* — roughly 10+ bars
containing real reversals, and flat closes advance the swing walk not at all.
So the candidate population shrinks in both the live scan and the replay, and
the Execute bucket was already starved (0/1061 on the last committed run).
The project owner chose to accept this rather than fall back to the
bar-sequence trigger where history is short (which would have reintroduced
exactly what was removed) or shorten the swing count (which has no source).
The reasoning: starvation is a **threshold** problem, and thresholds are
display decisions measurement may legitimately move — fewer sourced setups
beat more unsourced ones. **Do not "fix" a thin Execute bucket by reverting
this.** Re-derive the cutoffs from a fresh run instead; the backtest hold that
was waiting on `patternArmed` is now lifted.

Two traps this left behind, both already hit once:

- **Flat fixtures arm nothing.** `lib/__tests__/replay.test.ts`'s warm-up was
  45 identical bars, which was harmless under the old trigger and yields zero
  trades under this one. It now oscillates. Any new fixture needs real
  reversals.
- **`patternArmed`'s measurements do not transfer.** It is kept in
  `criteria-registry.ts` as RETIRED so the 31 committed runs in
  `docs/replay-runs/` still validate, but its numbers describe a different rule
  on a different reference level. Treat `entryTriggerArmed` as unmeasured.

The bar-sequence taxonomy itself is **not** removed — it keeps the display and
confluence role the project owner deliberately kept (next entry), and in the
replay it still names the candidate for attribution grouping. What it no longer
does is decide where an order goes.

**What that keep does not cover.** It settles the *display* use only. The
same `lib/strat/patterns.ts` taxonomy used to feed `patternArmed`, a **scored**
criterion — and scoring gates, where `sara.ts` cannot. The keep gave that
scored use no shelter; it was closed separately by the 2026-09-17
rename/reground to `entryTriggerArmed` recorded above, not by this entry. Do
not read "Sara's candle counting is kept" as a reason STRAT may ever feed a
scored criterion again.

**Worked example: eight-item orphan-module audit (2026-09-17, project owner
direction).** A platform-wide sweep for modules that exist but never reach
production. Two of the eight named items turned out, on re-verification, to
already be fully wired — the standing lesson (generalize, don't just record
the two instances): *always re-verify a "no consumer" claim against the
actual current `main`, not against a stale checkout or an earlier session's
notes* — `lib/rate-limit.ts#checkRateLimit` is called from `proxy.ts` (this
fictional Next version's renamed middleware entry point, `export const
config = { matcher: ... }`), and `lib/validation/health.ts#MIN_SIGNIFICANCE_T`/
`correlationSignificance` are called from `checkSign`, itself called by
`auditCriteria`, wired into `lib/backtest/run.ts` and
`app/api/learning/propose-weights/route.ts`. Full verdicts:

1. **`lib/risk/position-limits.ts#checkPositionLimits`** — REQUIRED AND
   ALIGNED, genuinely orphaned, now wired. Gann-grounded:
   `docs/GANN_HISTORICAL_SOURCES.md`'s risk/money-management row (A2, A4,
   A5, A6, A8; the 10%-of-capital ceiling independently in A3/A5) already
   lists `lib/risk/*` as the disclosed rule "differently structured: % of
   account/multi-ceiling, not Gann's dollar/point tiers" — the same
   literal-magnitude carve-out `lib/strat/levels.ts#combineNearbyLevels`
   documents. The function enforces exactly that structure (single-position/
   aggregate/open-risk/correlated-group ceilings from `lib/risk/config.ts`)
   but had never been called from the one place a real order gets placed
   (`lib/trade/place-order.ts#placeSimulatedOrder`) — a Novice paper account
   had no live enforcement of any of the four ceilings before this. Wired
   there, before pricing, skipped only for a protective (risk-reducing)
   order. Correlated-group membership uses same-symbol as a documented,
   conservative proxy — no sector/instrument-correlation table exists
   anywhere in this codebase to do better, and that gap is called out
   inline rather than silently assumed away.
2. **`lib/rate-limit.ts#checkRateLimit`** — already wired (`proxy.ts`). Not
   an orphan; no action taken.
3. **`lib/validation/health.ts#MIN_SIGNIFICANCE_T`/`correlationSignificance`**
   — already wired (see above). Not an orphan; no action taken.
4. **`lib/risk/cooldown.ts`** — REQUIRED AND ALIGNED, but not a "superseded
   duplicate" as originally suspected: re-verification found the live
   circuit-breaker call site (`lib/trade/place-order.ts`'s live-order path)
   checked `gate.decision.newEntriesAllowed` directly, which would have
   **blocked a protective stop-loss/take-profit/close order during an
   active cooldown or lock** — contradicting the disclosed spec rule this
   file's own comments already claimed was true ("the account-wide circuit
   breaker never blocks a close"). `cooldown.ts`'s
   `ALWAYS_PERMITTED_ACTIONS`/`gateAction` exist specifically to encode that
   rule and had no caller anywhere, so nothing enforced it at the one
   live-relevant site. Fixed by splitting `gateAction` into
   `gateResolvedAction` (takes an already-resolved `CircuitDecision`, so the
   live call site doesn't have to re-resolve circuit state a second,
   potentially inconsistent way) and wiring that into
   `placeLiveOrder`. `validateResetChecklist`/`requiresResetChecklist`
   remain unwired — the reset-checklist submission flow needs real UI/API
   work this pass did not build, and is flagged here explicitly rather than
   silently left; a future session should not treat `cooldown.ts` as
   "handled" until that lands too.
5. **`lib/signals/confluence/registry.ts#CONFLUENCE_MODULES`** — REQUIRED
   AND ALIGNED, wired: it is now read by
   `lib/signals/confluence/__tests__/registry-db-alignment.test.ts`, which
   is also the fix for item 8's `strategy_modules` drift claim — see there.
   Not a standalone item; the same fix closes both.
6. **`lib/backtest/replaySignals.ts#replaySignalEngine`** — REQUIRED AND
   ALIGNED (infrastructure: an existing, tested evidence-gathering tool for
   the Signal & Regime Engine, parallel to `lib/backtest/replay.ts`'s
   already-wired walk-forward over the Gann/STRAT score — the exact
   "built once and left stranded" shape the cross-platform-consistency
   principle above names). Wired into `GET /api/backtest` as
   `?engine=signal`, reusing `lib/backtest/run.ts`'s existing daily-bar
   fetch (`fetchSeries`, now exported) rather than a second data path.
7. **`lib/gann/squareOf20.ts`/`hexagonChart.ts`** — re-verified, exception
   upheld, no code change. `docs/GANN_METHODOLOGY_FULL_REPORT.md` (§3.6,
   the source-tier table) states plainly that "illustrations for every
   chapter remain lost" even after the fuller A2.1 extraction pass that
   fully specified these two constructions' *numeric* content — so the
   specific blocker (`ringAndAngleOf`'s ring/angle placement can't be
   checked against Gann's lost hand-drawn wheel) has not changed since the
   2026-09-16 exception was recorded, and nothing in either source document
   supports reconstructing it from text alone. Do not re-litigate this
   without new source material. **Update 2026-10-16:** new source material
   arrived. The hexagon plate is printed p. 422 of the owner's Master Course
   PDF, and its time counts now act through `hexagonTime.ts`; `hexagonChart.ts`
   stays as the research copy of the text. `squareOf20.ts` is unchanged.
8. **Migration 0048's `strategy_modules`/`gann_evaluations`/`sara_evaluations`**
   — split verdict. `strategy_modules`: REQUIRED AND ALIGNED, kept — has a
   real (if thin) purpose, module identity queryable independent of a
   deploy — but its "can never drift" claim was, until this audit, an
   unenforced comment (migration 0065 already had to hand-correct one real
   drift). `lib/signals/confluence/__tests__/registry-db-alignment.test.ts`
   now parses the seed literals straight out of 0048's insert and 0065's
   updates and fails CI if they disagree with `CONFLUENCE_MODULES`,
   `moduleType`, or `lib/signals/confluence/flags.ts`'s per-market
   enablement — the first real consumer either side of that claim has ever
   had. `gann_evaluations`/`sara_evaluations` (plus the six now-unused
   `trade_plans` reference columns 0048 added): NOT REQUIRED — dropped, in
   `0066_drop_unwired_confluence_evaluation_audit_trail.sql` (not applied to
   any live database by this session — see PR notes). Zero rows were ever
   written in the three-plus weeks since 0048 shipped; 0048's own comment
   already called the write path "unscheduled follow-up work," and
   migration 0065's header reconfirmed the gap was still open. The
   "versioned and reconstructible from stored inputs" requirement
   (`docs/GANN_SARA_CONFLUENCE.md`'s acceptance table) is already met
   in-process by `ConfluenceEvidence.explanationTrace`, attached to
   `ScanResult.signals` on every scan — persisting a second, never-written
   copy was never load-bearing for anything that requirement actually
   needed. If a real requirement for a persisted per-scan audit trail shows
   up later, re-derive the schema against that concrete requirement rather
   than reviving 0048's tables verbatim; speccing the schema before any
   consumer existed is what let it sit unwired in the first place.

**Platform-wide alignment audit (2026-09-25, project owner direction) — open
findings awaiting sign-off.** Audited `main@bcfbf36` against current code, the
live Supabase tables and the Vercel env list. The full report (file:line
evidence, IDs F1.1–F7.7) was delivered as a PDF in that session. Only
comment/doc fixes and deletion of the dead `adx()` were applied. Everything
below touches production behaviour, risk or order placement, and is **held
for the project owner** — do not fix it silently, and re-verify it first:

- **Backtest trigger ≠ live trigger (F3.1–F3.3).** `lib/scanTicker.ts` computes
  `computeGannEntryTrigger` from **daily** bars with a `weightedTrendAgreement`
  direction. `lib/backtest/replay.ts` computes it from **15-minute** bars, only
  on STRAT-detected candidates, and additionally filters it through
  `gapRuleViolated`/`riskFloorViolated`. Replay runs since 2026-09-17,
  including the 2026-09-23 run that confirmed the 6/3.5 cutoffs, measure a
  trigger production doesn't use. This is the `harmonicProximity` failure
  shape again.
  **Resolved 2026-09-25, project-owner sign-off.** The replay now arms from
  the daily trigger in `preferredEntryDirection`'s macro-derived direction,
  and applies no STRAT gap rule or risk floor to it. Both surfaces call the
  same code (`lib/scan/entrySelection.ts`), so they cannot drift again.
  `STRATEGY_VERSION` is bumped to `2026-09-25-live-trigger-replay`. **Open
  consequence:** every committed run in `docs/replay-runs/` since 2026-09-17,
  including the 2026-09-23 run behind the 6/3.5 confirmation, measured the
  old trigger. The cutoffs stay where they are until a fresh run on this
  version re-derives them. Treat `entryTriggerArmed` and the Execute-bucket
  numbers as unmeasured until then.
  **Follow-up 2026-09-26:** the replay's two documented coverage gaps are
  closed. It now also arms continuation setups, gated exactly as
  `runMarketScan`'s continuation pass gates them. The shared helpers
  `macroBreadthAgrees` and `isContinuationShape` in
  `lib/scan/entrySelection.ts` are used by both. A session now arms on the
  live scan's own 30-bar daily minimum (`MIN_DAILY_BARS_FOR_SCAN`) instead of
  120. `STRATEGY_VERSION` is `2026-09-26-continuation-replay`, and no runs
  were committed on the interim `2026-09-25` version.
- **Live orders skip `checkPositionLimits` (F3.5).** **Resolved 2026-09-25,
  project-owner sign-off.** `placeLiveOrder` now enforces the same four
  ceilings as the paper path, after the circuit breaker and before any
  pricing or broker call. Exposure comes from the broker's own positions and
  planned open risk from the account's `working` live `protocol_exits` rows.
  It fails closed if either can't be read and is skipped for protective
  orders, the same as paper.
- **Autonomous live trading looks authorised (F4.4, F7.6).** An active
  `compliance_signoffs` row for `autonomous_live_trading` has existed since
  2026-09-03, and its `review_reference` says no formal review was performed.
  Production also sets `AUTONOMOUS_LIVE_TRADING_HALTED` (2026-09-23).
  Commit 95da144's "sign-off held back" was already untrue when written.
  This is latent while no live broker connection exists.
  **Resolved 2026-09-25, project-owner sign-off:** the row
  (`96573294-…`) was revoked in production, not deleted. `revoked_reason`
  cites this finding. `isFeatureAuthorized("autonomous_live_trading")` is
  now false. Re-record it with `scripts/record-autonomous-live-signoff.mjs`
  only once a real compliance/legal review exists.
  **Proving period, 2026-10-16 (owner: "remove the live broker connection,
  environment kill switch (enable), remove human compliance sign-off (it will
  go back on AFTER we have proven that the portfolio manager actually
  works)").** `AUTONOMOUS_PROVING_PERIOD` in
  `lib/automation/autonomous-live-gate.ts` runs every manager profile on paper,
  so neither the broker, the kill switch nor the sign-off is consulted, and no
  order it places can reach a real account. Setting it to `false` restores the
  live gates. The same day's diagnosis: no `trade_plans` row had ever armed
  (all 165 expired), because equity plan windows ran out overnight on the wall
  clock and confirmation advanced only one scan price per pass. Fixed by
  counting session bars (`sessionBarsDeadline`, interim until #309 drops the
  clock) and arming from real closed bars in the manager's own run
  (`lib/lifecycle/armFromBars.ts`), which also skips any plan whose stop broke.
  **Health check, 2026-10-21:** plans now arm (51 arms in two days), but no
  paper order had been placed since 2026-10-09. Activation tried the order
  once; an old-level or reaction entry is armed while it still waits for price,
  so it was refused (`awaiting_confirmation`) and never tried again. Each
  scheduled pass now retries active activations whose plan is still armed and
  that have no `broker_order_submitted` event (`placeRestingEntries`), and the
  same run manages every working paper exit (`manageAllSimulatedExits`), which
  before moved only when the owner opened the portfolio or orders page.
- **Entry confirmation isn't uniform (F3.4).** Guided execute, the demo
  auto-trader and the manual ticket place orders without it. Only plan-scoped
  automation requires an `armed` plan.
  **Decided 2026-09-26 (project owner delegated the call).** The divergence
  stays, and it is now principled and written down instead of accidental.
  Unattended execution (plan-scoped automation, the autonomous portfolio
  manager) requires the full confirmation sequence. Orders a person places
  (the manual ticket, Guided Mode's one-tap execute) rest as stop-entries at
  the trigger. That trigger is Gann's own Buying/Selling Point with the
  lost-motion allowance (A8), and the person approved that specific trade. The
  retest-and-hold stages come from the GSPS spec pack, not from Gann. Under
  "WD Gann precedence" they aren't imposed on a human's own order. The demo
  auto-trader follows Guided Mode on purpose (it exists to show Guided Mode)
  and is bound to switch rules if it ever trades a member's account. The
  measurement side is fixed: `lib/backtest/replay.ts` gained
  `entryRule: "stop" | "confirmed"`, both driven by
  `advanceEntryConfirmation`, so each path's actual entry rule can be
  measured. Until then nothing measured the rule automation trades on.
  `lib/lifecycle/entryConfirmation.ts`'s header had claimed every caller ran
  through confirmation. It was corrected.
  **Reversed by evidence the same day (2026-09-26).** The first run on the
  production-faithful replay (`docs/replay-runs/2026-09-26-766sym-NOTES.md`,
  766 symbols, production stop, fixed plan bracket, refused fills dropped)
  measured the stop entry at **−0.155R** [−0.254, −0.053] on all trades and
  −0.440R on Execute. The confirmed entry measured **+0.190R** [+0.068,
  +0.311], positive in both halves. The CIs don't overlap. Under the
  pre-registered Phase 4 rule
  (`BACKTEST_PRODUCTION_VS_BASELINE_HANDOFF.md`), confirmation should hold on
  every surface where a plan can be entered, the human paths included. The
  principled argument above ("a human approved it") doesn't survive
  measurement: the human approves the trade, not the fill rule, and the fill
  rule is what loses money. **Current recommendation:** align the manual
  ticket's advised entry, Guided execute and the demo auto-trader on
  confirmation. Guided and the demo would place their order only once the
  plan is `armed` (or the equivalent confirmation has been observed), instead
  of resting a stop at the trigger. This is a production and UX change, held
  for the owner's go-ahead. The code comments that describe the interim
  decision (`lib/lifecycle/entryConfirmation.ts`,
  `app/api/guided/execute/route.ts`, `lib/demo/auto-trade.ts`) point here.
  **Resolved 2026-09-27, project owner (decision 4, and "automation should
  adhere to the same rules as everything else on the platform").** One rule,
  one place: `lib/trade/place-order.ts` places any entry carrying the
  protocol's levels only once it has confirmed on closed execution-timeframe
  bars (`lib/lifecycle/confirmNow.ts`, the same state machine the plans and
  the replay use). That covers the manual ticket's advised entry, Guided Mode,
  the demo account and plan-scoped automation (the autonomous portfolio
  manager runs through it). A plan-sourced order is judged on its plan's own
  trigger over the bars since the plan was generated; an unconfirmed entry is
  refused with `awaiting_confirmation` and nothing is placed. The 2026-09-27
  swing-chart run agrees: confirmed +0.190R vs stop −0.052R overall. Not
  covered, deliberately: the ticket's "now" market entry (no trigger to
  confirm) and protective orders.
  **Superseded 2026-10-15 (PLAN.md item 4, owner: "GSPS should be a 1 for 1
  implementation of Gann's methodology"):** the confirmation is now Gann's
  crossing rule. A close 3 points past the old level arms the plan; the order
  rests as a limit at the level plus 1 point and fills on the reaction, with
  the stop 3 points the other side (W006 pp.20, 46-47). The retest-and-hold
  sequence survives only as the replay's `entryRule: "confirmed"`.
  `STRATEGY_VERSION` is `2026-10-15-gann-reaction-entry`.
- **Non-Gann inputs in the Signal & Regime Engine (F2.5).** SMA 20/50 and
  anchored VWAP (`lib/signals/regime.ts`, `lib/signals/states/trendPullback.ts`)
  feed user-facing tier/"Tradeable" labels and trade-plan expiry. The
  mandatory sweep regex above can't see them: it doesn't match SMA, EMA or
  VWAP.
  **Resolved 2026-09-26 (project owner delegated the call), and wider than
  reported.** The extended sweep found the same SMAs in the **core Gann
  verdict**, not only the regime labels. `lib/analysis/trend.ts#readTrend`,
  which reads the monthly/weekly/daily trends behind every setup's direction
  and the score's macro criteria, used SMA 20/50. Everything was replaced
  with Gann's own tools:
  - `readTrend`'s direction is `readGannTrend`: the 9-day swing chart
    confirmed by stepping 3-day swings, "sideways" when unconfirmed. Pivots
    still supply the S/R lists.
  - `lib/marketScan.ts`'s coarse gates measured "extension", "trend intact"
    and "travel" from 20/50-bar closing means. They now measure from the 50%
    point of the range, Gann's first-ranked retracement level
    (`lib/gann/retracement.ts#rangeMidpoint`).
  - `lib/signals/regime.ts` and `rangeReversion.ts` dropped MA alignment,
    slope and flatness. Trend is Gann-confirmed direction plus HH/HL
    structure, and range is its negation plus repeatable boundaries.
  - `trendPullback.ts`'s approved pullback locations were the 20/50 SMAs and
    an anchored VWAP. They are now Gann's top-ranked retracement levels of
    the latest swing (1/2, full, 1/4, 3/4) plus the existing S/R zones.
  - `confirmedReversal.ts` measures overextension from the range's 50% point
    instead of a 20-bar SMA.
  - `smaSeries`, `slope` and `anchoredVwap` (`lib/signals/indicators.ts`)
    and `lib/analysis/pivots.ts#sma` were deleted once they had no consumer.
  **This moves the verdict.** Macro trend reads are now stricter: a market
  with short legs that SMAs called trending often reads "sideways" until
  Gann's 9-day chart turns. The 6/3.5 cutoffs have to be re-derived on this
  code, not on the code before it.
- **VWAP in the intraday alerts (new, 2026-09-26, resolved 2026-09-28).**
  `lib/scanner/intraday.ts` uses session VWAP for its direction, its
  invalidation level and its first target. Those alerts carry a "Trade this"
  action into the order ticket, so VWAP there is platform substance, not a
  chart tool. It's a separate system with its own spec, so it wasn't rewritten
  in the F2.5 pass. It needs a Gann replacement (the session's 50% point is
  the natural counterpart) or an explicit exception recorded here.
  **Resolved 2026-09-28 (project owner: "not Gann methodology, so implement
  Gann's methods").** Direction, invalidation and first target now read the
  session's 50% point (`SessionMetrics.midpoint`); VWAP is gone from the
  alerts.
- **STRAT gated publication (new, 2026-09-26, resolved 2026-09-28).**
  `lib/marketScan.ts#hasTradePlan` requires `r.pattern !== null` before any
  setup reaches the daily lists, and `isMomentumContinuation` requires a
  continuation-shaped pattern. Since 2026-09-17 the bar-sequence taxonomy is
  meant to be display and confluence only. Here it still decides which
  Gann-armed setups are published. That contradicts "What it no longer does
  is decide where an order goes" in spirit, since publication decides what
  Guided Mode and the demo trade. It's a production behaviour change, so it's
  held for the project owner. The replay does not apply this filter.
  **Resolved 2026-09-28 (project owner, same instruction).** `hasTradePlan` no
  longer reads the pattern; a plan's levels come only from Gann's trigger. The
  continuation pass (live and replay) gates on Gann's with-the-daily-trend
  crossing (`lib/scan/entrySelection.ts#isGannContinuation`) instead of a
  STRAT continuation shape, and its top-up skip reads the daily trend too.
- **Being in `FALLBACK_UNIVERSE` doesn't mean being scanned (F1.7).** It
  comes last behind the tracked symbols, the rotation chunk (drawn from
  `LARGE_CAP_UNIVERSE` only) and the most-actives, inside a 250-slot cap.
  Check coverage in coarse telemetry, not list membership.
  **No market-cap ceiling (owner, 2026-10-16):** "a min on the megacap, but
  never a limit." `LARGE_CAP_UNIVERSE` had stopped at $200B, so every larger
  name failed `novice_eligible`'s market-cap check and Guided Mode could never
  show it. The $200B-and-up names now lead the list (hand-compiled, awaiting
  the Alpaca validation pass). The $10B floor is the only cap rule.
- Lesser items: F4.3 and F4.7 are closed (re-checked 2026-10-28). A
  `policy_values` row may only tighten a risk limit (`RISK_POLICY_DIRECTIONS`,
  owner Q13, 2026-10-16), and production held no `policy_values` row when read.
  `stopRoom` was retired on 2026-10-16 (owner Q23), replaced by Gann's stop
  3 points behind an old level (`stopBehindOldLevel`, W006 pp.20-24, 46-47),
  which is itself a check under the nine pillars. Kept rather than
  deleted because they're unfinished rather than dead:
  `withinTriggerTolerance` (an unenforced spec rule) and `toSaraStrategyResult`.
  **F4.2 closed 2026-10-22:** a promoted `learning_models` weight row is
  adopted only when it is uniform (`isUniformWeightSet`,
  `lib/scoring/active-weights.ts`), since nothing in Gann's sources ranks one
  pillar above another ("The scorecard's role"). No live row exists, so
  scores are unchanged and `STRATEGY_VERSION` stays.
  `quantityFromPermittedRisk`/`plannedRiskDollars` and the rest of the risk-band
  policy were removed 2026-10-21 (R-004): Gann's capital rules size every order.
- **F3.7, traced 2026-09-30 and resolved the same day (project owner).** The
  owner saw OXY and GOOGL read invalidated on the Dashboard while the chart
  still showed the plan. Three surfaces called a plan dead from a quote (the
  lists, the order ticket, the twice-hourly monitor sweep); the scan behind the
  symbol page read only completed daily structure, returned the same plan, and
  `evaluateMonitorsAndNotify` re-armed the monitor the sweep had just
  invalidated. The owner's rule: **"A breach retires the plan, until an updated
  scan is run and a plan is either confirmed or an updated plan replaces the
  original."** Follow-up the same day: **"if Gann has his own version of
  confirmed or replaced, implement his rule ... the sentiment/premise needs to
  align."** He has, and it is built: **confirmed is a failed break** (a closed
  bar closes back through the broken level by his 3-point allowance, price-scaled
  by `lib/gann/pointScale.ts`: NSTD p. 20, Master Course pp. 246-248 and rules 4-5),
  and **replaced is a new trade with a new stop from the new swing structure,
  never the old levels resumed** (Overnight Chart rule 4, NSTD Rule 6, *Tunnel*).
  Built as `lib/gann/stopBreach.ts` and `applyStopBreachHold`
  (`lib/scoring/score.ts`): the scan drops a broken plan to Reject (price through
  the stop, or broken earlier in the session with no bar since closing back
  through the line), so the monitor goes INVALIDATED and the plan leaves the
  lists. There is no stored "retired" flag: the scan reads the session's closed
  bars against the stop each time, so a late scan resumes correctly. Price
  returning to the old entry, or to between the stop and the line, does not
  reinstate it: the ticket latches a breach until a newer scan arrives, and the
  lists keep their ratchet until they reload. The replay does not enter a plan
  whose stop an earlier candle of the session traded through, reinstates it on
  the same closing test, and reports `retiredPlans`; otherwise the next
  session's read of the swing chart replaces it.
  `STRATEGY_VERSION` is `2026-09-30-stop-breach-retired`:
  replay runs before it entered such plans, so the Execute-bucket numbers
  measured on earlier versions describe a rule production no longer follows.
  Gann's sources and the options considered (option A for the break, his own
  failed-break test for the way back in) are in
  `docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md` Part 1. **The `trade_plans`
  lifecycle (built 2026-10-01, owner go-ahead; dormant).** A pre-entry plan
  whose own stop the scan reports broken now goes INVALIDATED through a `retire`
  event (`lib/lifecycle/retire.ts`, dispatched from the scan fan-out). The spec
  pack says a change to the lifecycle needs counsel review, and building it is
  not the review, so it is gated on a `compliance_signoffs` row for
  `preentry_plan_retirement` (`scripts/record-preentry-retirement-signoff.mjs`).
  **With no row it does nothing**, and a retired plan behaves as before (never
  advanced, expires on its clock, refused at the bracket,
  `fill_outran_bracket`). Recording the sign-off is a human act, not the build's.
  Terminal by design: a failed break or new structure earns a new plan. The
  reclaim line is also a replay option now (`reclaimPoints` 3 or 5), with the run
  and its reading rule pre-registered in
  `docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md` Part 5; live stays at 3. The
  intraday alerts are an exception by
  construction: they are recomputed from the session on every scan, and their
  invalidation is the session's 50% point or a point beyond the crossed prior
  session's high or low, so a break of it already changes the alert.


