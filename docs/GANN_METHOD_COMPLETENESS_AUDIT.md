# Gann method completeness audit (2026-09-15)

Answers five questions the project owner asked directly, after five source
documents were reviewed (`docs/GANN_HISTORICAL_SOURCES.md`) against the
live codebase: what the method actually is, where GSPS implements it,
where GSPS's own logic works against it, where GSPS deviates from the
historical sources, and what a complete implementation still needs. Framed
against the ROADMAP.md Q1 goal "an accurate signal engine with explainable
logic and tuned scoring" (line ~64) — in-phase, not a deviation, per the
same citation `PROPOSAL_NEW_GANN_CRITERIA.md` already uses.

This is an audit, cross-referencing existing docs
(`GANN_BLUEPRINT_TRACEABILITY.md`, `GANN_SARA_CONFLUENCE.md`,
`PROPOSAL_NEW_GANN_CRITERIA.md`, `GANN_BLUEPRINT_BACKTEST_BIAS_AUDIT.md`,
`BACKTESTING.md`) and the current `lib/gann/`, `lib/scoring/`,
`lib/signals/confluence/` source — not a new implementation pass.

**Update (same day, after reading all ten of Gann's own books):** the
original version of this audit was written from five sources — the 1909
interview, the 1923 book, and three secondary/interpretive works. Every
one of Gann's ten books has since been read (nine in full or
substantially; *45 Years in Wall Street* was still being processed as of
this revision — see `GANN_HISTORICAL_SOURCES.md` A9). Two findings from
that pass change the picture enough to call out here before the
section-by-section detail:

1. **Square of 9 and Gann angles do not appear in any of Gann's disclosed
   books through 1941** — not in *Truth of the Stock Tape*, *Wall Street
   Stock Selector*, *New Stock Trend Detector*, *How to Make Profits
   Trading in Puts and Calls*, or the readable portion of *How to Make
   Profits Trading in Commodities*. Meanwhile, old-level-crossing/
   resistance-level logic — the ancestor of `historicalSR` — is the single
   most repeated, most concretely operationalized technique across every
   one of those books, right down to specific stop-placement math. That
   lines up exactly with GSPS's own backtest evidence: `historicalSR` is
   the most consistently positive criterion in the registry, while
   `harmonicProximity` (Square of 9) was retired for measuring negligible.
   See the new table row in §2 and the expanded §4.
2. **Several concrete, disclosed Gann rules with real numeric thresholds
   are not implemented in GSPS at all** — not reconstructions, not
   hypotheses, but literal rules from his own books with no code
   equivalent today: the "Rule of Three" (three consecutive closes against
   a trend signal reversal), the "3-point rule" (a breakout must clear an
   old level by 3 full points/cents before it's trusted), the "lost
   motion" stop-buffer concept, and a fixed annual calendar cycle of
   specific dates called out as a "permanent cycle." These are new,
   concrete candidates for §5, distinct from the three quarantined
   criteria this codebase has already tried and measured.

## 1. The Gann method, in plain English

Strip away the mystique and the disclosed material (1909, 1923) describes
a **discipline system first, a geometry system second, and a timing system
that was never actually disclosed.**

**Layer 1 — Discipline (fully disclosed, the majority of the actual
content).** Trade small enough to survive being wrong five times in a row.
Always use a hard stop, never more than a few points/percent of risk per
trade. Never avoid a loss by adding to a losing position ("averaging").
Once ahead, move the stop to breakeven — you should never let a real gain
round-trip to a loss. Add to *winning* positions, never losing ones. Trade
both directions with no bias — a bear market is exactly as tradeable as a
bull market. Never fix a profit target in your head and hold past a trend
change hoping to reach it.

**Layer 2 — Structure (price geometry).** From a real, confirmed swing
high or low, a handful of arithmetic rules generate specific candidate
price levels where the market is more likely to pause, reverse, or
accelerate — and it's worth being precise about which of these he
actually published versus which are later reconstructions. What he
*actually* discloses, repeatedly and with worked numeric examples across
five of his own books: **old-level crossing** (a level that held multiple
times, then finally breaks by a specific buffer — 3 cents/points in his
own stated rule, justified by a "lost motion" concept that price
typically overshoots a level by less than that but rarely more — tends to
keep going, and is safer to trade the *second* time it's tested than the
first); the **"Rule of Three"** (a stock in a confirmed uptrend won't
close three consecutive days lower without signaling at least a temporary
reversal, and the mirror for downtrends); the **eighths/thirds
resistance-level method** (divide a swing's range by 8 and by 3; the 50%
midpoint is the single most significant level, then 75%); and **"sections
of a campaign"** (a bull or bear move typically runs 3–4 legs, with the
later legs weighted more heavily for trend-change confirmation). What is
*not* in any of his ten books through at least 1941: the **Square of 9**
(prices mapped onto a square-root spiral) and **Gann angles** (fixed
price-per-time-unit lines like 1×1, 2×1) — both are absent from every
disclosed book checked for this audit. They are real techniques from his
own later, unpublished course material and private letters — confirmed
directly, not just via a modern researcher's decoding, once his actual
private course text and a signed 1954 astrology letter were read (see
`GANN_HISTORICAL_SOURCES.md` A12, A14; B5's earlier decoding is
corroborated, not superseded) — not something he ever sold to the general
public in book form.

