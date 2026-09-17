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
- **Wilder's ADX/DMI** (`lib/signals/indicators.ts#adx`) — fed
  `adxTrendStrength`. **Resolved 2026-09-16: discarded** — see "Audit
  outcomes" below. The `adx()` function itself stays: `lib/signals/regime.ts`
  and `lib/signals/states/rangeReversion.ts` are separate consumers asking a
  different question, and were not part of that decision.
- **PSAR/Supertrend** — narrower than it first appears, so scope the work to
  what is actually there. Nothing in this codebase *computes* either one.
  `lib/signals/regime.ts` accepts an optional `trendOverlayFlips` count and
  uses it solely to disqualify a Trend read on repeated flips;
  `lib/signals/states/trendPullback.ts` threads the same optional value
  through. Both default to `0` and no caller supplies a value, so this is a
  dormant hook for a non-Gann overlay rather than live non-Gann substance.
  Either close the hook or ground it.

- **Classic charting indicators** (`lib/indicators.ts`, `lib/analysis/indicators.ts`)
  — `sma`, `ema`, `bollinger`, `rsi`, `macd`, plus `calculateMACD`/`calculateRSI`.
  **Found 2026-09-17 by the sweep above, and absent from every prior version of
  this list** — which is the entry to remember when deciding whether to run that
  sweep again. This is not dead code: `/api/indicators` is a live route,
  `components/chart/market-tabs.tsx` fetches it, and
  `components/chart/candles.tsx` renders user-facing overlays for SMA 20,
  SMA 50, EMA 9, RSI 14 and MACD 12/26/9. None has any Gann lineage — RSI,
  MACD and Bollinger Bands all postdate Gann's death. **Still open.** The
  Gann-grounded alternatives already exist in this repo (fan angles,
  Square of 9 / Square of 144 levels, swing charts, retracement eighths), so
  "replace" is a real option rather than "remove and leave the chart bare."
  Note the shape of the miss: previous audits looked at the scoring path and
  the signal engine, and a whole user-facing surface sat outside where anyone
  was looking.

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

**What that keep does not cover.** It settles the *display* use only. The
same `lib/strat/patterns.ts` taxonomy also feeds `patternArmed`, a **scored**
criterion — and scoring gates, where `sara.ts` cannot. So `patternArmed`
takes no shelter from the entry above and remains an open gate-1 item; the
investigation that cleared the display use is in fact the same finding that
sharpens the question for the scored one, since it establishes there is no
Gann source behind the taxonomy at all. Do not read "Sara's candle counting
is kept" as "STRAT is settled."

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

## Temporary overrides — mandatory, check on every session

These are explicit, user-directed departures from the protocol's real design, made for a stated
reason and with a stated revert trigger. Read this section every session. When a trigger fires,
raise it with the user before doing anything else with the affected code — don't silently carry an
override past the point it was supposed to end.

### Execution timeframe forced to 1Hour (since 2026-09-09)

**What:** `EXECUTION_TIMEFRAME` in `lib/timeframe.ts` (the single source of truth — every consumer
imports it from there) is set to `"1Hour"`, not the protocol's real design of `"15Min"`.

**Why:** The free Alpaca feed delays equities ~15 minutes. On a 15-minute execution bar that's a
lag ratio of exactly 1.0, which trips `applyDataLagHold` (`lib/data/latency.ts`) and holds *every*
equity Execute verdict to Watch whenever the market is open — so a `trade_plan` can never reach
`armed`, and the Automated Portfolio Manager can never place a trade. At 1Hour the same delay is
25% of a candle, comfortably under the hold. The user asked for this explicitly, to verify the
automation *pipeline* (plan created → armed → picked up → order placed) works end to end on paper
money, while real-time data is not yet purchased.

**What this is NOT:** validation that the strategy works at 1Hour. `docs/BACKTESTING.md` records
that 1Hour has historically inverted the scoring model's own verdict ranking (Execute measuring as
the *worst* bucket, not the best) — untouched by this override. Never cite a paper trade produced
under this override as evidence the strategy is sound; it's only evidence the plumbing fired.

**Mandatory revert trigger:** the moment `MARKET_DATA_REALTIME=true` is set for a paid real-time
feed (removing the 15-minute delay entirely — `feedDelayMs` then returns 0 regardless of bar size),
this override must be reverted to `"15Min"` in the same change. Reminder text for that moment:
*"You asked to be reminded — real-time data is live now, so the temporary 1Hour execution-timeframe
override should come out."* Don't wait to be asked twice; raise it as soon as you see
`MARKET_DATA_REALTIME` being turned on, or see it already on, in the same session.

