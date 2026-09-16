# GSPS platform-wide Gann method audit (2026-09-15)

**Roadmap phase: Q1** (N/A initiative, out-of-phase by process but in-phase by
citation) — same footing as `GANN_METHOD_COMPLETENESS_AUDIT.md` and
`PROPOSAL_NEW_GANN_CRITERIA.md`: ROADMAP.md's Q1 strategic goal "an accurate
signal engine with explainable logic and tuned scoring." This is research and
documentation only; no scoring weight, threshold, or code changed as part of
this audit.

**Scope.** `GANN_METHOD_COMPLETENESS_AUDIT.md` scoped its five-part audit to
`lib/gann/`, `lib/scoring/`, `lib/signals/confluence/`. This document re-runs
the same five-part structure at the scope of the whole platform —
`lib/signals/`, `lib/guided/`, `lib/risk/`, `lib/backtest/`, `lib/lifecycle/`,
`lib/analysis/`, `lib/scoring/`, and their `app/api/*` and `components/*`
surfaces — through the lens of AGENTS.md's "Cross-platform consistency"
principle: a concept that exists in one place and plausibly applies to
another must be checked there too. **This document does not supersede or
replace the module-scoped audit; both stand, side by side, until a
consolidation decision is made separately.**

**Source base.** Grounded in the now-complete
`docs/GANN_HISTORICAL_SOURCES.md` (25 documents: all ten of Gann's own public
books, two items of his private paid-course/bulletin material, thirteen
secondary/interpretive sources, plus `docs/GANN_CYCLES_STUDY_SUMMARY.md`'s
plain-English digest) and `docs/GANN_METHOD_COMPLETENESS_AUDIT.md`'s own
module-scoped findings, which this document treats as already-established
background rather than re-deriving.

**Update (2026-09-16):** a much fuller text extraction of A2.1 closed the
largest remaining gap in the source catalog — Chapter 7, "Master Time
Factor and Forecasting by Mathematical Rules" — surfacing a complete
disclosed cycle hierarchy with a worked 1896–1935 case study, the
"decade digit" cycle upgraded to primary-confirmed, and three new
Master constructions (Square of 144 fully specified, Square of 20, Square
of 52) plus a fully-specified Hexagon Chart. This revision updates §1's
classification table note, §4's "what to add" list (new items 12–14,
item 8 promoted from research-todo to build candidate), and adds a status
note on the two §3a/§5 mislabeling findings and the §4 items 1–4 Part-4
candidates this document previously flagged, all four of which a sibling,
not-yet-merged branch (`claude/vigilant-pasteur-e5bhk9`, commit `1cba6e0`)
has since built live. Full source detail lives in
`docs/GANN_HISTORICAL_SOURCES.md`'s A2.1 entry.

**One correction to how this audit classifies things, carried over from the
module-scoped audit's own "second update":** the original three-way split a
prior version of this task used — (a) disclosed in Gann's own books, (b) a
documented reconstruction from private papers/course material, (c)
GSPS-original — is no longer fine-grained enough. The ten-book-plus-course
read found a fourth, distinct category: things Gann **disclosed himself, in
his own voice, but only to paying private-course students — never sold to
the general public.** Square of 9 and Gann angles live here, confirmed by
`GANN_HISTORICAL_SOURCES.md` A2.1 (a 2004 transcription of his actual paid
correspondence course). This is not "reconstruction" (a later researcher
guessing at his method) and not "public disclosure" — it is a real third
tier between the two. This audit uses four tags throughout:

- **PUBLIC** — disclosed in one of Gann's ten books sold to the general public.
- **PRIVATE-GANN** — disclosed by Gann himself, in his own voice, but only in
  paid course material/private letters (A2.1, A2.2, A2.3) — genuinely his,
  never sold publicly.
- **RECONSTRUCTION** — not directly evidenced as Gann's own statement;
  assembled by later researchers/practitioners from indirect evidence,
  or a GSPS-authored interpretation of something Gann named but never
  mechanized (e.g. the "vibration"/time-factor reconstructions).
  Note: A2.1's discovery *moved* Square of 9 and Gann angles out of this
  category — treat this as a live category, not a fixed judgment made once.
- **GSPS-ORIGINAL** — no Gann lineage at all; a technique this codebase (or
  a framework it authorizes, like Sara Sniper Strat) built on its own merits.

---