**Layer 3 — Timing (the part Gann kept secret in every one of his ten
books).** Gann insisted price and time are symmetric — a move is "square"
when the number of bars elapsed matches the size of the price move — and
that specific dates (not just prices) are where trend changes cluster. He
states this refusal outright and explicitly in at least three separate
books spanning 1909 to 1927, including one all-capitalized sentence in
his 1927 novel refusing to explain "the cause of cycles." What he *does*
disclose, short of the mechanism itself: a **fixed annual calendar
cycle** of specific recurring dates he calls "a permanent cycle which
does not change" (independent of anniversary-of-a-pivot timing); using a
stock or company's own founding-date anniversary as a timing trigger; and
comparing the elapsed time of a rally/reaction against the largest/
longest prior rally or reaction in the same campaign as a trend-change
signal. None of this is the withheld mechanism itself — it's the outer
shell of a timing system whose actual engine he never published.
Everything written about "the time factor" since — including in this
codebase — is reconstruction, not transcription.

**Layer 4 — Confluence.** No single layer is trusted alone. A price
sitting at a Square-of-9 level *and* an old resistance level *and* a
retracement zone, with a trend-confirming angle underneath it, is a much
stronger signal than any one of those alone. This is the organizing idea
behind nearly everything else in the method: don't act on one coordinate,
act where several agree.

**Layer 5 — "Vibration" (the least defined layer, and the one every
secondary source disagrees about).** Gann's headline 1909 claim was that
each instrument has its own individual "rate of vibration," borrowed
explicitly from the physics vocabulary of his era (wireless telegraphy).
He never gives a formula for it in either primary document. Later
researchers and practitioners have filled that gap three incompatible
ways, each with different evidentiary weight: **digit-based numerology**
(reducing numbers to 1–9, weakest evidence — much of it is an artifact of
base-10 arithmetic, not a market discovery); **Fourier/spectral cycle
analysis** (decomposing a price series into its dominant periodic cycles —
the best-evidenced reconstruction, backed by a real 1926 Gann letter
naming Moore, Schuster, and Fourier by name); and **astrology**
(planetary-cycle timing — confirmed as something Gann genuinely used, by
the company holding his actual working papers, but never disclosed in
either primary text).

**Layer 6 — Tape reading.** Underneath all of the above, the 1923 book is
explicit that the tape itself — real order flow, volume, how a level
actually behaves when tested — is the final arbiter. Geometry proposes
candidate levels; the tape (and, in Gann's framing, volume climax at a
turning point) confirms or denies them.

## 2. Where GSPS currently implements the method

