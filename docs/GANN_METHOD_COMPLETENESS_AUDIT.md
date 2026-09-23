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

**Second update (same day, after new private-course material was found):**
finding #1 above needs one correction, not a reversal. `GANN_HISTORICAL_SOURCES.md`
now includes A2.1, a 2004 transcription of Gann's own private paid
correspondence course (distinct from his ten *public* books), read
directly in his own first-person voice, containing a dedicated Square of
Nine construction chapter and a named, defined Gann-angle system (1×1
through 8×1+). **Square of 9 and Gann angles are not later researchers'
inventions retroactively credited to Gann — he taught both himself, to
paying students.** What finding #1 got right and still holds: neither
technique appears in anything he sold at a bookstore, across ten books
and forty-five years, while old-level-crossing/resistance logic appears
repeatedly in exactly those public books. The corrected framing
throughout this document is: **disclosed, but only to paying private
students — never disclosed to the public** — not "undisclosed" or "a
later reconstruction." This changes the wording in §1 Layer 2/Layer 5
and §4 below, not the underlying implementation conclusions (Square of
9 is still unscored, for the same backtest-evidence reasons).

**Third update (2026-09-16, after the Master Time Factor gap closed):**
the project owner supplied a much fuller text extraction of A2.1, closing
this document's own §5 item 12 ("Finish reading A2.1's private course
material") — Chapters 7, 13, 14, and 15B are now read, versus only the
first ~100 of ~460 pages before. Full detail and citations live in
`GANN_HISTORICAL_SOURCES.md`'s A2.1 entry; this document's §1 Layer 3
section, §4's third deviation, and §5's item list are revised below to
match. Headline changes: (1) Layer 3's "withheld mechanism" now has a
complete worked numerical example (a 1896–1935 DJIA case study against 36
angle-derived month-counts) rather than only the outer-shell fragments
this document previously described — the withholding finding itself is
unchanged, but the shell around it is far thicker; (2) the "decade digit"
bull/bear cycle, previously sourced only to the unverifiable secondary
source B9, is now confirmed in Gann's own private-course voice; (3) three
new private-course geometric constructions (Square of 144 fully specified,
Square of 20, Square of 52) and a fully-specified Hexagon Chart join
Square of 9/Gann angles as **real, citable, entirely unbuilt** candidates —
zero code presence anywhere in `lib/gann/`. None of this changes this
document's central empirical finding (§2): `historicalSR` — the most
publicly disclosed technique — remains the most consistently
positive-evidence criterion, while Square of 9 remains retired from
scoring for measuring negligible, irrespective of how much more of the
private course has now been read.

**Also note (2026-09-16, updated): merged to `main` as #228.** The
sibling branch (`claude/vigilant-pasteur-e5bhk9`, commit `1cba6e0`) built
four of this document's own §5 item 9 candidates — the Rule of Three, the
3-point rule (as a buffer in `lib/lifecycle/entryConfirmation.ts`), a
resistance-point clustering refinement in `lib/strat/levels.ts`, and the
A4-level fixed annual calendar cycle in `lib/gann/timeCycles.ts` — plus the
two mislabeling fixes this document's §4 doesn't itself flag but
`GANN_PLATFORM_AUDIT.md`'s §3a does. That work is not reflected in this
document's tables below, which still describe the pre-#228 state; those
specific §5 items are no longer open, but the tables themselves need their
own refresh against the merged code — out of scope for this correction
pass, flagged rather than left silently stale.

