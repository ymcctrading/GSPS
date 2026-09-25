<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# GSPS Agent Instructions

## Product Roadmap

`ROADMAP.md` is the governing roadmap for this project. **Read it before
proposing new work, scoping a feature, or prioritizing between options** — it
decides what gets built and in what order, and it outranks `BACKLOG.md`, which
is an unscheduled idea pool rather than a set of commitments.

**Work out the current phase from today's date against this table** — don't
assume Q1:

| Phase | Window | Theme |
|---|---|---|
| Q1 | Aug–Oct 2026 | Monetization & retention foundation |
| Q2 | Nov 2026 – Jan 2027 | Differentiation & scale foundation |
| Q3 | Feb–Apr 2027 | Mobile & community |
| Q4 | May–Jul 2027 | Enterprise & scale |

Then open `ROADMAP.md` for that phase's goals, initiatives, and dependencies.
If today's date is past Jul 2027, the roadmap is expired — say so rather than
defaulting to the last phase.

- When suggesting work, name the phase it belongs to. If it fits no phase, say
  so plainly — it is either out of scope or a reason to amend the roadmap.
- Out-of-phase work is fine when there's a reason (production bug, security
  issue, blocked dependency, or a direct request). Note the deviation rather
  than presenting it as planned.
- When a change invalidates part of the roadmap, update `ROADMAP.md` in the
  same PR and move its "Last updated" date.

## Cross-platform consistency — standing principle

If a concept exists anywhere in this codebase — an indicator, an anchor
convention, a fixed constant, a computed field — and it applies to another
surface, it must exist there too. **Not existing everywhere it applies is
equal to not existing anywhere.** A concept built once and left stranded in
the module that introduced it is not "partially done" — treat it as not
done, and finish rolling it out before calling the work complete.

This is not hypothetical caution; it is the exact shape of two real defects
found in this codebase on 2026-09-10:

- **`harmonicProximity`'s stale Square-of-9 anchor.** The fix landed in the
  two callers feeding the scored criterion (`lib/scanTicker.ts`,
  `lib/backtest/replay.ts`), but `lib/marketScan.ts`'s coarse pre-filter and
  `lib/signals/confluence/gann.ts`'s confluence card kept the old, buggy
  anchor for another full day — quietly undermining every backtest run
  measured against the "fixed" criterion in between (see
  `lib/validation/criteria-registry.ts`'s `harmonicProximity` entry for the
  full history).
- **ADX/DMI**, built and validated for `lib/signals/regime.ts` (the Signal &
  Regime Engine) specifically to avoid leaning on PSAR/Supertrend as a sole
  signal, never reached the separate 9-point scanner score
  (`lib/scoring/score.ts`) at all — a second subsystem with the exact same
  "which indicator confirms a trend" problem, solved once and never
  propagated. (**Historical example, still valid as an illustration of this
  rule** — but as of 2026-09-16 ADX is no longer the scanner's answer to that
  problem: `adxTrendStrength` was discarded for failing the Gann-grounding
  gate. See "Audit outcomes" below. `lib/signals/regime.ts` still uses
  `adx()`.)

Before considering any indicator, anchor rule, fixed threshold, or computed
field "in place," check every surface it plausibly applies to — other
scoring paths, the live scan vs. the backtest replay, confluence/display
modules, coarse pre-filters — and either wire it in everywhere applicable or
say explicitly why a given surface is an intentional exception (e.g. a
module whose spec genuinely calls for different behavior, not just an
oversight). "When appropriate" is the only carve-out: a concept that
*shouldn't* apply somewhere (different timeframe, different asset class,
different governing spec) is a real exception, not a violation of this
rule — but the default assumption is that it applies, and silence is not
an exception.

## Gann & cycles research memory

`docs/GANN_HISTORICAL_SOURCES.md` is a running index of every Gann primary
book, Gann-adjacent secondary/interpretive work, and general cycle-theory
source reviewed to date, cross-referenced against what this codebase
actually implements (`lib/gann/`, `lib/scoring/`). **Read it before
proposing a new Gann-derived criterion, auditing an existing one, or
researching additional Gann/cycle-theory source material** — it exists so
a future session works from prior findings instead of re-reading source
PDFs from scratch, and it records which techniques are historically
disclosed-by-Gann-himself versus later reconstruction versus unrelated.
`docs/GANN_METHOD_COMPLETENESS_AUDIT.md` is the implementation audit built
from it.

## WD Gann precedence — standing principle

