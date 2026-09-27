# B07 — Larry Pesavento & Shane Smoleny, *A Trader's Guide to Financial Astrology* (Wiley, 2015)

| Field | Value |
|---|---|
| Tier | **Not a Gann source.** The catalogue (B7) already records that the book never mentions Gann. It is read here for its **testing method**, which bears on how GSPS validates cycle claims (Dewey, C06). |
| Copyright | © John Wiley & Sons. In copyright. Synthesis only; no book text is stored. |
| Read status | **Pages 1–162 of about 200 read in full** (front matter, Preface, Chs. 1–10, and the opening of Ch. 11). The Drive text extraction stopped at p. 162. **Not read:** the rest of Ch. 11 (Moon vs Sun angle since 1885, since 2009/QE; Moon vs sign for the S&P since 1950 and since 2009), the Conclusion, and Appendices A (Full/New Moon dates), B (Bradley Barometer), C (Sun/Moon lunar cycles) and D. |
| Admissibility | Astrology. **Excluded** under AGENTS.md "Astrology — standing decision". Nothing here may be built as a criterion, gate or confluence field. |

## What the book does (synthesis)

**Chs. 1–6: astrology primer.**
- **Frame.** Planets are "energies" and markets express their lowest common
  denominator, fear and greed. Jupiter means expansion, Saturn contraction.
  The inner "trigger" planets (Sun, Moon, Mercury, Venus, Mars) set off
  tension that the outer planets build up.
- **Uranian points.** Eight hypothetical trans-Neptunian points from the
  Hamburg school (Witte, Sieggruen) are presented as real influences.
- **Aspects.** Soft angles (0/30/60/120/150) are "positive" and hard angles
  (45/90/135/180) "negative". A typical orb is 2–3°. Aspect strength rises
  while the aspect is applying, peaks, then fades while it separates. When
  transits overlap, the peak can come *before* the slow planet's exact
  aspect. A planet stationing retrograde stretches the peak zone.
- **Sun–Moon quarters.** New Moon means beginnings, Full Moon means peaks.
- *Assessment:* this is exposition, not evidence. The Uranian points have no
  physical existence. "Verified by rectification" means the meanings were fit
  to past events.

**Ch. 7: cycles versus transits.**
- **Definitions.** A cycle has a period, a frequency and an amplitude.
  Sidereal and synodic periods differ; the Moon's are 27.3 and 29.5 days.
- **Geocentric vs heliocentric.** Retrograde motion makes geocentric cycles
  choppy, while cycles built only from direct-moving bodies (Sun, Moon)
  repeat cleanly.
- **Two cycle types.** "Planet-versus-sign" relates price to a position.
  "Planet-versus-planet" relates price to an angle, built as a composite of
  price behaviour at each degree across many cycles.
- **Sample-size warning (the useful part).** A cycle with fewer than about
  5 samples cannot be confirmed; 10–15 is the practical floor. With only
  about 130 years of market data, outer-planet cycles are unusable.
  Composites built from few cycles *look* accurate and forecast badly.

**Ch. 8: the "efficiency test" (the methodologically interesting chapter).**
- **Procedure.** Build an event-study composite of the Dow from 15 days
  before to 15 days after each New Moon, 1885–2013 (1,583 cycles). Find the
  best long window: buy 3 days before, sell 14 days after, holding 17 of 30
  days.
- **Headline results.**
  - The window wins 56% of the time.
  - It earns about 2,143% against 45,074% for buy-and-hold (ratio 0.05).
  - The authors admit buy-and-hold wins in a bull market.
- **Their own validation standard (good in principle).**
  - An efficiency test is only *observation*, not significance.
  - Significance needs a **control**: random dates, or the market's own base
    rate. A 60% win rate in a market that rises 59% of the time means
    nothing ("don't confuse brains with a bull market").
  - Compare against a normal or chi-square distribution.
  - A small sample needs a much bigger edge before it counts.
- **"Walk-through."** They split the data into 12 sub-periods and check the
  composite's shape repeats in each, which they call fractal self-similarity.
  They present this as ruling out a curve that keeps morphing.
- **What they actually report.**
  - The sub-period bottom day ranged from −6 to +5 days around the New Moon,
    with a mean of −1 and a standard deviation of 1.7.
  - In 1970–80 and 2005–13 the polarity flipped, with a top near the New
    Moon. They explain this as a bear market inverting the cycle.