| Layer | Technique | Where | Status |
|---|---|---|---|
| Discipline | Stops, no averaging, pyramid winners, dual-direction trading | `lib/guided/sizing.ts`, `lib/risk/*`, `lib/signals/disqualifiers.ts` | **Implemented**, structurally modernized (see §4) |
| Structure | Square of 9 | `lib/gann/squareOf9.ts` | Implemented algorithmically; **not scored** (see §3) |
| Structure | Gann angles (1×1…4×1) | `lib/gann/fans.ts`, `lib/gann/normalizedSlope.ts` | Implemented and **scored** — `gannAngleSlope` criterion |
| Structure | Percentage retracement (eighths) | `lib/gann/retracement.ts` | Implemented and **scored**, inside `gannRetracementConfluence` |
| Structure | Old-level crossing / historical S/R | `lib/analysis/levelRole.ts` + scoring | Implemented and **scored** — `historicalSR`, the most consistently positive-evidence criterion in the registry |
| Timing (reconstructed) | Fixed wheel counts (45/90/120/180/270/360 days) + anniversaries | `lib/gann/timeCycles.ts` | Implemented; **context/display only**, not scored (superseded in scoring by `timePriceSquare`) |
| Timing (reconstructed) | Price/time squaring (bars-since-anchor vs. ATR-normalized move) | `lib/gann/timePriceSquare.ts` | Implemented and **scored** — `timePriceSquare` criterion |
| Confluence | Multi-coordinate agreement | `lib/signals/confluence/gann.ts` (`GannConfluenceResult`) | Implemented — display/audit only, never gates a trade (by design, see `GANN_SARA_CONFLUENCE.md`) |
| "Vibration" (numerology reconstruction) | Digital root / Vortex classification | `lib/gann/digitalRoot.ts` | Implemented as GSPS's own explicit **hypothesis**; confluence-only, ANDed inside `gannRetracementConfluence` |
| "Vibration" (Fourier reconstruction) | Spectral/dominant-cycle decomposition | — | **Not implemented anywhere** |
| "Vibration" (astrology) | Planetary ephemeris timing | — | **Not implemented anywhere**, by explicit policy (see `GANN_SARA_CONFLUENCE.md`'s "no numerology without an authorized spec" rule, extended in practice to astrology) |
| Tape reading | Volume climax at anchor pivot | `lib/gann/volumeClimax.ts` | Implemented and **scored** — replaced the retired `harmonicProximity` |
| Tape reading | Pattern recognition (Sara Sniper Strat, not Gann per se) | `lib/strat/patterns.ts`, `lib/signals/confluence/sara.ts` | Implemented and scored — `patternArmed` |

**Today's live nine scored criteria** (`lib/scoring/weights.ts`
`CRITERION_KEYS`): `swingChartTrend`, `adxTrendStrength`, `gannAngleSlope`,
`volumeClimax`, `historicalSR`, `patternArmed`, `stopRoom`,
`timePriceSquare`, `gannRetracementConfluence`. Of these nine, four are
directly, literally Gann structural techniques (`gannAngleSlope`,
`timePriceSquare`, `gannRetracementConfluence`, and `volumeClimax` per the
1923 book's climax-at-the-turn rule); `historicalSR` is Gann's crossing-old-
levels principle under a generic name; `swingChartTrend` is a near-literal
port of Gann's own 3-Day Chart and 9-Point Swing Chart methods from his
1949 capstone book *45 Years in Wall Street* (`lib/gann/swingChart.ts`) —
one of the closest 1:1 matches between any GSPS module and something Gann
explicitly, directly taught his subscribers;
`adxTrendStrength` and `stopRoom` are general technical-analysis/risk
criteria, not Gann-specific; `patternArmed` is Sara Sniper Strat, an
authorized but separate framework, not Gann.

Worth stating plainly: the evidentiary ranking inside this codebase's own
backtests now matches the evidentiary ranking across Gann's own published
books. `historicalSR` — old-level crossing — is both the single most
repeated, most concretely worked-example-backed technique across five of
his ten books, and the most consistently positive-evidence criterion
GSPS has measured. `harmonicProximity` (Square of 9) — a technique absent
from every one of those same books — was retired from scoring for
measuring negligible. That is not proof the geometry is wrong (it may
simply need a different implementation, a different anchor, or more
data), but it is a real convergence between what Gann actually taught
paying subscribers and what this codebase's live data says works.

## 3. Where GSPS's own logic conflicts with or hinders the Gann method

Four concrete conflicts, ranked by how directly they suppress a Gann
signal from ever reaching a live verdict:

**(a) `EXECUTION_TIMEFRAME` forced to 1Hour vs. the method's own measured
performance.** `docs/BACKTESTING.md` (§"the verdict ladder has not held up
out of sample") shows the *exact same scoring logic* inverted on 1Hour: on
a 2-year, 3,631-trade 1Hour sample, Execute is the **worst** bucket and
Reject among the best — the opposite of what the score is supposed to
mean. The 1Hour override (`lib/timeframe.ts`, `AGENTS.md`'s "Temporary
overrides") exists for an unrelated, legitimate reason (data-lag on the
free feed), but its side effect is that every Gann criterion in §2 is
currently being evaluated on the one timeframe already shown to invert
their meaning. This is the single largest active conflict: not a bug in
any Gann technique, but running all of them on a clock where their
combined output has been measured to mean the opposite of what it's
supposed to.

**(b) The hand-set weight stopgap systematically down-weights the most
literally Gann-specific criteria.** `DEFAULT_CRITERION_WEIGHTS`
(`lib/scoring/weights.ts`) pushes `gannAngleSlope`,
`gannRetracementConfluence`, and `timePriceSquare` — three of the four most
literal Gann-geometry criteria — to `MIN_WEIGHT` (0.5, the floor), while
`historicalSR` and `stopRoom` (general technique, not Gann-specific) sit
near the ceiling. This was a documented, reasoned stopgap off one
committed run under an independence approximation, not the two-way
in/out-of-sample process this codebase's own discipline requires
(`lib/backtest/propose-weights.ts`) — see AGENTS.md's mandatory revert
trigger. Until that proper run exists, the live score is structurally
weighted *against* Gann's specific geometric contributions relative to
generic S/R and risk criteria, on thin evidence.

**(c) Square of 9 — the technique with the clearest historical/geometric
evidence of all five (the "D Levels" table decodes to it exactly) — has
zero influence on any live verdict.** `harmonicProximity` (the Square-of-9
proximity criterion) was retired from scoring entirely on 2026-09-10,
replaced by `volumeClimax`, after measuring negligible even post-anchor-fix.
`squareOf9.ts` still runs inside the Gann Confluence Layer, but that
module never gates a trade by design, and per the §17.1 checklist in
`GANN_BLUEPRINT_TRACEABILITY.md`, the nearest-S9-level explanation is
"built but not surfaced to the user" — so today, Square of 9 neither
scores a trade nor is shown to the person the confluence card is meant to
inform. This may be the right call (the evidence says it didn't help), but
it means the single most recognizable "Gann" technique is currently inert
end-to-end.

**(d) The Digital Root/Vortex engine — Gann's own 1909 headline claim
("Law of Vibration") — has the least possible influence on any real
outcome, by explicit design.** It can never independently pass or fail a
criterion (blueprint §7.4's safety rule, enforced in code); its one
scoring touchpoint is ANDed inside `gannRetracementConfluence`, itself one
of the three criteria currently sitting at `MIN_WEIGHT` per (b). This is
not a bug — it's the correct, deliberately conservative treatment of an
unproven hypothesis — but it does mean the concept Gann led with in 1909
is, today, the least consequential thing in the entire stack.

## 4. Where GSPS deviates from the historical Gann method

Deviation is not automatically a defect — several of these are defensible
modernizations. Named here so they're explicit rather than assumed:

- **Astrology is entirely absent**, despite real evidence (the WD Gann
  Inc. blog's description of his annotated private ephemeris, and a
  modern researcher's detailed decoding of planetary-longitude references
  in his 1948 soybean chart and 1954 personal letters — see
  `GANN_HISTORICAL_SOURCES.md` B5) that Gann genuinely used planetary
  timing, and his 1927 novel discusses it openly and at length. Every one
  of his *published* books, checked directly and including both of his
  last two (1949, 1954), is completely silent on it — no planets, no
  zodiac, no "vibration." The best-fitting explanation across all ten
  books: a stable public/private split held for his entire 45-year
  career, not a late-career shift either toward or away from openness —
  he disclosed risk management and tape-reading freely in print and
  reserved astrology (like the rest of "the time factor") for private
  client correspondence and paid courses, consistently, start to finish.
  Excluding astrology is very likely the right call for a retail
  platform, but it is a real, deliberate deviation from a technique the
  primary evidence says he actually relied on — a product/brand decision,
  not something this audit resolves on its own.
- **Square of 9 and Gann angles are implemented as if they were his
  disclosed method, when they were not.** GSPS's `lib/gann/squareOf9.ts`
  and `lib/gann/fans.ts` are correct, working implementations of real
  techniques — but techniques that, per the source review, never appear
  in any book Gann sold to the general public through at least 1941. They
  surface only in later course material, private letters, and modern
  researchers' reconstructions. This isn't a defect (the geometry is
  real, and GSPS is honest elsewhere that `gannAngleSlope` is
  "unmeasured"/weighted at the floor), but the *framing* — that these are
  "the" Gann technique — inverts the actual weight of evidence in his own
  published writing, where old-level-crossing and resistance-level
  arithmetic dominate overwhelmingly instead.
- **The "time factor" is reconstructed three different ways across the
  five sources (fixed wheel counts, price/time squaring, Fourier cycles),
  and GSPS implements two of the three (`timeCycles.ts`,
  `timePriceSquare.ts`) — neither of which is what either primary text
  actually discloses**, since both explicitly withhold it. The
  best-evidenced reconstruction (Fourier/spectral, per the 1926 letter) is
  the one GSPS does not implement at all.
- **Digital Root/Vortex's specific formula, polarity-pair table, and
  three-way classification (`VORTEX_FLOW`/`POLARITY_AXIS`/
  `COMPLETION_NODE`) are a GSPS-authored hypothesis**, not a literal port
  of anything in these five sources — the blueprint that specifies it says
  so itself ("a GSPS hypothesis, not a proven causal law").
- **Money management is philosophically aligned but structurally
  different**: Gann's 1923 rules size risk in fixed dollar/point tiers by
  share-price bracket; GSPS uses a percentage-of-account, multi-ceiling
  model (`lib/guided/sizing.ts`). Reasonable modernization for a
  multi-instrument, multi-account platform Gann never had to design for.
- **Name/letter/election numerology (Source 5A) and magic-square/
  Pythagorean speculation (Awodele's closing chapters) are correctly not
  implemented** — out of scope for a trading platform, and, in the magic-
  square case, openly speculative even in its own source.
- **Material Number vs. Harmonic Node classification stays
  `notImplemented`**, correctly, per the "no new numerology without an
  authorized specification" rule (`GANN_SARA_CONFLUENCE.md`) — the one
  place the codebase's discipline about not inventing Gann lore is most
  directly visible.

## 5. What's still needed for a complete Gann method in GSPS

All in-phase under Q1's "accurate signal engine with explainable logic and
tuned scoring," except where flagged otherwise.

1. **Replace the hand-set weight stopgap with a real proposal.** Run
   `lib/backtest/propose-weights.ts`'s proper chronological in/out-of-
   sample split against a fresh, larger committed run (n≥30 Execute
   bucket) — the exact mandatory revert trigger already on file in
   `PROPOSAL_NEW_GANN_CRITERIA.md`'s validation discipline section. This
   is the single highest-leverage fix, since it directly addresses §3(b).
2. **Resolve the 15Min/1Hour inversion**, per `docs/BACKTESTING.md`'s own
   named next step: a recent-window 1Hour run to separate a timeframe
   effect from a regime effect. This determines whether §3(a) is fixable
   by timeframe choice or is a deeper regime confound — and gates the
   `EXECUTION_TIMEFRAME` revert once real-time data lands (AGENTS.md's
   mandatory reminder).
3. **Make a deliberate decision on Square of 9's fate** rather than
   leaving it inert: either measure a fixed, role-aware S9-proximity
   criterion fresh (post-anchor-fix, never independently re-tested as its
   own criterion since being folded into the harmonicProximity retirement)
   or explicitly document that confluence-only display is the intended
   final state.
4. **Resolve the §17.1 architectural tension** (`GANN_BLUEPRINT_
   TRACEABILITY.md`): decide whether any part of the Square-of-9/angle/
   digital-root explanation should reach the user, given it currently
   computes server-side and is redacted at the API boundary. A product/IP
   decision, not a code fix.
5. **Evaluate Fourier/dominant-cycle decomposition as a new candidate
   criterion** — the best-evidenced reconstruction of Gann's actual
   "vibration"/time-factor basis (per the 1926 letter), and something
   nothing in this codebase does today. New code, so it needs the full
   unmeasured → attribution → in/out-of-sample process
   `PROPOSAL_NEW_GANN_CRITERIA.md` already lays out for any new criterion
   — not a swap-in.
6. **Persist a prior Digital Root reading** so `classifyRootTransition`'s
   `VORTEX_FLOW_TRANSITION`/`ONE_RENEWAL_TRANSITION` types can ever fire —
   currently dead code paths (blueprint's `digital_root_feature` table,
   named as Milestone 3 in the traceability matrix, not yet built).
7. **Close the validation gaps that specifically block promoting any Gann
   criterion from hypothesis to validated**: permutation tests for root
   labels (`GANN_BLUEPRINT_BACKTEST_BIAS_AUDIT.md` names this as
   "directly relevant to the... Digital Root/Vortex work"), multiple-
   testing correction across the nine-criteria family, confidence
   intervals around each `deltaExpectancyR`. Statistical-methodology work,
   already scoped as its own initiative in the bias audit — not something
   to bolt on inside a scoring PR.
8. **Out-of-phase, flag rather than build: whether astrology has any place
   in GSPS at all.** Real historical evidence says Gann used it; GSPS
   policy currently excludes it entirely. This is a brand/product/
   liability decision for the project owner, not a technical gap — named
   here so it's a conscious choice rather than a silent omission.
9. **New candidate criteria worth evaluating — literal Gann rules with no
   code equivalent today**, distinct from `harmonicProximity`/`macroTrend`/
   `timeCycle` (already tried, already quarantined) and distinct from
   `gannAngleSlope`/Square of 9 (real techniques, just not disclosed ones —
   see §4). All four need the same unmeasured → attribution →
   in/out-of-sample discipline `PROPOSAL_NEW_GANN_CRITERIA.md` lays out
   before touching `CRITERION_KEYS`:
   - The **"Rule of Three"** (`Wall Street Stock Selector`, 1930): three
     consecutive closes against the prevailing trend as a reversal
     signal. Cheap to build (`lib/gann/swingChart.ts` already tracks
     consecutive opposing closes for its 3-day/9-day construction — this
     is a narrower, more literal version of the same idea) and
     historically Gann's own highest-conviction claim ("traders paid me
     $1,000 for this rule").
   - The **"3-point rule"** (`New Stock Trend Detector`, 1936): a
     breakout must clear an old level by a fixed numeric buffer (3
     points/cents, or an ATR-normalized equivalent) before it's trusted —
     a stricter, threshold-based variant of `historicalSR` rather than a
     replacement for it.
   - The **"lost motion" stop-placement concept** (`How to Make Profits
     Trading in Commodities`): not a new scored criterion, but a
     candidate improvement to how `stopRoom`/trade-plan stop distances
     are chosen — his stated reasoning (price overshoots a level by a
     bounded, typically-small amount) is directly testable against
     GSPS's own stop-hit data.
   - The **fixed annual calendar cycle** (`Wall Street Stock Selector`):
     a short, explicit list of recurring dates, independent of any
     per-symbol anchor — the cheapest of the four to test since it needs
     no pivot detection, just a date lookup.
10. ~~Fold in *45 Years in Wall Street*~~ — **done**, see
    `GANN_HISTORICAL_SOURCES.md` A9. It resolved the astrology question in
    §4 (public/private split, not late-career openness) and confirmed
    `swingChartTrend` as one of the closest literal ports of a disclosed
    Gann technique anywhere in this codebase. It also surfaced two more
    candidates for #9's list: a refined percentage-resistance hierarchy
    (50% > 100% > 25% > 12.5% > 6.25% > 33⅓%/66⅔%, sharper than A8's
    looser eighths/thirds) and "Anniversary Dates" (a pivot's own
    month/day watched every subsequent year) — both cheap to test against
    existing pivot-detection code.