**Fourth update (2026-09-16, same day):** the "real, citable, entirely
unbuilt" candidates named in the third update above are unbuilt no longer.
`lib/gann/masterTwelve.ts` (Square of 144), `lib/gann/squareOf20.ts`,
`lib/gann/squareOf52.ts`, `lib/gann/hexagonChart.ts`, and
`lib/gann/angleMonthCounts.ts` (the 36 angle-derived month-count half of
the Master Time Factor material) now exist, each with a
`lib/gann/__tests__/` file reproducing the source's own worked historical
examples as passing assertions — see §5 items 13 and 15 below for the
per-module detail. **Fifth update (2026-09-16, third pass, same day):**
this paragraph's "all five are confluence/display or internal-research use
only, none reach `GannConfluenceResult`" claim was itself stale within
hours — a fresh audit (per AGENTS.md's own cross-platform-consistency
worked examples: a fix "quietly undermining" runs for "another full day"
is exactly this shape of defect) found three of the five
(`masterTwelve.ts`, `squareOf52.ts`, `angleMonthCounts.ts`) had no genuine
technical reason to stay stranded and are now wired into
`GannConfluenceResult`/`components/scan/confluence-card.tsx`, confluence
only, never scored. `squareOf20.ts` and `hexagonChart.ts` keep the
research-only exception — a real one, since their ring/angle output can't
be checked against lost original chart illustrations. See §5 item 15 for
full detail. The broader 60/50/30/20/15/10/7/5/3/2/1-year Master Time Factor
cycle hierarchy and `lib/gann/decadeDigitCycle.ts` (item 14) remain open —
out of this pass's scope, not forgotten.

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
absent from all ten of his *public* books: the **Square of 9** (prices
mapped onto a square-root spiral) and **Gann angles** (fixed
price-per-time-unit lines like 1×1, 2×1). Both are real techniques Gann
personally taught — but only to paying students of his private
correspondence course, never in a book sold at a bookstore. A 2004
transcription of that course material (`GANN_HISTORICAL_SOURCES.md`
A2.1) shows both in his own first-person voice, with construction detail
he gave directly: the Square of 9's spiral-and-45°-radial-line
resistance points, and named angles from 1×1 through 8×1+ as fixed
price-per-time-unit rates. So the accurate framing is **disclosed, but
only to a paying private audience — never disclosed to the general
public** — not "undisclosed" and not "a later researcher's
reconstruction." A separate secondary source (`GANN_HISTORICAL_SOURCES.md`
B10) also describes using Gann angles for *time* projection (each angle
mapped to a percentage of the base interval's elapsed time, e.g. 1×1 =
100%, 1×8 = 12.5%) — a layer not present in the retrieved portion of
A2.1 itself, and with no GSPS implementation today.

**Added 2026-09-16 — three more private-course geometric constructions,
same tier as Square of 9/angles above.** A fuller extraction of A2.1
reached three previously unread or barely-read chapters: the **Square of
144** (Master Twelve), now shown to be literally nested inside the Square
of Nine (144 is nine full spiral cycles of the 81-number Square of Nine)
and to carry its own explicit numerology — Gann names 3, 5, 7, 9, and 12
his "Master Numbers," with stated reasoning for each; the **Square of 20**
(a 400-grid anchored to real historical dates, e.g. the NYSE's own
founding, rather than a price); and the **Square of 52** (a weekly
time-period calculator, 7-day weeks, its own eighths/thirds/halves
fraction table). All three are **absent from every public book, disclosed
by Gann himself, never sold publicly** — the identical evidentiary tier as
Square of 9 and Gann angles, not a lesser or different one. **Built
2026-09-16** (`lib/gann/masterTwelve.ts`, `lib/gann/squareOf20.ts`,
`lib/gann/squareOf52.ts`; `lib/gann/hexagonChart.ts` for the Hexagon Chart
mentioned above), confluence/display or internal-research use only — see
§5 item 15.