When GSPS's current implementation, a design choice, or a piece of copy
conflicts with something W.D. Gann actually taught (his own published books,
or his private paid-course material and letters per
`docs/GANN_HISTORICAL_SOURCES.md`'s tiers), **default to Gann's own
methodology**, not GSPS's existing approach. This is a direct, standing
instruction from the project owner (2026-09-16), not a case-by-case
judgment call: where a real choice exists between "what GSPS currently
does" and "what Gann's own sources say," the sources win.

This does not mean bypassing engineering judgment about *how* to translate
a disclosed rule into working code, and it does not mean porting a raw
historical number (a 1930s dollar/cents figure, a commodity-specific unit)
across asset class and era without saying so — see `lib/strat/levels.ts`'s
`combineNearbyLevels` for a worked example of implementing the disclosed
*rule* while declining to port its literal magnitude, documented inline for
exactly this reason. It does mean: when a Gann-derived candidate is ready to
build, build it live rather than leaving it queued behind a validation
process that would otherwise gate it indefinitely, and document the change
in place (what changed, when, and why) so a future reader — human or
another session — can see the decision rather than archaeology it from a
diff. `docs/GANN_PLATFORM_AUDIT.md`'s Part 4 items, wired in live on
2026-09-16 (a new tenth scored criterion, `ruleOfThree`; the "3-point rule"
buffer in `lib/lifecycle/entryConfirmation.ts`; the "resistance points near
same levels" clustering in `lib/strat/levels.ts`; the fixed annual calendar
cycle in `lib/gann/timeCycles.ts`), are the standing worked example of this
principle in practice — each carries an inline comment pointing back here
and to that document's Part 4.

This principle does not override AGENTS.md's other explicit, user-directed
overrides above and below (the 1Hour execution timeframe, and the threshold
half of the Execute-collapse stopgap) — those have their own stated reasons
and revert triggers and are not "GSPS's current approach vs. Gann" conflicts
in the sense this section addresses. The *weight* half of that stopgap is no
longer among them: it was resolved on 2026-09-16 under "Gann-derived AND
measured" below, which supersedes it on principle rather than on a revert
trigger.

**On `GANN_SARA_CONFLUENCE.md`'s numerology rule and `lib/gann/digitalRoot.ts`'s
conservative treatment (updated 2026-09-16, project owner direction):**
both are superseded specifically by principles genuinely tied to Gann and
his methodology — not weakened in general. The "no new numerology without
an authorized specification" rule still holds as the guard against
*inventing* Gann lore nobody ever documented; what changed is what counts
as authorized. `docs/GANN_HISTORICAL_SOURCES.md` (the 25-document catalog)
and `docs/GANN_METHODOLOGY_FULL_REPORT.md` (§18.5, which states this
explicitly: "this report itself is the authorized specification" for the
techniques it documents, each traced to a cited primary source — A2.1,
A2.3 — not an inference) together are that authorization. So: a numerology
or astrology technique with no citable Gann source is still off-limits,
full stop. A technique citably his own — even one GSPS previously treated
as conservatively as `digitalRoot.ts` does today (confluence-only, never
independently gating) — can be built out further when Gann's own
methodology calls for it, per this same precedence rule.

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
  them.** It feeds the `patternArmed` scored criterion (non-Gann substance
  sitting inside the scorecard itself, **still open**), and it is separately
  wrapped by the non-gating confluence layer in
  `lib/signals/confluence/sara.ts` (**investigated and deliberately kept** —
  see "Audit outcomes" below, which also records why the keep does not
  settle `patternArmed`).
- **Wilder's ADX/DMI** (`lib/signals/indicators.ts#adx`) — **fully resolved
  2026-09-17.** The scored criterion was discarded 2026-09-16 (see "Audit
  outcomes"); the two remaining consumers, `lib/signals/regime.ts` and
  `lib/signals/states/rangeReversion.ts`, were then replaced by
  `lib/gann/trendStrength.ts`. The "different governing spec" carve-out that
  kept them was a stay of execution, not an acquittal — the question they ask
  ("is this trending or ranging") is one Gann's own swing charts answer. No
  caller of `adx()` remains.
- **PSAR/Supertrend** — narrower than it first appears, so scope the work to
  what is actually there. Nothing in this codebase *computes* either one.
  `lib/signals/regime.ts` accepts an optional `trendOverlayFlips` count and
  uses it solely to disqualify a Trend read on repeated flips;
  `lib/signals/states/trendPullback.ts` threads the same optional value
  through. Both default to `0` and no caller supplies a value, so this is a
  dormant hook for a non-Gann overlay rather than live non-Gann substance.
  Either close the hook or ground it.

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
indicator itself (`adx()`) was not removed — `lib/signals/regime.ts` and
`lib/signals/states/rangeReversion.ts` still use it for the different
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
same `lib/strat/patterns.ts` taxonomy also feeds `patternArmed`, a **scored**
criterion — and scoring gates, where `sara.ts` cannot. So `patternArmed`
takes no shelter from the entry above and remains an open gate-1 item; the
investigation that cleared the display use is in fact the same finding that
sharpens the question for the scored one, since it establishes there is no
Gann source behind the taxonomy at all. Do not read "Sara's candle counting
is kept" as "STRAT is settled."

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
   without new source material.
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


## Gann-derived AND measured — standing principle

Every scored criterion must clear two independent gates. Neither substitutes
for the other. Project owner direction, 2026-09-16.

1. **Gann-derived** — traces to a citable source in
   `docs/GANN_HISTORICAL_SOURCES.md`, with the tier recorded.
2. **Measured** — has outcome evidence in
   `lib/validation/criteria-registry.ts`.

**What measurement is FOR.** It verifies that *our translation* of a Gann
rule into code is faithful. A criterion measuring negative or inverted is
presumed a porting defect on our side — wrong anchor, wrong scale, wrong
timeframe — **not** evidence against Gann. `harmonicProximity`'s stale
Square-of-9 anchor is the worked example: the criterion was not wrong, the
anchor was, and measurement is what exposed it. Attribution is a debugging
instrument pointed at our own code. It is never a jury on the methodology.

**Check gate 1 before hunting a translation bug.** That porting-defect
presumption applies to a criterion that *is* Gann-derived. For one that
never was, an inversion is the expected result rather than a bug to chase:
a non-Gann filter measuring against Gann-selected setups is what "it never
belonged" looks like in the data. The `adxTrendStrength` discard (audit
outcome above) is the worked example, and the general rule it yields is
worth stating on its own — **when a criterion measures against its declared
sign, ask whether it was ever grounded in the methodology the setups are
selected by, before spending effort on a translation bug that may not
exist.** Gate 1 first, then gate 2.

**What measurement is NOT.** It does not confer legitimacy on a threshold.
Legitimacy lives in the criteria being counted, which are Gann's. A cutoff
on a count of Gann conditions is a ranking and display decision, not a claim
about the market.

**Gate 1 status** (2026-09-16):

- `adxTrendStrength` (Wilder) — **resolved: discarded, and landed.** Removed
  from `CRITERION_KEYS` in PR #236; `TOTAL_POINTS` is back to 9 and the
  cutoffs rescaled with it. See "Audit outcomes" above.
- `patternArmed` (STRAT) — **still open**, and it is now the only gate-1
  failure among the nine. The same `lib/strat/patterns.ts` taxonomy has a
  second, non-gating use that *is* deliberately kept (audit outcome above);
  that keep covers the display use only and does not settle this scored one.

Resolving a gate-1 item changes `CRITERION_KEYS.length` — which moves
`TOTAL_POINTS` and both thresholds — so it is deliberately not a drive-by
edit. PR #236 is the worked precedent for doing it properly: criterion out,
registry entry retired, thresholds rescaled to hold the same relative bar,
and the reasoning recorded here.

## The scorecard's role — recorded so it is not re-litigated

The scorecard supplies **no substance of its own**. It counts and ranks how
many of *Gann's* confirming conditions a setup satisfies, so the best
opportunities are identifiable — especially for a novice who cannot yet
weigh ten conditions by feel. It is a legibility layer over Gann's criteria,
not a competing method.

It earns its keep a second way: the factor table
(`lib/backtest/attribution.ts`) is the instrument that makes a mistranslated
criterion visible at all. Without it a wrong anchor stays invisible
indefinitely, which is exactly what happened to `harmonicProximity`.

Two consequences follow, and together they are why
`DEFAULT_CRITERION_WEIGHTS` is uniform as of 2026-09-16:

- **Weighting is substance.** A non-equal weight asserts that one of Gann's
  conditions outranks another. Nothing in the source catalog ranks the
  confirming conditions against each other — every "most important" in
  `docs/GANN_HISTORICAL_SOURCES.md` sits *within* a technique (50% among
  retracement levels, the 20-year Master Time Period among cycles, 1/2 = 26
  weeks among the 52-week fractions), never across them. A weighted sum is
  therefore the scorecard injecting a ranking claim Gann never made. If a
  citable cross-criterion ranking is ever found, that changes this.
- **Thresholds are not substance.** A cutoff is where the ranked list gets
  split for display. It can be set or moved from measurement without
  claiming anything about the market.

## Hermetic principles & cycle theory — standing background lens

Per the project owner's explicit, standing direction (2026-09-16): the
seven Hermetic principles (Mentalism, Correspondence, Vibration, Polarity,
Rhythm, Cause and Effect, Gender) and the general cycle-theory material in
`docs/GANN_HISTORICAL_SOURCES.md` Part C (Dewey's Foundation for the Study
of Cycles, Tomes' harmonic-resonance cycle theory) are a standing design
lens for this codebase going forward — considered by default in every
session's Gann-adjacent work, not opted into case by case.

**Elevated 2026-09-17 from passive lens to active design input, by project-
owner direction.** These are not background reading to be noted and set
aside. Every Gann-adjacent piece of work — a new criterion, a rebuilt module,
an entry rule, a chart overlay — is to be *designed through* them, and the
design is to say so. Concretely, before building, answer all three in writing
(a module header is the right place, and `lib/gann/entryTrigger.ts` is the
worked example):

1. **Which Gann source discloses this, and at which tier** (`docs/GANN_HISTORICAL_SOURCES.md`).
2. **What the cycle-theory literature says about it** — Part C, Dewey's
   Foundation for the Study of Cycles and Tomes' harmonic-resonance work. Where
   the component makes any claim about periodicity or recurrence, run **Dewey's
   seven-item checklist** explicitly: dominance, regularity of timing,
   repetition count, constancy of period, phase-resumption after distortion,
   wave-shape identity, cross-series clustering. `lib/gann/spectralCycle.ts`
   evaluates three of the seven and says which — that is the standard: state
   which you cleared and which you did not.
3. **Which Hermetic principle it expresses** — Mentalism, Correspondence,
   Vibration, Polarity, Rhythm, Cause and Effect, Gender. Correspondence ("as
   above, so below") is why a technique proven on one timeframe or asset class
   is expected to hold on another, and is the reasoning behind the
   cross-platform consistency principle at the top of this file. Rhythm and
   Vibration are why cycle and swing work is load-bearing rather than
   decorative. Polarity is why every rule here has a symmetric short form —
   see `computeGannEntryTrigger`'s mirror.

**What this elevation does NOT change: the citation discipline.** Framing a
design through these principles is required; using them as *evidence* is still
not allowed. They shape what gets built and how it is reasoned about. They
cannot, on their own, move a threshold, a weight, or an architectural
decision — only a citable Gann source or a measured result can do that. A
belief with no citable source, or one that has not cleared Dewey's checklist,
stays where `lib/gann/digitalRoot.ts` sits: real, running, labelled a
hypothesis, confluence-only, never independently gating. Infusing the
literature means reasoning with it, not promoting it to proof. The load-bearing distinction, carried over
unchanged from the "WD Gann precedence" section above: a technique
citably tied to Gann's own methodology (or to the cycle-theory literature's
own rigorous validation standard) gets built and takes precedence over
GSPS's prior, more conservative treatment. A belief about numbers, cycles,
or vibration with no citable source, or that hasn't cleared **Dewey's own
cycle-validation checklist** — dominance, regularity of timing, repetition
count, constancy of period, phase-resumption after distortion, wave-shape
identity, cross-series clustering — stays exactly where `lib/gann/
digitalRoot.ts` already sits today: real, running, clearly labeled as a
hypothesis, confluence-only, never able to independently gate a live
verdict. Building this out is real work for future sessions
(`docs/GANN_METHODOLOGY_FULL_REPORT.md` §18.4 sequences it explicitly:
cheapest/most literal Gann rules first, the astrology/numerology module
family last, after the rest of the system is re-tested) — this section
establishes the mindset and the citation discipline, not a mandate to
build the whole layer in one session.

**Two things this section does NOT do, stated precisely so neither drifts
into becoming assumed history:**

- It does not establish, and no document in this repo establishes, that
  any existing GSPS constant (`TOTAL_POINTS`'s historical value of 9
  scored criteria included) was chosen for Hermetic, vibrational, or
  numerological reasons. That was a live question raised in this session;
  the honest answer, checked against `lib/scoring/weights.ts`'s own doc
  comments and every commit history available, is that it wasn't — the
  criteria count changed repeatedly over time as checks were added,
  retired, and replaced, tracking `CRITERION_KEYS.length` mechanically,
  not a numerological target. Going forward, a Hermetic/cycle-theory
  framing may legitimately *shape new design decisions* (per this
  section); it does not retroactively become the reason past ones were
  made.
- It does not resolve, in either direction, the specific tension between
  `GANN_HISTORICAL_SOURCES.md` B2 (digital-root reduction — "casting out
  nines" — is arithmetic mod 9, true of any multiple of 9 by construction,
  not a market discovery) and Part C's Tomes material (cycle *lengths*
  settling into small integer ratios, a physical-resonance claim). These
  are different claims about different things; Part C provides real,
  separately-testable evidence for the second claim, and doesn't overturn
  the first one's narrower arithmetic point. Cite each for what it actually
  says, not for a combined claim neither source makes on its own.

## Astrology — standing decision (2026-09-16, project owner direction)

Real historical evidence says Gann himself used astrology (`docs/
GANN_HISTORICAL_SOURCES.md` A2.3's signed 1954 client letter — worked
planetary-degree conversions, dated aspect-based forecasts). GSPS's policy
is nonetheless settled, not open:

**Astrology must never gate a live verdict.** It is not a scored criterion,
not a pass/fail check, and never independently decides Execute/Watch/Avoid.

**It may exist only as a labeled, non-gating confluence signal** — the same
`confluence/context only` treatment `lib/gann/digitalRoot.ts` and
`lib/gann/decadeCycle.ts` already carry — and only if a legitimate, citable
technique can be encoded without inventing numerology GSPS has no authorized
specification for. The existing "no new numerology without an authorized
spec" rule (`docs/GANN_SARA_CONFLUENCE.md`) applies in full to any astrology
candidate: a real planetary-longitude/aspect calculation traceable to a
cited source is admissible as a confluence field; an invented price-to-degree
conversion constant is not, however Gann-flavored it sounds.

**Until such a technique and its citable specification exist, disregard
astrology entirely** — no code, no confluence field, nothing built. This is
the resolution of `docs/GANN_METHOD_COMPLETENESS_AUDIT.md`'s open item on
whether astrology has any place in GSPS at all; check that document's
"Astrology" addendum section if this ever needs revisiting.

## Strategy Modes — scoped exception to the non-Gann boundary (2026-09-23, project owner direction)

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
before; `patternArmed`'s open gate-1 status is unaffected; the "Expanded
indicator library" Q2 roadmap item's own boundary ("no indicator added there
may feed a scored criterion...") is unaffected. This exception is scoped to
one new, clearly-labeled, opt-in system and nothing else.

**Future custom-script/plugin system.** The project owner also asked about a
TradingView-style system where a user (or GSPS) can author and plot a new
indicator/strategy that generates its own levels the same way. That is a
substantially larger, security-sensitive (sandboxed execution) project of
its own — scoped as a design-only Q2/Q3 roadmap initiative in
`docs/STRATEGY_MODES.md` and ROADMAP.md rather than built this session. Any
strategy plugin built under that future system would need to satisfy the
same rules this section states: opt-in, one-at-a-time, never touching the
Gann verdict, and clearly labeled.

## Three-question mandate — the lens work is reasoned through, every session

Project owner direction, 2026-09-23, standing indefinitely; clarified
2026-09-23. This is not a checklist bolted onto finished work and it is not
a gate — it is the **framework, the core, the structure**: the lens a
session conceives of and reasons through a concept with, from the moment
the idea forms, not a compliance step applied after the shape of the thing
is already decided. Read the three questions below in that spirit — as the
soul/source the platform is designed and reasoned through, not as boxes to
tick once a design is finished.

**Why this exists — the motivating precedent.** A prior session proposed a
concept carrying an implicit linear, discrete-step assumption baked into
its design — the kind of default a mind reaches for without noticing it
has reached for it. The project owner was the one who caught it and
redirected the session toward a continuous scanning function instead; the
session then went back and confirmed the correction against its own notes.
Nothing about that idea was Gann-adjacent in the narrow, criteria-and-scoring
sense, and nothing about it was a citation problem — it was a *reasoning*
problem: a linear-thinking default slipped into a concept because nobody
was holding a lens up to it while it was still being conceived, only after
it had already taken a shape. This is recorded here the same way
`harmonicProximity`'s stale anchor and the ADX incident are recorded
elsewhere in this file — as a concrete, worked example of a failure mode,
not a hypothetical one — because the mandate exists specifically to catch
this class of mistake *before* it becomes a feature, not to audit it after.

Ask and answer these three questions — in writing, where the work lands
(module header, PR description, or the session's reply) — while conceiving
of and reasoning about a concept, in this order:

1. **How does Gann's own methodology best ground or improve this?** Cite
   the source and tier in `docs/GANN_HISTORICAL_SOURCES.md`.
2. **How does Dewey's and Tomes' work on cycles best inform this?** Where
   the component makes any claim about periodicity or recurrence, run
   Dewey's seven-item checklist explicitly (dominance, regularity of
   timing, repetition count, constancy of period, phase-resumption after
   distortion, wave-shape identity, cross-series clustering) and state
   which items were cleared and which were not.
3. **Which Hermetic principle does this best express** — Mentalism,
   Correspondence, Vibration, Polarity, Rhythm, Cause and Effect, or
   Gender — and does that framing change the design?

This is a **reasoning and design discipline**, not a new evidentiary
standard, and it is emphatically not a gating mechanism: it does not exist
to unlock or move thresholds, weights, or gates, and it does not relax the
citation discipline set out under "Hermetic principles & cycle theory"
above. Hermetic framing and cycle-theory literature shape *how* a
component is designed and reasoned about; they cannot, on their own, move
a threshold, a weight, or a gate. Only a citable Gann source (per "WD Gann
precedence" and "Gann-derived AND measured" above) or a measured result
(`lib/validation/criteria-registry.ts`) can do that. Applying this mandate
must not be read as license to smuggle in unsourced numerology, astrology,
or cycle claims that haven't cleared Dewey's checklist — those still stay
confluence-only and non-gating, per the existing rule.

**Scope: platform-wide, not Gann-adjacent-only.** All three questions apply
to every feature, function, and future update on this platform —
scoring/criteria/Gann-technical surfaces, yes, but equally UI/UX,
functionality, interface design, copy, onboarding, everything with a
product-facing shape. A prior framing of this section scoped it to
Gann-adjacent work only (new or audited criteria, scoring, level
construction, entry/exit/risk logic, lifecycle, charting, education copy);
that framing was too narrow and is corrected here. Where question 1 (Gann
sourcing) genuinely doesn't apply to a given surface — pure UI/UX work,
novice-vs-pro interface design, and similar cases where there is no Gann
technique to cite — questions 2 (cycle theory) and 3 (Hermetic principles)
still apply and should be worked through; question 1's inapplicability
does not excuse the other two. The one true exemption is work with no
product-facing shape at all — a build fix, a typo, a dependency bump, pure
infra with no design decision embedded in it — and that exemption should
be stated plainly rather than assumed: say "this has no product-facing
shape, the mandate does not apply" instead of silently skipping it or
padding an answer to appear compliant.

**Worked example: the novice-friendly-yet-expert-depth interface design
goal.** This platform's goal of an interface that is approachable to a
novice while still carrying expert-level depth is a worked example of
**Polarity** (Hermetic principle, Emerald Tablet): two poles of the same
spectrum, novice and expert, held together in one coherent design — not a
tradeoff where one pole is chosen at the other's expense, and not a
compromise that dilutes both. It is also read through **Rhythm** and
cycle theory — specifically the technology adoption/product life-cycle
pattern (innovators through laggards, and the maturity/decline phase that
typically follows). GSPS's stance toward that pattern is to observe and
respect its actual behavior — its phases, its rhythm — without accepting
the pattern's typical terminal decline/obsolescence phase as inevitable
for this platform. The intent is not exemption from the cycle; it is
persistence *through* correctly adhering to whatever the pattern's real
underlying rule turns out to be, the same way a Gann technique is
implemented by translating its disclosed rule faithfully rather than by
declaring the rule optional. Treat this the way `lib/gann/entryTrigger.ts`
treats the three questions for a code module — stated in place, not
assumed.

This section is what makes the mandate durable across sessions: it is
checked into the repository and loaded by every session via
`CLAUDE.md` → `AGENTS.md`, the same mechanism that already carries every
other standing principle in this file. A session has no means to reach
into a different, already-completed session and retroactively change what
it did; a request to audit specific past work should name the PRs or
commits, and that audit should be run — and recorded here or in the
relevant doc — going forward, not assumed to have happened automatically.

### Worked example: universe rotation — the precedent this mandate codifies

**Note:** the "motivating precedent" above and this worked example are the
same event. This section predates the formal mandate by a few hours in the
same session; it is kept as the concrete artifact rather than folded away,
the same way `lib/gann/entryTrigger.ts` is a standing worked example rather
than a paragraph summarizing it.

## Cycles as architecture, not only scoring — standing direction (2026-09-23, project owner)

The Hermetic principle of Rhythm — everything flows, out and in; a cycle
completes and *returns*, it does not complete and stop — governs how this
platform's own recurring processes are designed, not only which market
techniques get scored. This is the same "Hermetic principles & cycle
theory" section above, extended by direct project-owner instruction from
scoring criteria to the platform's architecture itself: a scheduled job
that drains a finite batch and halts is a linear model, and linear is not
how Gann's own cycle work treats the market, so it is not how this
platform's own scanning cadence should be modeled either.

**Worked example: the universe-rotation scan design**
(`lib/scan/universe-rotation.ts`, built the same session this direction was
given). The automated market scan's coarse universe was capped at the
top-250-most-active symbols every run (`FULL_UNIVERSE_TOP`,
`lib/marketScan.ts`) — a structural exclusion of most of the 766-ticker
large-cap universe from ever being looked at, not a deliberate choice (see
PR #265's platform-wide scan audit). The fix chunks the full universe and
rotates through the chunks so full coverage happens over a repeating cycle
instead of never happening at all. The rotation index is **time-anchored**
(`resolveRotationChunk`, keyed off ET wall-clock minutes via
`lib/market/session.ts#etParts`), not a stored counter that increments and
could desync — a missed or delayed cron tick still resolves to the correct
chunk on the next run, because the schedule's phase is recomputed from the
clock every time rather than carried forward as state. That is Dewey's
"phase-resumption after distortion" criterion (Part C), applied here as an
**engineering property of the mechanism**, not a claim about market data —
the distinction matters and is kept explicit in that module's own header.

**The boundary to hold, stated the same way `lib/gann/trendStrength.ts`
states its own two engineering constants:** the *shape* of the design (a
returning cycle, not a linear batch-and-halt) is Rhythm-grounded and
Dewey-informed reasoning about how to build a scheduler well. The
*specific numbers* — chunk size, rotation interval, how many chunks make a
full cycle — are engineering choices sized against the Vercel Hobby
60-second function budget and the measured per-symbol scan cost
(`FULL_UNIVERSE_TOP`'s own doc comment), not derived from any Gann source
or cycle-theory literature. Framing shapes the design. It does not source
the numbers. Do not let a future session read "time-anchored, phase-
resuming" as a claim that the rotation cadence itself is Gann-derived —
it isn't, and it doesn't need to be to be good engineering.

**Standing instruction going forward:** before designing any new recurring
platform process — a cron cadence, a rescanning loop, a rotation, a
retry/backoff schedule — ask whether a linear "run once and stop" or "drain
and halt" shape is actually right, or whether the process is naturally
cyclical (the market it serves never stops cycling either) and should be
built as a returning wheel instead. Say which, in the module's own header,
the same way `lib/gann/entryTrigger.ts` states its three-question Gann/
cycle-theory/Hermetic design basis.

## Three-question mandate — the lens work is reasoned through, every session

Project owner direction, 2026-09-23, standing indefinitely; clarified
2026-09-23. This is not a checklist bolted onto finished work and it is not
a gate — it is the **framework, the core, the structure**: the lens a
session conceives of and reasons through a concept with, from the moment
the idea forms, not a compliance step applied after the shape of the thing
is already decided. Read the three questions below in that spirit — as the
soul/source the platform is designed and reasoned through, not as boxes to
tick once a design is finished.

**Why this exists — the motivating precedent.** A prior session proposed a
concept carrying an implicit linear, discrete-step assumption baked into
its design — the kind of default a mind reaches for without noticing it
has reached for it. The project owner was the one who caught it and
redirected the session toward a continuous scanning function instead; the
session then went back and confirmed the correction against its own notes.
Nothing about that idea was Gann-adjacent in the narrow, criteria-and-scoring
sense, and nothing about it was a citation problem — it was a *reasoning*
problem: a linear-thinking default slipped into a concept because nobody
was holding a lens up to it while it was still being conceived, only after
it had already taken a shape. This is recorded here the same way
`harmonicProximity`'s stale anchor and the ADX incident are recorded
elsewhere in this file — as a concrete, worked example of a failure mode,
not a hypothetical one — because the mandate exists specifically to catch
this class of mistake *before* it becomes a feature, not to audit it after.

Ask and answer these three questions — in writing, where the work lands
(module header, PR description, or the session's reply) — while conceiving
of and reasoning about a concept, in this order:

1. **How does Gann's own methodology best ground or improve this?** Cite
   the source and tier in `docs/GANN_HISTORICAL_SOURCES.md`.
2. **How does Dewey's and Tomes' work on cycles best inform this?** Where
   the component makes any claim about periodicity or recurrence, run
   Dewey's seven-item checklist explicitly (dominance, regularity of
   timing, repetition count, constancy of period, phase-resumption after
   distortion, wave-shape identity, cross-series clustering) and state
   which items were cleared and which were not.
3. **Which Hermetic principle does this best express** — Mentalism,
   Correspondence, Vibration, Polarity, Rhythm, Cause and Effect, or
   Gender — and does that framing change the design?

This is a **reasoning and design discipline**, not a new evidentiary
standard, and it is emphatically not a gating mechanism: it does not exist
to unlock or move thresholds, weights, or gates, and it does not relax the
citation discipline set out under "Hermetic principles & cycle theory"
above. Hermetic framing and cycle-theory literature shape *how* a
component is designed and reasoned about; they cannot, on their own, move
a threshold, a weight, or a gate. Only a citable Gann source (per "WD Gann
precedence" and "Gann-derived AND measured" above) or a measured result
(`lib/validation/criteria-registry.ts`) can do that. Applying this mandate
must not be read as license to smuggle in unsourced numerology, astrology,
or cycle claims that haven't cleared Dewey's checklist — those still stay
confluence-only and non-gating, per the existing rule.

**Scope: platform-wide, not Gann-adjacent-only.** All three questions apply
to every feature, function, and future update on this platform —
scoring/criteria/Gann-technical surfaces, yes, but equally UI/UX,
functionality, interface design, copy, onboarding, everything with a
product-facing shape. A prior framing of this section scoped it to
Gann-adjacent work only (new or audited criteria, scoring, level
construction, entry/exit/risk logic, lifecycle, charting, education copy);
that framing was too narrow and is corrected here. Where question 1 (Gann
sourcing) genuinely doesn't apply to a given surface — pure UI/UX work,
novice-vs-pro interface design, and similar cases where there is no Gann
technique to cite — questions 2 (cycle theory) and 3 (Hermetic principles)
still apply and should be worked through; question 1's inapplicability
does not excuse the other two. The one true exemption is work with no
product-facing shape at all — a build fix, a typo, a dependency bump, pure
infra with no design decision embedded in it — and that exemption should
be stated plainly rather than assumed: say "this has no product-facing
shape, the mandate does not apply" instead of silently skipping it or
padding an answer to appear compliant.

**Worked example: the novice-friendly-yet-expert-depth interface design
goal.** This platform's goal of an interface that is approachable to a
novice while still carrying expert-level depth is a worked example of
**Polarity** (Hermetic principle, Emerald Tablet): two poles of the same
spectrum, novice and expert, held together in one coherent design — not a
tradeoff where one pole is chosen at the other's expense, and not a
compromise that dilutes both. It is also read through **Rhythm** and
cycle theory — specifically the technology adoption/product life-cycle
pattern (innovators through laggards, and the maturity/decline phase that
typically follows). GSPS's stance toward that pattern is to observe and
respect its actual behavior — its phases, its rhythm — without accepting
the pattern's typical terminal decline/obsolescence phase as inevitable
for this platform. The intent is not exemption from the cycle; it is
persistence *through* correctly adhering to whatever the pattern's real
underlying rule turns out to be, the same way a Gann technique is
implemented by translating its disclosed rule faithfully rather than by
declaring the rule optional. Treat this the way `lib/gann/entryTrigger.ts`
treats the three questions for a code module — stated in place, not
assumed.

This section is what makes the mandate durable across sessions: it is
checked into the repository and loaded by every session via
`CLAUDE.md` → `AGENTS.md`, the same mechanism that already carries every
other standing principle in this file. A session has no means to reach
into a different, already-completed session and retroactively change what
it did; a request to audit specific past work should name the PRs or
commits, and that audit should be run — and recorded here or in the
relevant doc — going forward, not assumed to have happened automatically.

## Three-path tier promotion (2026-09-25, project owner direction)

Every tier transition on the Novice → Pro → Expert → Wall Street ladder can
now be cleared through any one of three independent paths: **Curriculum**
completion (GSPS School), a demonstrated **Track Record**, or **Pay-to-
play**. See `lib/promotion/transitions.ts`, `trackRecordPolicy.ts`,
`curriculumPolicy.ts`, `paths.ts`, and `lib/billing/promotionPricing.ts`.

**Three-question mandate, applied before this was designed:**

1. **Gann sourcing**: N/A. This is a governance/access-tier ladder, not a
   market technique — there is no Gann source to cite for it, and none of
   the three paths' thresholds claim to be.
2. **Dewey/cycle theory**: the Track Record path is a rolling evaluation
   window, which is a periodicity claim. Dewey's seven-item checklist is
   run explicitly in `trackRecordPolicy.ts`'s own header — two items
   clear as genuine periodicity claims (regularity of timing, phase-
   resumption after distortion), three clear by policy construction rather
   than measured evidence (repetition count, constancy of period — and the
   window lengths themselves), and two don't apply to a single trader's
   evaluation (wave-shape identity, cross-series clustering). Stated
   honestly there rather than claiming a clean sweep.
3. **Hermetic principles**: **Polarity** is the load-bearing one — three
   genuinely different poles of qualification (discipline/study,
   demonstrated performance, capital), each a real path on its own, not one
   "real" path with two lesser substitutes. **Cause and Effect**: each path
   is a different kind of evidence offered as the cause a promotion is
   earned from. **Rhythm**: the Track Record path is a recurring, rolling
   measurement (per "Cycles as architecture" above) — a profile that later
   falls below the bar can fall back out of eligibility on the next read,
   this is not a one-time exam that stays passed forever once cleared.

**The project owner's own framing for the promotion moment itself**
(2026-09-23, carried into this build): tier promotion should read as a
genuine graduation out of the constraints appropriate to a lower stage —
"unshackled from their current binds," ascending the ladder — not merely
"more features unlocked." `app/(app)/promotion/page.tsx`'s copy is written
to that framing within `lib/promotion/copy.ts`'s existing forbidden-phrase
rule (no "guaranteed", "best trade", "safe", etc.) — the ascension is
expressed through what a tier's actual constraints were and now aren't,
never through a performance claim.

**The one mandatory, path-independent component** (direct project-owner
decision, 2026-09-25, made when asked which requirements should hold
"if persons are willing to pay"): Wall Street unlocks autonomous live-money
trading (`autonomous_portfolio_manager`, Wall-Street-only per
`lib/tiers.ts`). The Academy 8 capstone's live-trading risk/settlement/
gaps/slippage/account-type education is treated as a safety prerequisite,
not a monetization lever, and is required for **every** path to Wall
Street — curriculum, track record, or pay-to-play alike
(`lib/promotion/curriculumPolicy.ts`'s `mandatoryComponentMet`). This is
the one place the "three independent paths" model has a shared,
non-optional component. It is deliberate; do not "clean it up" into full
path independence without going back to the project owner first.

**Track Record thresholds — where the numbers come from.** GSPS has no
multi-year proprietary track record yet (`docs/replay-runs/`'s longest run
spans about two months). `lib/promotion/trackRecordPolicy.ts`'s own header
comment states this plainly and records the three real inputs actually
used: the existing, already-shipped Novice→Pro policy as the "easy" anchor;
GSPS's own measured backtest evidence (the Execute bucket's +0.362R
expectancy, 2026-09-23 run) as the ceiling a Wall Street-track-record
candidate must approach; and publicly documented funded-account evaluation-
program conventions (10-30 trading days, 8-10% first-phase profit targets)
used only as a structural analogy for window length and profitability-floor
shape, never as evidence about GSPS's own setups. The resulting ladder is
asymmetric by explicit design: no profitability requirement at all for
Novice→Pro (encourages early engagement), a modest floor for Pro→Expert, and
the hardest bar — approaching GSPS's own measured best bucket — for
Expert→Wall Street (discourages skipping the curriculum at the tier that
trusts an autonomous system with the user's money). These are starting
values, remotely tunable the same way the original Novice→Pro policy
already is; re-derive them once GSPS has its own multi-year data rather than
treating them as permanent.

**A profitability metric distinct from execution scoring, by design.**
`lib/risk/execution-score.ts`'s own header states P&L must never feed
execution scoring — luck can reward poor behavior, and correct execution
can still lose. The Track Record path's `cumulativeReturnPct`/`expectancyR`
(`lib/promotion/readiness.ts#gatherTrackRecordInputs`) are a deliberately
separate computation for a different question ("has this trader actually
made money," relevant to promotion specifically) and are never fed back
into risk sizing.

**Pay-to-play pricing is a proposal, not a live product.**
`lib/billing/promotionPricing.ts` follows the same "not enabled until real
Stripe prices exist" posture as the existing `lib/billing/stripe.ts` —
`isPromotionBillingEnabled()` is `false` until configured, so no checkout
can go live from this alone. Proposed figures (Novice→Pro $49 one-time;
Pro→Expert $499 one-time + the standard subscription; Expert→Wall Street
$1,499 one-time + the standard subscription) are sized against GSPS's own
existing tier subscription prices so pay-to-play is always the worse deal
than earning a tier for free through curriculum or track record — see that
module's own header for the transition-by-transition reasoning. These
numbers await project-owner approval before any Stripe product is created.

**Schema**: `supabase/migrations/0080_tier_promotion_three_paths.sql` adds
`tier_promotions_progress`, `tier_promotions_status`, and
`tier_promotion_purchases` — generalized across all three transitions,
including Novice→Pro going forward. The original `promotion_progress`/
`promotion_status` (0046) are left in place, immutable per this repo's
convention, and continue to be read for Novice→Pro's existing Foundations
education/practice-validation flags specifically — they are not migrated or
dropped, since no profile has been promoted through them yet.

**What was generalized vs. left alone.** `lib/promotion/eligibility.ts`'s
original `evaluatePromotionReadiness`/`DEFAULT_PROMOTION_POLICY` are
untouched and still drive the pre-existing `/api/promotion/status` /
`/api/promotion/upgrade` routes and the Settings page's promotion card
exactly as shipped — this build added new, separate functions
(`evaluateTrackRecordEligibility`, `evaluatePromotionPaths`) and new routes
(`/api/promotion/paths/status`, `/api/promotion/paths/upgrade`) alongside
them rather than rewriting what already worked. A future session should
prefer the generalized surface for any new work and can retire the original
Novice→Pro-only routes once the new `/promotion` page is confirmed to be
the intended replacement UI, but that retirement is not done here.

## Temporary overrides — mandatory, check on every session

These are explicit, user-directed departures from the protocol's real design, made for a stated
reason and with a stated revert trigger. Read this section every session. When a trigger fires,
raise it with the user before doing anything else with the affected code — don't silently carry an
override past the point it was supposed to end.

### Execution timeframe — reverted to 15Min early (2026-09-09 through 2026-09-17)

**Resolved 2026-09-17, project owner direction — reverted early, not via its own trigger.**
`EXECUTION_TIMEFRAME` in `lib/timeframe.ts` was temporarily forced to `"1Hour"` (2026-09-09) instead
of the protocol's real design of `"15Min"`, specifically because the free Alpaca feed's ~15-minute
equity delay makes a 15-minute bar's lag ratio exactly 1.0 — tripping `applyDataLagHold`
(`lib/data/latency.ts`) and holding *every* equity Execute verdict to Watch whenever the market is
open, so a `trade_plan` could never reach `armed` and the Automated Portfolio Manager could never
place a trade. That override's own stated revert trigger was `MARKET_DATA_REALTIME=true` (a paid
real-time feed). **That trigger never fired.** The override was reverted anyway, on the free delayed
feed, because its cost turned out to be worse than the starvation it was solving: setups armed on a
stale 1-hour-delayed bar were arriving with the move already largely played out — see the
2026-09-17 HBAN case (entry $16.77, price already at $15.66, through TP1, by the time the setup
rendered). The project owner's call: a thin-to-empty equity Execute bucket on 15Min (crypto
unaffected — `feedDelayMs` is always 0 for crypto) is an acceptable, understood cost; systematically
stale triggers are not, especially on a novice-facing platform. See `lib/timeframe.ts`'s own header
comment on `EXECUTION_TIMEFRAME` for the full detail — this entry is the historical record, that one
is the live rule.

No new override or revert trigger is standing in its place. If the equity Execute bucket proves too
thin to be useful before real-time data lands, that is a discussion to have with the project owner,
not a reason to silently re-widen `EXECUTION_TIMEFRAME` again — that was tried once already.

### Execute collapse stopgap — RESOLVED 2026-09-23

**Closed, not merely reverted.** The threshold half of this stopgap (`EXECUTE_SCORE_THRESHOLD`
6, `WATCH_SCORE_THRESHOLD` 3.5, `lib/scoring/weights.ts`) was a deliberate, temporary loosening
from the protocol's original 7/4 pair, made 2026-09-14 after all nine scored criteria were
replaced with specific, individually rare Gann technical events and the old bar admitted 0/1061
Execute trades on the committed run and 0 in production. Its own stated revert trigger — the next
fresh, committed backtest run with a non-trivial Execute bucket (n≥30) — fired 2026-09-23 on
`docs/replay-runs/2026-09-23-15Min-2R-within-all-12sym.json` (12-symbol universe, 615
unconditioned trades, captured after PR #274 fixed a replay-only wiring bug that had been zeroing
`entryTriggerArmed`). Execute bucket: 41 trades, +0.362R expectancy, 36.6% win rate, PF 1.87. A
supplementary per-score-band sweep of the same population confirmed the real zero-crossing sits
almost exactly at the existing 6-point cutoff (negative through score 4, turning positive at 5–6).
Re-deriving from this data does not move either number — it confirms them as the platform's actual
thresholds, not a stopgap. `lib/scoring/weights.ts`'s own comment on `EXECUTE_SCORE_THRESHOLD`
carries the full detail now; this entry is the historical record.

The two band loosenings (`VOLUME_CLIMAX_THRESHOLD`, `SQUARE_TOLERANCE_BARS`) were already resolved
earlier (reverted and superseded respectively, both same-day 2026-09-14) and the weight-rebalance
half was settled on principle 2026-09-16 (see `DEFAULT_CRITERION_WEIGHTS`'s own doc comment) — all
now confirmed rather than merely carried forward, per the 2026-09-23 run above: `volumeClimax`
273/615 (44.4%) passing, Δ+0.645R; `timePriceSquare` 130/615 (21.1%) passing, Δ+0.111R (positive
for the first time since the ATR-normalization fix). See `lib/gann/volumeClimax.ts` and
`lib/gann/timePriceSquare.ts`'s own header comments.

**One open item this run surfaced, not yet acted on.** `stopRoom` is currently registry-quarantined
(`lib/validation/criteria-registry.ts`) for saturating 98–99% on the 2026-09-14 six-symbol runs —
past `DEFAULT_SATURATION_BOUNDS`' 95% ceiling. The 2026-09-23 twelve-symbol run reads it at 430/615
(69.9%) passing, Δ+0.213R, informative and well inside bounds — but the underlying stop-anchoring
code (`lib/strat/levels.ts`'s `nearestStructuralStop`, `EQUITY_STOP_MIN_PCT`/`EQUITY_STOP_MAX_PCT`)
has not changed since the quarantine, so this reads as a population-dependent result (a wider,
more-structured universe naturally clears the band more often), not a confirmed fix. Flagged here
rather than silently un-quarantined; a future session should treat this as an open question, not a
resolved one.

**Live weights incident (2026-09-17) — merging is not shipping.** PR #235 merged the uniform
`DEFAULT_CRITERION_WEIGHTS` decision to `main` and deployed clean, and the change was still
**inert in production**. The project owner reported a score of `4.48` on the live site, which is
impossible under uniform weights — every scored criterion is worth exactly one point, so a score
can only be a whole number. `lib/scoring/active-weights.ts` prefers a `learning_models` row
promoted to `status = 'live'` over the code constant, and one had been promoted on 2026-09-16
carrying the very hand-set distribution PR #235 existed to repudiate. `4.48` reconciles exactly
against that row's ten-criterion parse. Three separate things went wrong and each is worth naming:

- **A database row silently outranked the repo.** The decision was merged, deployed and guarded
  by a test, and none of that reached the scan. Code review cannot see this surface.
- **The guard test only covered the constant.** `lib/__tests__/default-weights.test.ts` asserted
  the code default was uniform, which was true and irrelevant. A green test was read as evidence
  about production.
- **The row was already stale, and was being reshaped rather than rejected.** It was proposed
  against ten criteria including `adxTrendStrength`; when that criterion was discarded hours
  later, `parseCriterionWeights` dropped the unknown key and renormalised the remaining nine into
  a distribution nobody had proposed, measured or approved — well-formed, and indistinguishable
  at the call site from one that had been.

Fixed 2026-09-17: the row was demoted to `deprecated` (no live `score_adjustment` row exists
today), `isWeightSetAddressedToCurrentCriteria` in `lib/scoring/active-weights.ts` now rejects and
warns on any stored set whose key set does not match `CRITERION_KEYS` exactly, and
`lib/scoring/__tests__/active-weights.test.ts` guards that path with the real offending row as a
fixture.

**The general rule this yields — check the configuration surface, not just the code.** The
"Cross-platform consistency" principle at the top of this file says a concept must exist on every
surface it applies to. Runtime configuration is one of those surfaces, and it is the one a diff
cannot show you. Before reporting any constant, threshold, weight or flag as live, check whether
something outside the repo overrides it. Known override surfaces as of 2026-09-17:

- `learning_models` (`status = 'live'`) — overrides `DEFAULT_CRITERION_WEIGHTS` via
  `lib/scoring/active-weights.ts`. Guarded as above.
- `lib/risk/policy.ts` — `getRiskPolicy(supabase)` / `setRiskPolicyValue()` resolve risk policy
  from the database over `DEFAULT_RISK_POLICY_VALUES`. **Not yet audited for the same class of
  drift.**
- Environment variables — the confluence modules read `GSPS_DISABLE_GANN_CONFLUENCE` /
  `GSPS_DISABLE_SARA_CONFLUENCE` (`lib/signals/confluence/flags.ts`), and `MARKET_DATA_REALTIME`
  carries a mandatory revert trigger above. **Production values not yet verified.**

The list is a starting point, not an inventory. Re-derive it rather than trusting it.

## Deployment (Vercel)

- The project runs on the **Vercel Hobby (free) plan**. Cron jobs are capped at **2 per project**, each running **no more than once a day**. Before adding a new scheduled job, confirm the total stays at or under that cap — see `docs/THIRD_PARTY_LIMITS.md`. If something needs to run more often than daily, it does not belong in `vercel.json` crons; trigger it from an external scheduler instead.
- `vercel.json` sets `"git": {"deploymentEnabled": true}`, so Git-triggered deployments are **on**: pushing a branch builds a preview, and **merging to `main` deploys straight to production**. There is no manual gate in between. Treat a merge as a release: it is live for users within a couple of minutes.
- **Never trigger a Vercel deployment unless explicitly asked.** The user will say which environment — preview or production — when they want one. Don't assume. Because merges auto-deploy, this also means **don't merge to `main` unless asked** — merging is deploying.
- A branch push unavoidably spawns a preview build. That is expected and fine when you are pushing real work; don't push no-op commits just to move a pointer.

## Git / PR Workflow

- After pushing commits that contain code changes, **always open a pull request** against `main` rather than stopping at the push. Check for a PR template first.
- Do work on the designated feature branch for the task; don't commit directly to `main`.
- **Name the ROADMAP phase in the PR** — `Q1`, `Q2`, `Q3`, `Q4`, or `N/A` for out-of-phase work — in the title or body. The `roadmap-phase` CI gate requires it.
- **Delete the branch immediately after its PR merges** (`git push origin --delete <branch>`, or GitHub's button on the merged PR). Not later, not at the next cleanup.
- A PR whose branch diverged from `main` more than 30 days ago fails the `stale-branch` gate. Merge `main` in (or rebase onto it) and push.
- `bash scripts/audit-stale-branches.sh` reports merged, stale, and active remote branches; a scheduled job runs it monthly. See `CONTRIBUTING.md` → "Branch hygiene".