## 1. Scanning criteria baseline

`lib/scoring/weights.ts`'s `CRITERION_KEYS` (nine criteria, confirmed current
as of this session) and the coarse pre-filter in `lib/marketScan.ts`:

| # | Criterion | Tag | Basis |
|---|---|---|---|
| 1 | `swingChartTrend` | **PUBLIC** | Gann's own 3-Day Chart / 9-Point Swing Chart, disclosed in *45 Years in Wall Street* (1949, A9) — one of the closest 1:1 ports anywhere in this codebase (`lib/gann/swingChart.ts`). |
| 2 | `adxTrendStrength` | **GSPS-ORIGINAL** | Wilder's ADX/DMI (1978) — postdates Gann's death (1955) by more than two decades. No Gann lineage whatsoever; reused from `lib/signals/regime.ts` per the cross-platform-consistency principle, not derived from any Gann source. |
| 3 | `gannAngleSlope` | **PRIVATE-GANN** | Absent from all ten public books (confirmed by exhaustive keyword search across A2/A4/A5/A6/A8's readable portion); disclosed by Gann himself, named and defined (1×1 through 8×1+), in his own private paid course (A2.1). |
| 4 | `volumeClimax` | **PUBLIC** | *Truth of the Stock Tape* (1923, A2)'s tape-reading framing plus *How to Make Profits Trading in Commodities* (A8)'s four numbered volume-of-sales culmination rules and fifth open-interest rule — a direct transcription of disclosed tape-reading technique, not a reconstruction. |
| 5 | `historicalSR` | **PUBLIC** | Old-level-crossing / "Crossing Old Levels" — the single most repeated, most concretely worked technique across A2, A4, A5, A8 (worked case studies with real prices and dates in A2 alone). |
| 6 | `patternArmed` | **GSPS-ORIGINAL** | Sara Sniper Strat, an authorized but explicitly separate framework (`docs/GANN_SARA_CONFLUENCE.md`) — not Gann in any tier. |
| 7 | `stopRoom` | **GSPS-ORIGINAL**, discipline-aligned | The literal ATR-multiple mechanism is GSPS's own; the underlying *idea* — a setup needs real room for a stop to matter — is philosophically continuous with Gann's disclosed, PUBLIC stop discipline (mandatory stops, sized risk) across every book, but the mechanism itself isn't his. |
| 8 | `timePriceSquare` | **RECONSTRUCTION** — status re-examined 2026-09-16, tag unchanged but weaker justification | Gann explicitly withholds "the Time factor" in every one of his ten books (a capitalized refusal in A3: "IT IS NOT MY AIM TO EXPLAIN THE CAUSE OF CYCLES"). A2.1's Chapter 7 ("Master Time Factor") is now fully read and still doesn't disclose *why* time and price equate — the refusal itself stands. But A2.1 Ch. 13's Square of 144 worked wheat example *does* disclose a full, literal price/time-squaring arithmetic (halving a 20,736-unit "Great Cycle" down to specific day/week/month bands), materially more concrete than anything on file when `timePriceSquare.ts` was built. GSPS's ATR-normalized bars-vs-price-move construction is still this codebase's own invention, not a transcription — RECONSTRUCTION remains the correct tag — but it is no longer the only, or the most textually faithful, candidate mechanism available; worth a direct comparison test, not a re-tag. |
| 9 | `gannRetracementConfluence` | **Mixed: PUBLIC** (retracement) **+ GSPS-ORIGINAL** (digital-root AND) | The eighths/thirds retracement-zone piece is PUBLIC and central (A8, refined further in A9's 50%>100%>25%>12.5%>6.25%>33⅓%/66⅔% hierarchy). The digital-root/vortex confluence ANDed into the same criterion (`lib/gann/digitalRoot.ts`) is GSPS-ORIGINAL, explicitly self-labeled a hypothesis, not a literal port of anything in the 25-source catalog. |

**Coarse pre-filter** (`lib/marketScan.ts`'s `coarseReversion`/`coarseContinuation`):
Gann fan-line proximity (**PRIVATE-GANN**, same tag as `gannAngleSlope`),
volume climax (**PUBLIC**, same anchor and threshold as the full scan's
`volumeClimax` — confirmed consistent, see Part 2), and clustered S/R
proximity (**PUBLIC**, same lineage as `historicalSR`). No stale-anchor drift
found; this pre-filter already tracks the live criteria it approximates.

### Interaction with AGENTS.md's two temporary overrides

Not treated as bugs — both are deliberate, user-directed, with their own
documented revert triggers. Two observations specific to this audit's
findings:

- **The 1Hour execution-timeframe override** evaluates all nine criteria on
  the one timeframe `docs/BACKTESTING.md` has already shown inverts the
  score's meaning (Execute worst, Reject best, on a 2-year/3,631-trade
  sample). This falls hardest on exactly the criteria this pass newly
  confirms as most historically authentic: `swingChartTrend` and
  `historicalSR` are **PUBLIC** — Gann's own most-repeated, most-central
  technique — and both are being measured on a clock already shown to
  scramble the score's ranking. The override's revert trigger is unrelated
  to this finding and unchanged by it.
- **The Execute-collapse weight stopgap** pushes `gannAngleSlope`,
  `gannRetracementConfluence`, and `timePriceSquare` to `MIN_WEIGHT` while
  boosting `historicalSR` and `stopRoom`. Now that the source classification
  is sharper, this reads less like an arbitrary rebalance and more like an
  accidental alignment with the evidence: the three criteria pushed down are
  **PRIVATE-GANN**/**RECONSTRUCTION** tier (real, but never publicly
  disclosed or never disclosed at all), while the criterion pushed up
  (`historicalSR`) is **PUBLIC** — the single most-repeated technique across
  five of Gann's own books. The stopgap's own documentation already frames
  this as evidence-based, not Gann-tier-based, so this is a coincidence
  worth naming, not a hidden design principle — but it means the stopgap
  and the primary-source record currently point the same direction, not
  opposite ones.

---

## 2. Platform-wide alignment

Concepts that reach every surface they plausibly should, cited by file:

- **Old-level-crossing / support-resistance role** (**PUBLIC**, the most
  disclosed Gann concept in the whole catalog) is also the most propagated
  concept in the codebase: `lib/analysis/levelRole.ts` (role computation),
  `lib/gann/fans.ts`, `lib/gann/retracement.ts`, `lib/gann/squareOf9.ts`,
  `lib/gann/coordinateLedger.ts` (candidate levels), `lib/strat/levels.ts`
  (`nearestStructuralStop`/`computeEquityTradeLevels`, stop anchoring),
  `lib/scoring/score.ts` (`historicalSR`), `lib/scoring/proximity.ts`,
  `lib/marketScan.ts` (coarse pre-filter), `lib/backtest/replay.ts` (mirrors
  the live scorer's inputs exactly). No gap found — this is the single
  cleanest example of a concept implemented everywhere it applies.
- **`lib/gann/swingChart.ts`'s 3-Day/9-Point construction** (**PUBLIC**) is
  identically wired into both the live scorer (`lib/scoring/score.ts`) and
  the backtest replay (`lib/backtest/replay.ts`) — no drift between live and
  replay on this criterion.
- **ADX/DMI cross-platform propagation — the exact bug class AGENTS.md
  documents (harmonicProximity, and ADX/DMI itself) is now fully closed.**
  AGENTS.md's own standing example says ADX/DMI was built for
  `lib/signals/regime.ts` specifically and never reached the 9-point scorer.
  This sweep confirms that gap no longer exists: ADX/DMI now reaches (a)
  `lib/signals/regime.ts` (`classifyRegime`, original), (b) all four signal
  states — `lib/signals/states/rangeReversion.ts` calls `adx()` directly;
  `trendPullback.ts`, `trendBreakout.ts`, and `confirmedReversal.ts` all call
  `classifyRegime()`, which uses ADX internally — and (c)
  `lib/scoring/score.ts`'s `adxTrendStrength` criterion and
  `lib/backtest/replay.ts`'s identical mirror. Worth stating explicitly as a
  **resolved precedent**, not a residual issue: the platform-wide sweep this
  document was asked to perform found the canonical example already fixed.
- **`harmonicProximity`'s anchor fix** (AGENTS.md's other standing example)
  is also confirmed still holding platform-wide: `lib/marketScan.ts`'s
  coarse pre-filter explicitly tracks `volumeClimax`'s anchor convention
  (its own comment says so), not the old `harmonicProximity` one it
  replaced. No stale anchor found anywhere in this sweep.
- **`lib/backtest/propose-weights.ts` and `lib/backtest/attribution.ts`**
  both consume `CRITERION_KEYS`/breakdown keys from the single
  `lib/scoring/weights.ts`/`lib/scoring/score.ts` source rather than a
  second hardcoded list — no risk of the weight-proposal or attribution
  pipeline silently drifting from what the live scorer actually computes.
- **`lib/guided/eligibility.ts` and `lib/guided/service.ts`** gate strictly
  on `scanTicker`'s own `outputState === "Execute"` rather than re-deriving
  any Gann criterion independently — Guided Decision Mode inherits whatever
  the nine-criteria score decides with no parallel, drift-prone
  reimplementation.
- **Discipline (PUBLIC, the most-repeated layer across every book)** reaches
  `lib/guided/sizing.ts`, `lib/risk/*` (circuit breaker, cooldown, position
  limits, dynamic risk), and `lib/signals/disqualifiers.ts` — structurally
  modernized (percentage-of-account vs. Gann's dollar/point tiers) but
  present everywhere a trade gets sized or gated. `lib/risk/`'s account-level
  modules deliberately don't reference structural levels at all
  (`historicalSR`/`levelRole`) — checked, and correctly so: `lib/risk/`'s
  job is equity-curve/circuit-breaker logic, not per-trade structure, which
  is `lib/strat/levels.ts`'s job. This is the "when appropriate" carve-out
  AGENTS.md names, not a violation.

---

## 3. Platform-wide deviation

### 3a. The PRIVATE-GANN framing gap now reaches beyond `lib/gann/`

**Status (2026-09-16): both findings below are fixed on a sibling,
not-yet-merged branch** (`claude/vigilant-pasteur-e5bhk9`, commit
`1cba6e0`) — see §5's restated list for what changed. Left as originally
written here for citation purposes; verify the branch has merged before
treating either as still open.

The module-scoped audit already flagged (§4) that `lib/gann/squareOf9.ts`
and `lib/gann/fans.ts` are correct implementations of real Gann material
presented without noting it's private-course-tier, never sold to the
public. This sweep found the same framing gap in two places outside that
module's own scope:

- **`lib/signals/confluence/gann.ts`'s own exported module metadata.**
  `GANN_CONFLUENCE_MODULE.authorizedSource` literally reads: *"independently
  implemented public-domain structural coordinate techniques already in
  production use..."* — calling Square of 9, Gann angles, and time cycles
  "public-domain." They are Gann's own, genuinely — but per A2.1, disclosed
  only to paying private-course students, not the public, and their
  *copyright* status (course material from the 1930s–50s) is also not
  actually public domain the way the pre-1931 books are. This field isn't
  just a comment — it's part of `GannConfluenceResult`, which flows into
  `ScanResult.signals.gannConfluence` and crosses the API boundary (see
  3b below for where that data actually lands). This is the same
  mislabeling the module-scoped audit found, propagated one layer further
  than that audit's own scope covered.
- **`lib/guided/copy.ts`'s `nearestStructure()` function — higher severity,
  borderline a factual-accuracy bug, not just a labeling gap.** This
  function picks whichever is nearer, a Gann fan line or a Square-of-9
  level (`result.gann.fanLines[0]` / `result.gann.squareOf9[0]`), and
  generates this sentence for Guided Decision Mode users: *"...right at
  $X, **a level this symbol has repeatedly turned at**."* That specific
  phrase asserts empirically-observed historical price-reversal behavior —
  which is exactly what `historicalSR`/`levelRole` clustering actually
  measures (PUBLIC, the platform's most validated criterion) — but
  `nearestStructure()` never reads `historicalSR`/level-role data at all.
  It reads a purely geometric projection (a fan-angle line, or a Square-of-9
  spiral coordinate) that carries no requirement that price has ever
  actually touched or reversed at that level. Worse: the Square-of-9 half of
  this (`harmonicProximity`) was **retired from scoring for measuring
  negligible** (Part 1, §2 above) — meaning Guided Mode can tell a novice
  user, in plain English, that an unvalidated, scoring-retired coordinate is
  "a level this symbol has repeatedly turned at," precisely to the audience
  (Guided Mode's own stated design: "the vocabulary of someone who has
  never read the protocol") least equipped to know the difference. This
  reads as more than a documentation gap — it is presenting a specific,
  checkable factual claim that the underlying data does not support. **Not
  fixed as part of this audit, per the ground rules; flagged here for a
  decision before any change is made.**

### 3b. `lib/signals/confluence/gann.ts`'s metadata does reach the API/UI boundary — but is not currently rendered

Checking where `GannConfluenceResult` (including the "public-domain"
metadata field, 3a) actually surfaces: `components/scan/confluence-card.tsx`
renders `nearestSquareOf9`/`nearestFanLine`/`timeCycleActive` with careful,
neutral labels ("Nearest key price level," "Nearest fan line," "Structural
Coordinate Confluence," "Coordinate context and target refinement — not a
sole signal") — no mislabeling in the rendered UI itself. But the full
`GannConfluenceResult` object, `authorizedSource` field included, still
travels over `ScanResult.signals.gannConfluence` in the API response even
though the current frontend component doesn't render that specific field.
Any other API consumer (a future mobile client, an integration, a user
inspecting the network tab) would see the "public-domain" framing directly.
This is a smaller version of the redaction question `GANN_BLUEPRINT_
TRACEABILITY.md`'s §17.1 already raises for Square-of-9 explanations
generally (module audit §5 item 4) — noted here as the same open question
reaching one field further than previously scoped, not a new decision to
make in this document.

### 3c. A disclosed refinement inverted by an unaware implementation: "4th time at a level"

*45 Years in Wall Street* (A9) states a specific, numbered refinement to
old-level-crossing (PUBLIC, disclosed): the 4th test of the same
double/triple top or bottom is markedly *less* safe than the 1st–3rd — "it
nearly always goes through." `lib/analysis/pivots.ts`'s `clusterLevels`
does the opposite by construction: its own comment says *"Weight clusters by
touch count: more touches = stronger level"* — a strictly monotonic
relationship between touch count and level strength, with no point where
an additional touch flips the level from more-likely-to-hold to
more-likely-to-break. This isn't a bug in the sense of a defect nobody
intended — `clusterLevels`' monotonic weighting is a reasonable generic
choice — but it is a concrete, disclosed, numbered Gann refinement that
contradicts the platform's current implementation of the same idea, in the
single most-implemented Gann concept on the whole platform (Part 2). Named
here as a finding, not fixed: this is a testable candidate for Part 4, not
a "clearly a bug, ask before touching" item, since `clusterLevels`'
monotonic behavior was a deliberate, reasonable design choice at the time,
just one that predates knowing about A9's specific refinement.

### 3d. A disclosed concept re-invented independently, unlabeled and unconnected

`lib/strat/levels.ts`'s `EQUITY_STOP_BUFFER_PCT` (a flat 0.5% buffer added
past a structural stop for every equity trade) is functionally the same
idea as Gann's disclosed **"lost motion"** concept (A8, PUBLIC: price
typically overshoots a level by a small, bounded amount — historically 3
cents/points for stocks, 60 points for cotton — which is the explicit,
stated reason his own stops sit exactly that distance beyond a level). GSPS
arrived at a structurally similar answer (a fixed buffer past structure)
independently, with no reference to "lost motion," no citation, and a flat
percentage rather than Gann's price-scale-dependent or (per A8's second
pass) ATR/eighths-refined version. This is not a cross-platform
*propagation* gap (the concept doesn't exist elsewhere to propagate from) —
it is a case of the platform re-deriving a disclosed technique from
scratch, unaware it already has documented, book-length precedent that
could sharpen it (see Part 4, item 3).

### 3e. Minor: "Gann's flip rule" naming precision

`lib/analysis/levelRole.ts`'s header comment calls the standard
support/resistance polarity-flip principle ("the same line is resistance
while price sits below it and becomes support the moment price closes
above it") **"Gann's flip rule."** This is a defensible shorthand — it's
consistent with what A2's "Crossing Old Levels" describes (a level crossed
a second time is safer than the first, implying the level's role has
changed) — but the specific "flip" framing is also a generic, ubiquitous
technical-analysis principle with no exclusive Gann attribution in the
25-source catalog. Low severity (internal comment, not user-facing), noted
for completeness rather than as an actionable item.

### 3f. Checked and cleared: no other cross-platform gap found

Explicitly checked and found *not* to be a violation, to avoid leaving
these as open questions: `lib/lifecycle/`'s entry-confirmation state machine
(`advanceEntryConfirmation`) implements a generic break/retest/
confirmation-move sequence with no numeric buffer at all on its break
stage (a same-bar or later-bar close beyond the trigger, any amount). This
*could* incorporate the disclosed **"3-point rule"** (A5, PUBLIC: a
breakout must clear an old level by a fixed buffer before it's trusted) —
but that rule doesn't exist anywhere in GSPS yet (Part 4 confirms this),
so `lib/lifecycle/` not having it is consistent with the rest of the
platform, not a lifecycle-specific gap. Once/if the 3-point rule is built
per Part 4, `lib/lifecycle/entryConfirmation.ts`'s break stage is the
clearest candidate surface for it outside scoring — flagged there, not
here, since nothing currently exists to be inconsistently propagated.

---

## 4. What to add, platform-wide

Re-evaluating `GANN_METHOD_COMPLETENESS_AUDIT.md`'s §5 candidates (and the
two new ones its later revisions added) at full-platform scope, plus new
candidates this sweep's broader source base surfaced:

**Status note (2026-09-16) on items 1–4 below**: a sibling, not-yet-merged
branch (`claude/vigilant-pasteur-e5bhk9`, commit `1cba6e0`) has already
built all four live, ahead of the unmeasured-first sequencing these items
were originally scoped under, per that branch's own `AGENTS.md` "WD Gann
precedence" standing principle. Check whether that branch has merged
before re-building any of them; each item below is left as originally
written for citation purposes.

1. **The "Rule of Three"** (A4, PUBLIC — Gann's own highest-conviction
   claim, "traders paid me $1,000 for it"): three consecutive closes
   against the prevailing trend as a reversal signal. **Scope beyond
   scoring:** cheap to build as a *scored criterion* (`lib/gann/
   swingChart.ts` already tracks consecutive opposing closes for its
   3-day/9-day construction), but also a natural fit for
   `lib/lifecycle/entryConfirmation.ts`'s confirmation-move stage (a
   structural "held the retest" check could be phrased as a Rule-of-Three
   count) and for `lib/backtest/attribution.ts` as a new factor to measure
   independently of `swingChartTrend`.
2. **The "3-point rule"** (A5, PUBLIC): a breakout must clear an old level
   by a fixed numeric buffer (3 points/cents, or an ATR-normalized
   equivalent) before it's trusted. **Scope beyond scoring:** this is the
   single clearest candidate for `lib/lifecycle/entryConfirmation.ts`'s
   `break_or_sweep_detected` stage (Part 3f), which currently accepts any
   close beyond the trigger with no buffer at all — a stricter,
   threshold-based variant of `historicalSR`, not a replacement for it.
3. **The "lost motion" stop-buffer concept** (A8, PUBLIC): not a new scored
   criterion, but a candidate improvement to `lib/strat/levels.ts`'s
   `EQUITY_STOP_BUFFER_PCT` (Part 3d) — his stated reasoning (price
   overshoots a level by a bounded, typically-small amount, refined in
   A8's second pass into 5/8 and 3/8-point sub-rules) is directly testable
   against GSPS's own stop-hit data, and could replace a flat 0.5% with
   something price-scale- or ATR-aware, the same normalization principle
   `lib/scoring/proximity.ts` already applies elsewhere on the platform.
4. **The fixed annual calendar cycle** (A4, PUBLIC: a short, explicit list
   of recurring dates — early Feb/Mar/May/Jun/Aug/Sep/Nov/Dec windows —
   independent of any per-symbol anchor). **Scope beyond scoring:** the
   cheapest of these candidates to test (no pivot detection needed, just a
   date lookup), and a plausible fit for `lib/guided/eligibility.ts` (a
   "seasonal window" context flag, informational only, same treatment
   `lib/universe/`'s `novice_eligible` field got — informational, not
   gating, until measured) as well as scoring.
5. **A refined percentage-resistance hierarchy** (A9, PUBLIC: 50% > 100% >
   25% > 12.5% > 6.25% > 33⅓%/66⅔%, sharper than A8's flatter
   eighths/thirds treatment) and **"Anniversary Dates"** (A9, PUBLIC: a
   pivot's own month/day watched every subsequent year) — both cheap to
   test against existing pivot-detection code, both currently scoped only
   to `lib/scoring/` candidates in the module audit; also relevant to
   `lib/backtest/attribution.ts` (a natural per-level-importance weighting
   to test) and to `lib/gann/timeCycles.ts` (Anniversary Dates is a
   near-literal extension of what that module already does for fixed
   wheel counts).
6. **"4th time at a level" invalidation** (A9, PUBLIC, new in this sweep —
   Part 3c): `clusterLevels`' monotonic touch-count weighting could be
   tested against a non-monotonic version that treats a 4th touch as a
   *break* signal rather than a *hold* signal, per Gann's own stated rule.
   Platform-wide because `clusterLevels` feeds `historicalSR`,
   `lib/strat/levels.ts`'s stop anchoring, and the coarse pre-filter
   simultaneously — the single highest-leverage place on the whole
   platform to test a Gann refinement, since it's the most propagated
   concept in the codebase (Part 2).
7. **Gann angles as a *time* projection, not just price slope** (B10,
   secondary, weight below the six PUBLIC items above): each angle mapped
   to a percentage of a swing's elapsed time (1×1=100%, 1×8=12.5%, etc.),
   projecting *when* a price target should be reached, not just what price
   it implies. `lib/gann/fans.ts`/`gannAngleSlope` only use angles for
   price slope today; this would be new code, and — per this audit's
   corrected tagging — still PRIVATE-GANN/RECONSTRUCTION-adjacent territory
   (not found in the retrieved ~100 pages of A2.1 itself), so the same
   "label it honestly" requirement applies as to Square of 9/angles
   generally.
8. **Master Square of Twelve/144, the Hexagon Chart, and two more newly-
   catalogued constructions — promoted from research-todo to build
   candidate, 2026-09-16.** A2.1's remaining chapters are now read (item 11
   below, done), so the caveat that previously blocked this item no longer
   applies. Four private-course constructions, all **PRIVATE-GANN**, all
   with **zero code presence anywhere in `lib/gann/`**:
   - **Square of 144 (Master Twelve)**, fully specified: not just a second
     geometric framework alongside the Square of Nine, but literally nested
     inside it (144 = nine full spiral cycles of the 81-number Square of
     Nine), with its own explicit "Master Numbers" (3, 5, 7, 9, 12)
     numerology and a full fractional structure worked against a real
     wheat-commodity example.
   - **The Hexagon Chart**, fully specified: a hexagonal (not square-root)
     spiral, cross-validated by Gann himself against the Square of Nine and
     Master Twelve in the same passage — a primary-source precedent for
     `lib/signals/confluence/gann.ts`'s multi-coordinate design specifically,
     making this the highest-priority of the four for Layer 4/Confluence
     purposes, not just a fourth isolated coordinate.
   - **Square of 20 (NYSE Permanent Chart)** and **Square of 52** (weekly
     time-period calculator) — two constructions newly catalogued this
     session, not previously known to exist as distinct systems.
   All four need the same unmeasured → attribution → in/out-of-sample
   discipline as any other candidate before touching a live verdict; `git
   log`/`lib/gann/` confirms none have landed on any branch as of this
   writing.
9. **Evaluate Fourier/dominant-cycle decomposition** (A3, PUBLIC —
   Gann names "cycle theory, or harmonic analysis" directly in his own
   voice; B1 demonstrates it correctly) as a new candidate criterion — the
   best-evidenced reconstruction of the withheld timing mechanism, and
   still nothing in this codebase does it. Per the module audit, this
   needs the full unmeasured → attribution → in/out-of-sample process,
   not a swap-in.
10. **Dewey's cycle-validation checklist** (C6, non-Gann general
    cycle-theory methodology, newly surfaced this session): dominance,
    regularity, repetition count, constancy, phase-resumption,
    cross-series synchrony. Not a Gann technique and not a scored
    criterion candidate — but a genuinely rigorous, citable standard for
    validating *any* cyclical claim (Gann's or GSPS's own), directly
    relevant to `lib/validation/criteria-registry.ts`'s existing discipline
    around quarantining unproven criteria. Worth citing there if a future
    cycle-based criterion is ever proposed, as an external check against
    exactly the kind of "144 always reduces to 9" false-pattern trap
    `GANN_HISTORICAL_SOURCES.md` B2 already flagged once.
11. ~~Finish reading A2.1~~ (module audit §5 item 12, restated at platform
    scope) — **done, 2026-09-16**: Chapters 7, 13, 14, and 15B are now
    read. Surfaces items 12–13 below. `timePriceSquare` (Part 1, #8) is
    still fairly tagged RECONSTRUCTION for what GSPS actually built, but no
    longer the only literal price/time-squaring mechanism on file — see
    that table entry's revised note.
12. **New: `lib/gann/masterTimeFactor.ts`** (A2.1 Ch. 7, PRIVATE-GANN) —
    the full 60/50/30/20/15/10/7/5/3/2/1-year cycle hierarchy with eight
    numbered forecasting rules, plus the 36 angle-derived month-count
    system demonstrated against a complete worked 1896–1935 DJIA case
    study. **Scope beyond scoring**: this is the fullest disclosed
    statement of Layer 3's withheld-mechanism shell in the whole catalog —
    date/angle arithmetic against known pivots, no new statistical
    machinery, comparably cheap to item 4's annual calendar cycle. Should
    supersede, not sit beside, `lib/gann/timeCycles.ts`'s existing narrower
    45/90/120/180/270/360-day wheel once built; also a natural input to
    `lib/backtest/attribution.ts` as a factor independent of
    `timePriceSquare`.
13. **New: `lib/gann/decadeDigitCycle.ts`** (A2.1 Ch. 7, PRIVATE-GANN,
    reclassified this session) — the bull/bear decade-digit cycle,
    upgraded from the unverifiable secondary source B9 to Gann's own
    private-course voice. The source-tier upgrade doesn't reduce the
    validation bar (item 10's Dewey checklist still applies in full before
    trusting it as more than a hypothesis), but it does mean the technique
    now qualifies for the same "citably Gann's own, build it live" standing
    that items 1–4 above already received — comparably cheap to build (a
    calendar-year-digit lookup, no pivot detection needed).

---

## 5. What to remove

The removal bar, restated: **absence from Gann's public books is not
sufficient grounds by itself.** Square of 9 and Gann angles are now
confirmed PRIVATE-GANN — real, disclosed by Gann himself, just never sold
publicly — not myths, and not later-researcher inventions. Nothing in this
audit recommends deleting either technique's working implementation
(`lib/gann/squareOf9.ts`, `lib/gann/fans.ts`) or its confluence-layer
usage. The bar is **misrepresentation/mislabeling of provenance**, not
reconstruction status, and — per this session's reclassification — not
private-course status either.

Two concrete mislabeling items, both already named in Part 3, restated
here as the "what to fix" list (findings, not changes made — no code or
copy was edited as part of this audit). **Status update (2026-09-16): both
have since been fixed on a sibling, not-yet-merged branch**
(`claude/vigilant-pasteur-e5bhk9`, commit `1cba6e0`) — `authorizedSource`
no longer calls Square of 9/angles "public-domain," and `nearestStructure()`
now reads swing-clustered levels first, falling back to Gann-geometry
coordinates with non-historical-claim wording only when no clustered level
exists. Check whether that branch has merged before treating either as
still open:

1. **`lib/signals/confluence/gann.ts`'s `GANN_CONFLUENCE_MODULE.authorizedSource`
   string** calls Square of 9/Gann angles/time cycles "public-domain
   structural coordinate techniques." Recommend re-wording to reflect the
   corrected provenance (Gann's own private-course material, not
   public-domain publication) the next time this module is touched for any
   other reason — this field does cross the API boundary (Part 3b), so it
   is not purely internal.
2. **`lib/guided/copy.ts`'s `nearestStructure()`** presents an unvalidated
   Square-of-9/fan-line coordinate to novice users as "a level this symbol
   has repeatedly turned at" — a specific factual claim about historical
   behavior that the underlying data (a geometric projection, not a
   clustered touch history) does not support, compounded by the fact that
   the Square-of-9 half of this was already retired from scoring for
   measuring negligible. **This is flagged as the highest-severity finding
   in this entire audit** — closer to a correctness defect in user-facing
   copy than a documentation gap — and is explicitly not fixed here per
   the ground rules. Recommend a deliberate decision (have `nearestStructure`
   read `historicalSR`/level-role data instead, or soften the language to
   not assert historical repetition) before the next Guided Mode copy
   change of any kind.

No other removal candidates were found. `lib/gann/digitalRoot.ts`'s
Digital Root/Vortex engine, `lib/gann/timeCycles.ts`'s reconstructed timing
shell, and every other RECONSTRUCTION/GSPS-ORIGINAL item in Part 1's table
are already labeled as hypotheses or generic techniques, not misrepresented
as Gann's disclosed method — no mislabeling found there.