**Layer 3 — Timing (the part Gann kept secret in every one of his ten
books — outer shell now substantially thicker).** Gann insisted price and
time are symmetric — a move is "square" when the number of bars elapsed
matches the size of the price move — and that specific dates (not just
prices) are where trend changes cluster. He states this refusal outright
and explicitly in at least three separate books spanning 1909 to 1927,
including one all-capitalized sentence in his 1927 novel refusing to
explain "the cause of cycles." That refusal is unchanged by anything found
since. What *has* changed (2026-09-16): a fuller extraction of A2.1 reached
Chapter 7, "Master Time Factor and Forecasting by Mathematical Rules" —
previously the single largest unread gap in the whole 25-document
catalog — and it discloses far more of the outer shell than this document
previously described. Beyond the **fixed annual calendar cycle** (now with
a second, independent A2.1 citation giving exact day-ranges rather than
just named months) and the founding-date-anniversary/longest-prior-move
comparisons already known: a complete named cycle hierarchy (60 years down
to 1 year, each with numbered forecasting rules — e.g., "add 10 years to
any top to get the next 10-year top" is a literal quoted rule); a
day-of-month table for "natural changes in trend"; and, most significantly,
**a full worked numerical example** — the Dow Jones Industrial Average
walked month-by-month from 1896 to 1935, with the exact elapsed-month count
at every major turn checked against 36 angle-derived fractions of 360°.
This is the first time in this whole research pass that "the withheld
mechanism" comes with a complete, dated, real-market demonstration rather
than only the repeated statement that one exists. A separate section of
the same chapter also upgrades the **"decade digit" bull/bear cycle** —
each digit 1–10 of a calendar decade assigned a market character — from an
unverifiable secondary source (B9) to Gann's own private-course voice.
None of this is the withheld mechanism's *justification* — Gann never
states why 360° is the governing unit, or why these particular fractions
matter — so the refusal itself still stands exactly as before. What
changes is that "everything written about the time factor since... is
reconstruction, not transcription" is no longer entirely true:
`lib/gann/timeCycles.ts`'s fixed wheel counts and the fixed annual calendar
cycle both now have a real, literal, disclosed source to be measured
against, not just this codebase's own guess — see §4 and §5 below for what
that changes.

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
(planetary-cycle timing). Astrology's evidentiary status upgraded this
session from "inferred from private letters via a secondary source" to
"directly present in Gann's own private-course voice": A2.1 invokes
Saturn's 30-year orbital cycle for market timing and equates the human
body's 12 openings to the 12 zodiac signs — real content, but limited
and non-ephemeris (no planetary-longitude tables or aspect-based trading
rules in the retrieved portion), and Gann himself subordinates it in the
same document ("anything that can be proved... is not correct unless it
can be proved by numbers and by geometry"). Still absent from every one
of his ten *public* books, confirming the same public/private split as
Square of 9 and Gann angles above. A second private source found in the
same 2026-09-15 window, a signed 1954 client letter
(`GANN_HISTORICAL_SOURCES.md` A2.3), supplies the worked ephemeris system
A2.1 only gestures at: real heliocentric/geocentric planetary longitudes
run through an explicit price-to-degree conversion constant, checked
against an actual traded price for conjunction/opposition. Astrology's
evidentiary status is now "one worked primary example in hand," not just
"cosmological justification without a shown mechanism" — still a single
dated source, not a general rule, and still outside GSPS's scope by
policy.

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

- **Astrology is entirely absent**, despite real evidence — now direct,
  not just inferred — that Gann genuinely used planetary timing: a 2004
  transcription of his own private correspondence course
  (`GANN_HISTORICAL_SOURCES.md` A2.1) has him invoking Saturn's 30-year
  cycle and the zodiac in his own first-person voice, on top of the WD
  Gann Inc. blog's description of his annotated private ephemeris and a
  modern researcher's decoding of planetary-longitude references in his
  1948 soybean chart and 1954 personal letters (B5), and his 1927 novel
  discusses it openly and at length. Every one of his *published* books,
  checked directly and including both of his last two (1949, 1954), is
  completely silent on it — no planets, no zodiac, no "vibration." The
  best-fitting explanation across all ten books plus the course material:
  a stable public/private split held for his entire 45-year career, not a
  late-career shift either toward or away from openness — he disclosed
  risk management and tape-reading freely in print and reserved astrology
  (like the rest of "the time factor") for private client correspondence
  and paid courses, consistently, start to finish. Excluding astrology is
  very likely the right call for a retail platform, but it is a real,
  deliberate deviation from a technique the primary evidence says he
  actually relied on and personally taught — a product/brand decision,
  not something this audit resolves on its own.
- **Square of 9 and Gann angles are implemented without being labeled
  what they actually are: material Gann taught only to paying private
  students, never sold to the general public.** GSPS's
  `lib/gann/squareOf9.ts` and `lib/gann/fans.ts` are correct, working
  implementations of real techniques Gann personally taught — a 2004
  transcription of his private course (A2.1) shows both in his own voice,
  with construction detail he gave directly (the spiral/45°-radial-line
  Square of 9, and named 1×1-through-8×1+ angles). So this is not a
  reconstruction dressed up as canon; it's real Gann material, just from
  the wrong tier of his own curriculum for a platform marketed as
  teaching his *published* method. This isn't a defect (the geometry is
  real, and GSPS is honest elsewhere that `gannAngleSlope` is
  "unmeasured"/weighted at the floor), but the *framing* — presenting
  either technique as "the" Gann technique without noting it's private-
  course-only — still inverts the actual weight of evidence in his own
  published writing, where old-level-crossing and resistance-level
  arithmetic dominate overwhelmingly instead.
- **The "time factor" is reconstructed three different ways across the
  five sources (fixed wheel counts, price/time squaring, Fourier cycles),
  and GSPS implements two of the three (`timeCycles.ts`,
  `timePriceSquare.ts`) — neither of which is what either primary text
  actually discloses**, since both explicitly withhold it. **Revised
  2026-09-16, in response to a direct question about whether this still
  holds**: `timeCycles.ts` no longer earns the "reconstruction" label in
  the same unqualified way — A2.1 Ch. 7's full 60/50/30/20/15/10/7/5/3/2/
  1-year cycle hierarchy, and its second citation of the fixed annual
  calendar cycle, are a real, literal, disclosed source `timeCycles.ts`'s
  existing 45/90/120/180/270/360-day wheel could be measured against and
  extended to match, not just an unrelated guess running in parallel to an
  undisclosed mechanism. `timePriceSquare.ts` is a closer call: its
  specific ATR-normalized bars-vs-price-move formula is still GSPS's own
  invention, not a transcription, so "reconstruction" remains the accurate
  label for *what GSPS built* — but A2.1 Ch. 13's Square of 144 worked
  wheat example (a real commodity's all-time low squared against an
  option's own high/low using explicit halving arithmetic down from a
  20,736-unit "Great Cycle") is now on file as a **far more literal
  disclosed price/time-squaring mechanism** than existed when
  `timePriceSquare.ts` was designed. This doesn't retroactively make
  `timePriceSquare.ts` wrong, but it does mean GSPS's own reconstruction is
  no longer the only, or the most textually faithful, option on the table —
  worth a direct comparison test before treating ATR-normalization as
  settled. The best-evidenced reconstruction (Fourier/spectral, per the
  1926 letter) is still the one GSPS does not implement at all.
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
   before touching `CRITERION_KEYS`. **Status update (2026-09-16, updated):
   merged to `main` as #228.** The sibling branch
   (`claude/vigilant-pasteur-e5bhk9`, commit `1cba6e0`) built all four of
   the items below live (Rule of Three as a new tenth scored criterion, the
   3-point rule as a buffer in `lib/lifecycle/entryConfirmation.ts`,
   lost-motion-adjacent clustering in `lib/strat/levels.ts`, and the fixed
   annual calendar cycle in `lib/gann/timeCycles.ts`), per its own
   documented `AGENTS.md` "WD Gann precedence" standing principle rather
   than this document's unmeasured-first sequencing. Do not re-build any of
   these:
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
11. **New candidate: Gann angles as a *time* projection, not just price
    support/resistance** (`GANN_HISTORICAL_SOURCES.md` B10, secondary —
    not found in the retrieved portion of Gann's own course material,
    A2.1, so weight this below #9's four literal-book rules). Each angle
    maps to a percentage of the base interval's elapsed time (1×1=100%,
    1×2=50%, 2×1=200%, 1×3=33.3%, 1×4=25%, 1×8=12.5%): given a swing's
    start date and the angle a price target sits on, project when that
    target should be *reached in time*, not just what price it implies.
    `lib/gann/fans.ts`/`gannAngleSlope` currently only use angles for
    price slope — this would be new code (a time-target field), not a
    swap-in, and per §4's corrected framing it's still private-course-tier
    material (not something Gann sold to the public), so the same
    "label it honestly" caveat applies as to Square of 9/angles generally.
12. ~~Finish reading A2.1, Gann's private course material~~ — **done,
    2026-09-16**: a fuller extraction reached Chapters 7, 13, 14, and 15B
    (essentially the whole ~460-page book, minus illustrations). See
    `GANN_HISTORICAL_SOURCES.md` A2.1 for full detail. This closes what had
    been the single largest remaining gap in the whole 25-document catalog
    and surfaces items 13–15 below.
13. **`lib/gann/angleMonthCounts.ts` — built 2026-09-16, confluence/display
    only, never scored.** Covers the 36 angle-derived month-count half of
    A2.1 Ch. 7's disclosed material: the 11.25°-step/32-way division of
    360°, read as month-counts from a major swing, Gann's 12 "very
    important" starred angles surfaced with their own `starred` field and
    used as the default projection set. Its unit tests reproduce the exact
    calendar-month arithmetic behind the 1896-1935 DJIA case study's two
    round numbers (Aug 1896 → Nov 1907 = 135 months; a 1909 top → Sept
    1929 = 240 months). **"Still open" note stale as of 2026-09-16,
    corrected here**: the broader 60/50/30/20/15/10/7/5/3/2/1-year cycle
    hierarchy this item previously described as unbuilt is already
    implemented — `lib/gann/timeCycles.ts`'s `MAJOR_CYCLE_YEARS` constant
    (`[1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 60]`) is exactly this list and is
    wired into `scanTicker.ts`, `lib/backtest/replay.ts`, and the
    confluence layer, sitting alongside that module's narrower
    45/90/120/180/270/360-day wheel rather than a separate module. This is
    the fullest disclosed statement of "the withheld timing mechanism"'s
    outer shell found in this whole catalog — date/angle arithmetic against
    known pivots, no new statistical machinery.
14. **New candidate: `lib/gann/decadeDigitCycle.ts`** (A2.1 Ch. 7) — the
    bull/bear decade-digit cycle, upgraded this session from the
    unverifiable secondary source B9 to Gann's own private-course voice.
    The source-tier upgrade doesn't lower the validation bar (Dewey's
    cycle-rigor checklist, §1 Layer 5, still applies in full before
    treating it as more than a hypothesis), but it does mean the technique
    now qualifies for the same "citably Gann's own" treatment item 9's four
    candidates already received — comparably cheap to build (a
    calendar-year-digit lookup, no pivot detection).