**To revert:** change `EXECUTION_TIMEFRAME` in `lib/timeframe.ts` back to `"15Min"`, delete this
section, and re-run `lib/data/__tests__/provider-execution-timeframe.test.ts` plus a fresh
`?within=all` backtest capture to confirm 15Min's criteria evidence still holds (data ages between
now and the revert). `PLAN_TIMEFRAME` (lib/lifecycle/fromScanResult.ts) and the copy in
`lib/analysis/levelRole.ts` both derive from `EXECUTION_TIMEFRAME` and need no separate edit.

### Execute collapse stopgap: lowered thresholds, loosened two criteria (since 2026-09-14; weight half resolved 2026-09-16)

**What:** Four coordinated changes, all in `lib/scoring/weights.ts` unless noted, made together as one
fix:

- `EXECUTE_SCORE_THRESHOLD` 7 → 6, `WATCH_SCORE_THRESHOLD` 4 → 3.5. **Do not quote these numbers from
  this paragraph — read `lib/scoring/weights.ts`.** They are denominator-dependent and moved twice on
  2026-09-16 alone: to `6.67`/`3.89` when `ruleOfThree` made it ten criteria, then back to `6`/`3.5`
  hours later when `adxTrendStrength` was discarded and `TOTAL_POINTS` returned to nine. Both moves
  were the same arithmetic holding the same relative bar (66.7% and 38.9%), not decisions about how
  hard the bar should be. The round trip is the point: a criterion-count change silently restates
  these constants, so a session that trusts a prose copy of them will be wrong roughly as often as it
  is right. The live pair happens to match the literals above again today; that is coincidence, not
  confirmation.
- ~~`DEFAULT_CRITERION_WEIGHTS` — moved from one point each to a hand-set, evidence-based distribution
  favoring `historicalSR`, `stopRoom`, `swingChartTrend`, `volumeClimax` and minimizing
  `adxTrendStrength`, `gannAngleSlope`, `gannRetracementConfluence`, `timePriceSquare`.~~
  **Superseded 2026-09-16 — reverted to uniform (one point each).** Not because the hand-set numbers
  measured badly, but because "Gann-derived AND measured" rules them out on principle: the
  distribution was built by treating measurement as a verdict on the criteria (up-weight the
  measured-positive, down-weight the measured-negative), which is precisely the jury role that
  principle denies measurement. A criterion measuring negative is a suspected porting defect to fix,
  not a criterion to quietly discount. Uniform is also the only distribution that keeps the scorecard
  free of substance it cannot source — see "The scorecard's role" above. Note that `normalizeWeights()`
  rescales any set to sum to `TOTAL_POINTS`, so this changed which setups reach the cutoffs **without**
  moving the point scale the cutoffs are expressed in.
- `VOLUME_CLIMAX_THRESHOLD` (`lib/gann/volumeClimax.ts`) 1.5x → 1.25x relative volume. **Reverted to
  1.5x on 2026-09-14**, same day: a fresh committed run showed the 1.25x threshold diluted the signal
  toward noise/inversion rather than just widening it (see `lib/validation/criteria-registry.ts`'s
  `volumeClimax` entry). The starvation problem is now addressed a different way —
  `RECENT_PIVOTS_CHECKED` widens the *pool* of candidate anchors checked against the original 1.5x bar,
  instead of lowering the bar itself. Not yet measured against a fresh run.