- **What they did not do.** They never report the control comparison or a
  p-value for the 56%. The Dow's own up-day base rate over the period is not
  given. So by the book's own standard the New Moon claim is **unverified**.
  An ad hoc polarity flip for bear markets is exactly the escape hatch that
  Dewey's "persistence through changed conditions" criterion forbids.

**Ch. 9: "verification" of planetary meanings.**
- **Claim.** Composites of Mars–Apollon, Mars–Admetos (57 cycles each),
  Venus–Jupiter (99), Venus–Saturn (101) and the Moon against eight Uranian
  points (1,408 cycles each) each moved in the "traditional" direction.
- **Bradley Barometer (1947).** It is a weighted net-sum of aspect scores
  plus declination. The authors concede it has "failed quite a number of
  times" recently and blame high-frequency trading and quantitative easing.
- **Assessment.** The effect sizes are tiny (composite amplitudes around
  0.0005 of price). No control, error bars or multiple-comparison correction
  is shown, and there is no out-of-sample hold-out. Many pairs were tested
  and the confirming ones shown. This is the textbook garden of forking
  paths.

**Ch. 10: the solar (annual) cycle.**
- **Composite.** A Sun-position composite over about 109 years gives
  seasonal turn dates: Jan 7, Jan 23, Feb 2, Feb 25, Mar 7, Mar 28, Apr 16,
  May 22, Jun 12, Jun 26, Jul 17, Jul 27, Sep 4, Oct 27, Dec 8 and Dec 20.
- **Named seasonals.** April rally; "sell in May"; summer rally; fall crash
  (Sep 4 to Oct 27); Santa rally; January effect; "Ides of March" decline.
- **Their explanation.** They tie these to the four cardinal points and the
  US "Cancer" chart.
- **Profit table.** It claims up to 2,308× buy-and-hold at a 2% swing filter
  over 1885–2013. That is an in-sample optimisation of turn dates on the same
  data used to find them, so its out-of-sample value is nil.

## GSPS cross-reference

| Idea | GSPS today | Note |
|---|---|---|
| Event-study composite ("efficiency test"), control/base-rate comparison, sub-period "walk-through" | `lib/backtest/attribution.ts` (factor Δ vs base rate), `docs/replay-runs/` half-split checks, `lib/validation/health.ts#correlationSignificance` | GSPS **already does the step this book skips**: it compares each criterion against the unconditioned population and tests significance. Useful as a worked counter-example: a 56% hit rate is meaningless without the base rate. Supports C06 Dewey criteria 7 (out-of-sample) and 18 (significance). |
| "Cycles with < 5–15 repetitions can't be confirmed" | `lib/gann/spectralCycle.ts` (repetition-count item of Dewey's checklist) | Same principle as Dewey's repetition-count item. Relevant to `MAJOR_CYCLE_YEARS` (30/50/60-year cycles have 1–4 repetitions in any US equity history), recorded as an open caution in the master report. |
| Annual seasonal turn dates | `lib/gann/timeCycles.ts` `FIXED_CALENDAR_MONTHS = [2,3,5,6,8,9,11,12]`, day 5 (Gann A4) | **Independent, weak corroboration only.** Four of B7's turn dates fall in Gann's "early month" windows: Feb 2, Mar 7, Sep 4 and Dec 8. Four of Gann's months (May, Jun, Aug, Nov) show no early-month B7 turn. B7 is in-sample and non-Gann, so this changes nothing. Recorded so no one re-derives it. |
| Bradley Barometer / net-sum transit oscillator | None | Excluded (astrology). |
| Polarity flip in bear markets | None | A warning pattern: an unfalsifiable rescue. If a GSPS cycle criterion ever "inverts in bear markets", treat that as a translation bug or a non-cycle, never as a regime-dependent feature, unless it is pre-registered. |

## Three-question notes

1. **Gann tier.** None; not Gann.
2. **Dewey/cycles.** The book *names* the right tests (control, significance,
   sub-period stability, sample size) and then reports none of the
   significance results. Against Dewey's items: repetition count is cleared
   for lunar and solar. Constancy of period is cleared trivially, since the
   periods are astronomical. Phase-resumption and wave-shape identity are
   **not cleared**: the bottom day wanders from −6 to +5 and polarity flips.
   Significance is **not shown**. Out-of-sample is **not done**, because the
   walk-through re-uses the same data.
3. **Hermetic.** The book leans on **Correspondence** and **Vibration**
   (resonance, harmonic angles as "standing waves") and on **Polarity**
   (soft/hard angles, Jupiter/Saturn). It is a clear example of the lens
   being used as evidence, which AGENTS.md forbids.