15. **`lib/gann/masterTwelve.ts` (Square of 144), `squareOf20.ts`,
    `squareOf52.ts`, `hexagonChart.ts`** (A2.1 Ch. 13/7/14/15B) — built
    2026-09-16. **Correction, same day, second pass:** all four had been
    left "internal-research use only, never wired into `GannConfluenceResult`"
    with no per-module technical justification beyond that blanket label —
    itself a violation of AGENTS.md's cross-platform-consistency rule
    ("built once and left stranded... is not partially done — treat it as
    not done"). Re-audited: `masterTwelve.ts` (nearest-level lookup) and
    `squareOf52.ts`/`angleMonthCounts.ts` (both `{active, dates}`, the same
    shape `timeCycles.ts` already surfaces live) have no dependency on the
    original chart illustrations and are now wired into
    `GannConfluenceResult.nearestMasterTwelve`/`.squareOf52`/
    `.angleMonthCounts` and rendered in `components/scan/confluence-card.tsx`,
    confluence/ranking only, never scored in `lib/scoring/`. `squareOf20.ts`
    and `hexagonChart.ts` keep their exception — a real, technical one:
    their ring/angle placement can't be checked against the original
    hand-drawn wheel/chart, lost to this text-only extraction — see each
    module's own header. `masterTwelve.ts` generalizes `squareOf9.ts`'s spiral
    formula to base 12 and encodes the two systems' confirmed nesting
    (`HALVING_CHAIN` from the 20,736 Great Cycle down to 81 = 9² = the
    Square of Nine's own grid) plus the wheat 1852/325/44¢ worked example
    (281 months reproduced exactly as high-minus-low; 288 carried as
    Gann's stated bound, its own derivation not spelled out in the
    retrieved text — documented as an open gap, not force-fit). `hexagonChart.ts`
    implements the centered-hexagonal-number sequence (1, 7, 19, 37, ...,
    397) and the 169 = 14y1m = double-the-7-year-cycle claim as a real,
    passing arithmetic test; the Hexagon/Square-of-Nine/Master-Twelve
    cross-validation example (the number 66) is carried as a documented
    citation rather than an independently re-derived geometric proof, since
    the source's own chapter illustrations are lost to this text-only
    extraction (`GANN_HISTORICAL_SOURCES.md` A2.1 says so explicitly).
    `squareOf20.ts` reproduces the two disclosed date/cell facts exactly
    (1929 and 1932 are 137 and 140 years after the NYSE's 1792 founding)
    but, for the same lost-illustration reason, does not claim to
    reproduce the original wheel's exact "45°"/"7th zone" graphical
    placement — its own header documents this limitation rather than
    asserting an unverifiable match. `squareOf52.ts` implements the
    disclosed 52-week fraction table (1/2 = 26wk "most important", 3/4 =
    39wk "very important", etc.) as its own fixed table; its header
    documents why this wasn't folded into `retracement.ts`'s existing
    price-domain eighths table (different anchor convention, different
    disclosed fraction set — a real exception, not an oversight, per
    AGENTS.md's cross-platform consistency principle).
16. **Open-interest culmination rule** (`GANN_HISTORICAL_SOURCES.md` A8, the
    fifth of the volume/open-interest culmination rules) — reviewed 2026-09-16,
    intentionally not built. Open interest is a derivatives-contract concept
    with no counterpart for a share of stock or a spot crypto holding, and
    `AssetClass`/`Bar` (`lib/types.ts`) carried no such field for either of
    GSPS's two supported asset classes at the time this was written
    (`"us_equity" | "crypto"`; a third, `"commodity"`, was added the same day
    per the addendum below, but as an unconnected data-path stub with no real
    feed — this item's reasoning is unchanged until that changes). Documented
    as a real asset-class exception in `lib/gann/volumeClimax.ts`'s own header
    rather than silently omitted, per AGENTS.md's cross-platform-consistency
    carve-out. Revisit only if GSPS ever adds a futures/options asset class
    with a real open-interest feed.

## Addendum (2026-09-16): "Observation of Cycles" folder audit — Dewey/Tomes findings

Written after a full (not sampled) read of all 8 documents in the project
owner's "Observation of Cycles" Google Drive folder — 4 Ray Tomes papers, 2
Edward Dewey papers already indexed as `GANN_HISTORICAL_SOURCES.md` C1-C6, a
2003 *Journal of Circadian Rhythms* review (C7, confirmed on this full read
to be biomedical/autobiographical with no market-relevant content beyond
what C7 already records), and the A2.3 astrology letter (already fully
decoded in a prior session, nothing new). This addendum reports what a full
understanding of the Dewey/Tomes half of that folder implies for GSPS,
resolves the astrology open question (item 8 above), and records new
plumbing added the same session.

### Finding 1: Fourier/dominant-cycle decomposition -- recommendation #5 above, now better-grounded

Recommendation #5 already named this as unbuilt. Having now read Tomes'
*Harmonics Theory* paper in full, the concrete method is clearer: non-linear
response functions generate harmonics concentrated at small-integer ratios
(his "2s and 3s" families, matching Dewey's own cycle-length catalogue), and
his actual technique -- spectral analysis to find a series' dominant
period(s), then cross-check the result against known common-cycle lengths --
is a real, well-specified algorithm, not a metaphor. This remains **not
implemented anywhere in this codebase** (confirmed by grep: no `Fourier`,
`spectral`, or dominant-period detection exists in `lib/`). It is the
natural successor to the quarantined `timeCycle` criterion, which only
projects fixed anchor-based wheel counts and never asks what period a
symbol's own price series actually exhibits. **Status: still open,** not
built this session -- recommend evaluating it as a new candidate criterion
through `PROPOSAL_NEW_GANN_CRITERIA.md`'s unmeasured -> attribution ->
in/out-of-sample pipeline, explicitly framed as a `timeCycle` replacement
candidate rather than a tenth criterion.

### Finding 2: Dewey's cycle-validation checklist was cited, never executable -- now built

`lib/gann/decadeCycle.ts` and `lib/gann/digitalRoot.ts`'s headers both cite
"Dewey's cycle-validation checklist (dominance, regularity, repetition
count, constancy of period, phase-resumption, cross-series synchrony)" as
the bar a cycle hypothesis must clear before promotion out of
confluence-only status -- but nothing in the codebase could actually run that
check against real data; it was prose in two comment blocks, not code.
**Built this session:** `lib/validation/cycleRigor.ts` operationalizes
Dewey's single-series criteria (dominance, regularity, repetition count,
constancy of period, phase-resumption) plus a two-series synchrony check, as
plain arithmetic over an event-date list -- see that file's own header for
the exact formulas and their honest limits (these are engineering
approximations of Dewey's descriptive criteria, not a claim of statistical
rigor equivalent to Bartels' test). `decadeCycle`, `timeCycles`, and any
future Fourier-based criterion (Finding 1) now have something real to be
run against instead of an uncheckable citation.

### Finding 3: `timeCycles.ts` doesn't weight cycle convergence

Dewey's "Synchrony of Cycle Phase" and "Significance of Related Cycles"
criteria (`case_for_cycles.pdf`, criteria #11-13), and Tomes' whole harmonics
argument, hold that multiple independently-derived cycles landing on the
same date is far more significant than any single cycle alone -- exactly the
logic GSPS already applies when the Square of Nine, Hexagon Chart, and
Master Twelve all land on the same number (66) and that agreement, not any
one construction alone, is treated as the actual evidence
(`GANN_CYCLES_STUDY_SUMMARY.md`'s Hexagon Chart section). `lib/gann/
timeCycles.ts`'s `timeCycles()` does not do this today: an isolated 45-day
wheel-count hit and five different cycle lengths (a wheel count plus several
`MAJOR_CYCLE_YEARS` anniversaries) converging on the same date are weighted
identically -- both just set `active: true`. **Status: open, not built this
session.** Recommend adding a convergence count to `TimeCycleResult` (how
many distinct cycle sources land within the window, not just whether any
did) as a cheap, in-style enhancement -- display/confluence-only at first,
same treatment every other cycle hypothesis in this file gets, until it's
run through `cycleRigor.ts`'s synchrony check against real turning-point
data.

### Astrology -- resolved (project owner direction, 2026-09-16)

Item 8 above ("whether astrology has any place in GSPS at all") is
resolved: **astrology must never gate a live verdict.** It may exist only as
a labeled, non-gating confluence signal (the same "confluence/context only"
treatment `digitalRoot.ts` and `decadeCycle.ts` already carry) -- and only if
a legitimate, citable technique can be encoded without inventing numerology
GSPS has no authorized specification for (the existing "no new numerology
without an authorized spec" rule, `GANN_SARA_CONFLUENCE.md`, still applies
in full to any astrology candidate). Until such a technique and its
specification exist, astrology stays disregarded -- no code, no confluence
field, nothing built. This is a standing decision, not a one-time answer;
see AGENTS.md's new "Astrology" section for the durable record.

### Commodities: a data-layer extension point, not a Gann-methodology finding

Both Tomes' oil-price cycle paper (C2) and the A2.3 astrology letter concern
commodity markets (crude oil; coffee futures) that GSPS currently has no way
to run any criterion against -- `lib/types.ts`'s `AssetClass` had only
`"us_equity" | "crypto"`, and the existing `/api/futures` route
(`docs/MULTI_PROVIDER_SETUP.md`) is a read-through quote display, never
connected to `MarketDataProvider`/the scan pipeline. Added this session,
scoped strictly as plumbing (no live data, nothing changes for existing
symbols): `AssetClass` now includes `"commodity"`; `lib/data/commodity.ts`
is the reserved, clearly-labeled "not connected yet" extension point;
`lib/data/alpaca.ts` now rejects `"commodity"` explicitly rather than
silently querying the wrong market. This is infrastructure, not a
cycle-theory or Gann-methodology gap -- recorded here only because it's the
prerequisite for ever testing Findings 1-3 against a commodity symbol.