- `SQUARE_TOLERANCE_BARS` (`lib/gann/timePriceSquare.ts`) 2 → 4 bars. **Superseded (not reverted) on
  2026-09-14:** the criterion now compares elapsed bars against the price move in ATR units instead of
  raw dollars (see `lib/gann/timePriceSquare.ts`'s header), which was the actual scale-dependence bug
  behind the starvation this loosening patched over. `4` carries forward unchanged but now bounds a
  different quantity — not yet measured against a fresh run either.

**Why:** Between 2026-09-10 and -11, all nine scored criteria were replaced with specific Gann
technical events (see the `CRITERION_KEYS` history in `lib/validation/criteria-registry.ts`) —
individually rare (5.7%-29% pass rate each on the committed
`docs/replay-runs/2026-09-11-15Min-2R-within-all.json`, 1061 unconditioned trades), where the
criteria they replaced had been common, lenient checks (2-of-3 trend agreement, ~1.5%-of-price
proximity). Reaching the old 7-of-9 points bar needs most of nine independent-ish rare events to
co-occur, which essentially never happens: that committed run reads 0/1061 Execute, and the live
deployment produced 0 executable trades under the same model before this change — reported directly
by the project owner, along with a fresh backtest showing 1 executable trade out of 1069 at a widely
negative expectancy. Separately, that same run's factor table shows four of the nine criteria reading
*negative* Δ E[R] (`adxTrendStrength` −0.245R, `timePriceSquare` −0.221R, `gannAngleSlope` −0.153R,
`gannRetracementConfluence` −0.090R) — `adxTrendStrength` twice independently quarantined for a
significant inversion. The threshold drop alone would mostly just admit more of those four; the
weight rebalance and the two band loosenings are sized to shift what a lower bar actually admits
toward the four criteria with real, reproducing positive evidence
(`historicalSR` validated, `stopRoom`/`swingChartTrend`/`volumeClimax` consistently positive across
multiple runs).

**What this is NOT:** a proper `lib/backtest/propose-weights.ts` proposal. That function requires a
chronological in-sample/out-of-sample split from real per-trade data; only one committed run existed
to work from, so the weight numbers are a judgment call sized in the same direction that function's
step formula would move, not its actual output. The new `6`/`3.5` thresholds are sized off an
independence approximation over that one run's per-criterion pass rates (a Monte Carlo simulation, not
a measurement of the real joint distribution — criteria plausibly correlate more than independence
assumes on a genuinely trending stock, which would make the real Execute rate somewhat higher than the
approximation predicted). None of this is a claim that the four down-weighted criteria are wrong for
good, or that the four up-weighted ones are fully validated (only `historicalSR` is) — it is a stopgap
to stop the live model from admitting either zero trades or trades selected mostly by criteria already
showing a negative or inverted signal.

**Mandatory revert trigger — CONDITIONAL, and it has NOT fired (checked 2026-09-16):** the next
fresh, committed backtest run with a non-trivial Execute bucket (n≥30). No such run exists in
`docs/replay-runs/`. The trigger now covers the **thresholds only** — the weights half was settled on
principle above and is no longer waiting on data. When such a run is captured, re-derive the
thresholds from its actual Execute-bucket attribution rather than carrying the stopgap forward. Don't
wait to be asked twice; raise it as soon as the run lands.

Two things this trigger does **not** license. Nothing expires by waiting — it is conditional, not a
deadline, so pausing the backtest costs nothing. And **never loosen thresholds to manufacture a
qualifying Execute bucket**: that inverts the trigger into a mechanism for justifying itself.

**To revert (once superseded, not merely to "undo"):** replace the constants above with whatever the
fresh run's threshold re-derivation actually says, delete this section and the `TEMPORARY OVERRIDE`
code comments that point to it, and run `lib/validation/__tests__/criteria-gate.test.ts` plus the full
test suite to confirm the new numbers are internally consistent.

**Backtest status — ON HOLD (2026-09-16).** Three prompts exist from the PR #234 session (capture /
attribute / re-derive) and they are deliberately parked, not forgotten. Prompt 3 re-derives scorecard
thresholds, and the "Gann-grounded platform" audit above may change what the scorecard *is*.
`adxTrendStrength` already came out this way (PR #236), which moved `CRITERION_KEYS.length`,
`TOTAL_POINTS` and both cutoffs — and `patternArmed` is still an open gate-1 item that would move
them again. Calibrating a scorecard that is about to change shape wastes the run. Settle
`patternArmed` first.

Traps for whoever eventually runs it:

- **The new refinements all tighten criteria**, which shrinks the very Execute bucket the threshold
  calibration needs. Derive criterion evidence from the **unconditioned** population (`--within all`)
  and thresholds from the **Execute bucket** — same run, different slices. Do not loosen anything to
  grow the bucket.
- **Derive thresholds from 15Min, not 1Hour.** `docs/BACKTESTING.md` records 1Hour historically
  inverting the scoring model's own verdict ranking (Execute measuring as the *worst* bucket). Capture
  1Hour for the override check if useful, but do not calibrate on it.
- **The `Gann` word is banned in user-facing criterion notes**, which are generated at runtime.
  `scripts/check-banned-terms.mjs` catches it and PR #234 tripped this exact gate. Comments are exempt;
  generated copy is not.

**Platform state carried forward (2026-09-16).** PR #234 merged to `main` (`45038da`), production
deploy READY. It added eight Gann-derived refinements, **all confluence-only** — no scored verdict
changed by that release. The 1Hour execution-timeframe override above remains live in production.

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
