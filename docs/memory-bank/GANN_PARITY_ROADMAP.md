# Gann Parity Roadmap: what GSPS still needs to become a faithful copy of W. D. Gann's method

*Compiled 2026-09-27, after the full read of every Gann source in the project owner's folders (A01–A11, A2.1–A2.3). Built from `GANN_CYCLES_HERMETIC_MASTER_REPORT.md`, the per-source notes in `docs/memory-bank/sources/`, and a check of the current code (`lib/gann/`, `lib/scoring/`, `lib/lifecycle/`, `lib/trade/`, `lib/risk/`). It recommends; it doesn't change code. Everything that would move a verdict, a plan, an order or risk is an owner decision under AGENTS.md.*

> **Roadmap phase.** The current phase is Q1 (Aug–Oct 2026, monetization and retention). None of this is a Q1 initiative. It continues the out-of-phase Gann-grounding work recorded in ROADMAP.md under "Gann & Sara Cross-Market Confluence Layers." Each item built from here should be recorded as out-of-phase, per AGENTS.md.

---

## Part 1 — What "a carbon copy" can and cannot mean

The goal is that every rule Gann **disclosed** runs in GSPS the way he stated it, on every surface it applies to. Four limits apply. They come from the sources themselves, not from GSPS preference, so it is worth stating them first.

1. **Gann never published his "Master Time Factor."** Four texts say so in his own words:
   - *Truth of the Stock Tape* (1923): "not my object here to give away that secret"
   - *Wall Street Stock Selector* (1930): forecasting methods taught only by private course
   - *Face Facts America!* (1940)
   - the 1929 Annual Forecast's sales pages

   What survives is his **disclosed** time rules (cycle hierarchy, anniversaries, fractions of time, the permanent calendar, counter-move durations) and his **forecasts**. His forward record with the undisclosed method is mixed: the 1929 call was a hit he chose to reprint, and the 1940 war and economy calls mostly missed (master report M7). **GSPS can copy the disclosed rules exactly. It cannot copy the secret, and nothing in our files lets us reconstruct it.**
2. **Some illustrations are lost.** The Hexagon and Square of 20 plates, and the Master Course chapter figures, don't survive. The modules built on them stay research-only (AGENTS.md, orphan audit item 7).
3. **Magnitudes don't port literally.** "3 points," "5 cents," "9 points on the Dow" are 1920s–50s share and commodity prices. Gann himself scaled stops and moves to price level (A8's price-scaled cotton-seed-oil stops; the 1951 "normal move = 1/16 of price"). GSPS ports **the rule** and scales **the number**, and says so each time. `combineNearbyLevels` is the standing worked example.
4. **Gann's astrology is his, but our policy governs how it enters.** Per AGENTS.md (clarified 2026-09-27), it ranks alongside his other techniques by how well it is sourced. It enters only as a labelled confluence field, after an ephemeris calculation and Dewey's full test. It never gates.

**Status legend used below:**
- **Aligned**: the rule runs as Gann stated it.
- **Partial**: the rule's shape is there, but a part is missing or differs.
- **Conflict**: GSPS does something Gann's text contradicts.
- **Missing**: no implementation.
- **Research-only**: built but deliberately kept out of production.
- **Excluded**: not to be built, with the reason recorded.

---

## Part 2 — Where GSPS stands today (summary)

| Domain | Aligned | Partial | Conflict | Missing | Other |
|---|---|---|---|---|---|
| Time | 17 | 0 | 0 | 0 | 1 research-only |
| Price and levels | 10 | 0 | 0 | 0 | — |
| Trend | 11 | 0 | 0 | 0 | — |
| Entries, stops, exits, lifecycle | 11 | 1 (pyramiding not automated) | 0 | 0 | — |
| Volume | 4 | 0 | 0 | 0 | — |
| Risk and money management | 6 | 0 | 0 | 0 | — |
| The trader (education) | 4 | 1 | 0 | 0 | — |
| Astrology, numerology, forecasting | 1 | 0 | 0 | 3 (research) | 2 excluded, 1 cannot be copied |
| **Total (73 rules)** | **64** | **2** | **0** | **3** | **4** |

Counts are rows in Part 3, recounted from the row statuses late on 2026-09-28 (the earlier total of 74 was off by one). "Aligned" includes rules built as measured context that the next full run will decide on.

**The headline (updated 2026-09-28, late):** every rule the owner listed that can be built is now built. Gann's exits run live (owner decision, 2026-09-28). The rules added today (even figures, Seven Zones, seasonal counts, accumulation time, shares per point, leaders, the time rules, double/triple tops, time balancing) read on the live scan and the replay and are measured as context; the next full run decides which act on the verdict. Pyramiding is suggested and measured but not placed automatically. **The six-year 1-hour run (2026-09-28) lost money in every cell**, so the verdict's edge across regimes is unproven; see `docs/replay-runs/2026-09-27-766sym-NOTES.md`. What remains: the astrology research track (kept separate), automated pyramid adds, and the dated-forecast teaching example.

The original headline (2026-09-27) named trend construction, the change-of-trend rules and post-entry management as the biggest gaps.

---

## Part 3 — The parity matrix

Each row gives the rule and its source, what GSPS does now, the status, and the next step. **Owner** marks rows that need a project-owner decision before building (they touch scoring, gating, plans, orders or risk). Gap numbers (G1–G25) and conflict numbers (X1, X3) refer to the master report's Part V.

### 3.1 Time (Gann's first factor)

| Gann rule | Source | GSPS today | Status | Next step |
|---|---|---|---|---|
| Time outranks price; time says when, price says which way | A2.1, A2.2, A11 | `timeCycles.ts` gives windows; direction comes from pivot polarity | Aligned | — |
| Count from every major pivot, not a calendar origin | A03; A2.1 Ch. 13 | `majorPivots` anchors | Aligned | — |
| Cycle hierarchy 1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 60 years | A2.1 Ch. 7 | `MAJOR_CYCLE_YEARS`, `yearCycleConvergence` | Aligned | **Done 2026-09-28 (M5):** 30/50/60 labelled disclosed, not validated |
| Convergence of several cycles on one window | A2.1 Ch. 7, 13 | `yearCycleConvergence` counts hits; **2026-09-28 (G11):** `timeConvergence.ts` reads days/weeks/months from the year's extreme landing on a multiple of 12 together | Aligned (context, measuring) | — |
| Permanent annual calendar (8 dated windows) | A04 back matter; A09 | `FIXED_CALENDAR_WINDOWS` | **Aligned (fixed 2026-09-27)** | Measure as a recurrent event (M4) |
| Fractions of the year: anniversary > ½ > ¼, ¾ > ⅓, ⅔ > ⅛s | A2.1 Ch. 13–14 | `squareOf52.ts`, `WHEEL_COUNTS`; **Stage A:** `YEAR_FRACTIONS` ranked and driving the time windows | Aligned | Add the ranking to the output (G8) |
| Day-count bands 7–12, 18–21, 28–31, 42–49, 57–65, 85–92, 112–120, 150–157, 175–185 | A09 Rule 8; A8 pp. 57–58 | **Stage A:** `DAY_COUNT_BANDS` drive the time windows (`timeCycles.ts`) | Aligned | G17: add the bands as windows from each pivot. Confluence first |
| Seasonal counts from Mar 20/21 and the midseason points | A2.1 Ch. 14, 17, 18 | **Built 2026-09-28:** `seasonalCounts.ts` ranks the seasonal year from March 21 (½ first, then ¼/¾, ⅓/⅔, the eighths); the ⅓ and ⅔ dates join the fixed calendar; on the card, trace and replay factors | Aligned (context, measuring) | Decide on the next full run |
| Counter-move duration prior: reactions 2–5 weeks (3–4 typical; 14 and 21 days most common); a 3rd month means a trend change; strong stocks seldom react into a 2nd month | A2.1 Ch. 11B, 14, 17; A05; A04 Ch. IV | **Stage A:** `readCounterMove` (normal / extended / 2nd / 3rd month), card and measured factors | Aligned (context, measuring) | G2 and G24. A "counter-move clock" context field, then an Owner decision on using it as a trend-change signal |
| Daily/weekly time rules: 2–3-day halt at extremes; buy 2–3-week reactions; watch the 3rd week; the 6th–7th week ends fast moves | A04 Ch. IV; A09 Rule 4 | **Built 2026-09-28:** `timeRules.ts`: the 2–3-day halt at an extreme with the stop beyond it, the reaction week, the 2–3 week zone, the third week, over four weeks abnormal; `boilingPoint.ts` keeps the 6th–7th week | Aligned (context, measuring) | Decide on the next full run |
| Time balancing: project prior swing durations forward; percentages of time | A8 pp. 97–99, 293 | `timePriceSquare.ts`; campaign-ledger time-balance dates and projection dispersion, shown; **2026-09-28:** `onTimeBalanceDate` measured on every trade | Aligned (context, measuring) | Decide on the next full run (G22) |
| Accumulation time proportional to the size of the advance | A04 Ch. VII; A8 p. 52 | **Built 2026-09-28:** `accumulation.ts`: weeks in the range and the breakout direction; long ranges (10+ weeks) flagged | Aligned (context, measuring) | Decide on the next full run |
| 7/14-day alternation of minor and major turns | A2.2 | **Built 2026-09-28 (G9):** `timeConvergence.ts` (7/14/21 days ±1 from the last 3-Day Chart pivot) | Aligned (context, measuring) | — |
| Incorporation-date anniversary / company age | A03; A2.1 Ch. 7; A04 Ch. VI | **Built 2026-09-28 (D3).** `lib/gann/incorporationCycle.ts`: the anniversary, Gann's U.S. Steel seasonal degrees (45° … 360°) and the 5–60-year cycles from the company's inception date (Wikidata P571 by SEC CIK, stored in `instrument_profile`). On the confluence trace and recorded as replay context factors | Aligned (context, measuring) | Measure on the next run |
| Periodogram ("harmonic analysis") | A03; 1926 letter (B01) | `spectralCycle.ts`, confluence; **2026-09-28 (M1/M2):** Schuster p, cosinor amplitude with 95% interval and zero-amplitude test, log-price detrending, band-edge and window-trim artifact guards, a 70/30 forward hold-out | Aligned | — |
| Squares of time: Master 12, Square of 52, 36 angle month-counts | A2.1 Ch. 7, 13, 14 | `masterTwelve.ts`, `squareOf52.ts`, `angleMonthCounts.ts` (confluence) | Aligned | — |
| Decade-digit bull/bear years | A2.1 Ch. 7 | `decadeCycle.ts` (confluence) | Aligned | — |
| Square of 20 and Hexagon | A2.1 Ch. 7, 15B | research-only | Research-only | Keep, unless new source material appears |

### 3.2 Price and levels

| Gann rule | Source | GSPS today | Status | Next step |
|---|---|---|---|---|
| Range divisions: ½ first, then ¼/¾, ⅓/⅔, ⅛s | A2.1 Ch. 2, 13 | `retracement.ts`, `gannRetracementConfluence` (scored) | Aligned | — |
| Percentages of the extreme *price* (low ÷ 8; high ÷ 8 and ÷ 3; 50% and 100% of a bottom) | A8 pp. 32–34; A09 | **Stage A:** `pricePercentageLevels`; the three major levels join the S/R list | Aligned | G13: add as levels to `retracement.ts`, feeding the same confluence |
| Old tops become support, old bottoms resistance | A02; A04; A8 | `historicalSR` (scored), `levels.ts` | Aligned | — |
| Clustered levels averaged into one | A2.1 Ch. 9; A8 | `combineNearbyLevels` | Aligned | — |
| Double and triple tops within a price-scaled band; the 3rd test decides | A05; A8 p. 53 | **Built 2026-09-28:** `multipleTops.ts`: tests clustered per level; testing, crossed, or failed on the third test | Aligned (context, measuring) | Decide on the next full run |
| The 4th test of a level goes through | A8 p. 43; A09 | **Stage A:** `readLevelTests` counts tests and notes that a 4th usually breaks; measured factors | Aligned (context, measuring) | G15: an invalidation or confluence field |
| Square of Nine (180° = +1 root) | A2.1 Ch. 13 | `squareOf9.ts` | Aligned | Don't "fix" it to the D-levels table (C5) |
| Gann angles / 1x1 | A2.1 Ch. 4 | `fans.ts`, `normalizedSlope.ts`, `gannAngleSlope` (scored) | Aligned (price unit ATR-scaled, documented) | — |
| Price = time squaring | A2.1; A8 | `timePriceSquare` (scored) | Aligned | — |
| Even figures (100, 200) attract orders; place orders ½–¾ off them | A04 Ch. I, V | **Built 2026-09-28:** `evenFigures.ts`: targets just before a figure and stops beyond one on every plan (live and replay); a notice on the card, chart and ticket (switchable); the portfolio manager holds entries into a figure unless the breakout is that figure (setting, default off); `roundNumberAhead` measured | Aligned | — |

### 3.3 Trend

| Gann rule | Source | GSPS today | Status | Next step |
|---|---|---|---|---|
| **Swing chart = counter-moves of 2–3 days on highs and lows; weekly chart = 7 calendar days; trend turns on breaking the last swing extreme** | A8 1951 pp. 316–317; A09 Ch. VII; A04 Ch. IV; A02 p. 82 | `swingChart.ts` rebuilt 2026-09-27: 3-Day Chart + 7-day weekly chart on highs and lows, trend on breaking the last swing extreme | **Aligned (B1 built 2026-09-27)** | Fresh replay on `2026-09-27-gann-swing-charts` (B3); the price-scaled 9-point chart stays a candidate |
| Time trend turn: a lower top, then a break of the first swing low | A8 1951 p. 309 | `trendStrength.ts` stepping swings | Aligned in structure | Re-verify after B1 |
| Rule of Three (3 consecutive lower closes reverse an uptrend) on daily, weekly and monthly | A04 p. 72 | `ruleOfThree.ts`, scored on daily, weekly and monthly closes (Stage A) | Aligned | Apply on weekly and monthly as Gann does |
| Three-stage Space Rule; greatest reaction of the campaign exceeded = trend change | A2.1 Ch. 7, 10A, 11A; A8 p. 51; A04 Ch. VII | **B2:** `campaignLedger.ts` over-balance of space stops a trend confirming (`readGannTrend`) | Aligned | G3 + G14: build one **campaign counter-move ledger** (Part 5, B2) |
| Over-balance of time before space | A8 BP/SP #3–#6; A09 Rule 8; A2.1 Ch. 11 | **B2:** over-balance of time, same path | Aligned | G14, same ledger |
| Monthly-low (high) break since the top = trend turn | A05; A04 Ch. VII | **B2:** monthly-low (high) break, same path | Aligned | G6 |
| Close vs bar midpoint as a per-bar trend read | A2.1 Ch. 13 | **Stage A:** `readBarMidpoint`, card and measured factor | Aligned (context, measuring) | G1, the cheapest literal rule |
| Weekly 1-bar swing chart | A2.1 Ch. 18 | Subsumed by B1's 7-day weekly swing chart | Aligned | G5 (subsumed by B1's weekly chart) |
| Monthly > weekly > daily hierarchy, with power ratio 7/30/365 | A05; A04 | `readTrend`, `timeframeWeight.ts` | Aligned | — |
| Stock's own trend, never index confirmation | A05; A2.1 Ch. 5–6 | `macroBreadthAgrees` uses the stock's own charts | Aligned | Keep it that way (X2 withdrawn) |
| Campaigns run in 3–4 sections; signals weigh more in the 3rd/4th | A04; A09 Rule 5; A8 p. 51 | **B2:** campaign sections in the ledger; final-stage trail in `exitRules.ts`; `lateSection` factor | Aligned | A section counter in the B2 ledger |
| Sideways range: stay out; trade the breakaway | A8 p. 52; A04 Ch. V, VII | **Built 2026-09-27 (decision 5).** `rangeReversion.ts` is never tradeable; `lib/gann/breakaway.ts` + `applyBreakawayHold` hold a range-bound Execute to Watch unless the entry crosses the 13-week range's extreme (live scan and replay) | Aligned | — |

### 3.4 Entries, stops, exits and lifecycle

| Gann rule | Source | GSPS today | Status | Next step |
|---|---|---|---|---|
| Buy/sell on crossing an old swing extreme + lost motion (≈1⅞, never 3 points) | A2.1 Ch. 9; A8 | `entryTrigger.ts` | Aligned | Add the Ch. 9 citation (C4) |
| 3-point confirmation beyond a level | A02; A04; A05 | `entryConfirmation.ts` buffer | Aligned | — |
| Stop placed at entry, just beyond the level | A01; A05; A04 | plan invalidation | Aligned | — |
| Hold test: no 3-point reaction back under a crossed top | A05; A8 p. 53 | `exitRules.ts`; **live since 2026-09-28** (owner) on every paper and live position. The 3 points are price-scaled from Gann's own bands (`pointScale.ts`, 2026-09-28); until then they reused the entry's 0.3% margin, a tenth of his figure | Aligned | — |
| Exit after 3 successive adverse closes | A05 p. 23 | `exitRules.ts`; **live since 2026-09-28** | Aligned | — |
| Break-even stop after 3–4 points of profit | A02 Book II; A04 Rule 3 | `exitRules.ts`: break-even after one risk unit; **live since 2026-09-28** | Aligned | — |
| Trail the stop by the size of the last reaction, or under the prior month's low; in the final stage, under the prior day after a 2-day counter-move | A04 Ch. IV, VI, VII; A8 BP/SP #9 | `exitRules.ts`: swing-bottom, prior-month and final-stage trails; **live since 2026-09-28** | Aligned | — |
| **"Never fix a target price"**: exit on the stop or a trend-change signal; sell at resistance levels his rules identify | A02 Book II; A04 Rule list | C4 targets from levels; **live since 2026-09-28:** 60% at TP1 (a level), no master order, the rest runs to a Gann exit (`LIVE_EXIT_RULE`, measured as `exitRule: "gann-runner"`) | Aligned | Measure `gann-runner` on the next run |
| Entry confirmation on every path | measured 2026-09-26 (+0.190R vs −0.155R) | **C5:** every path, automation included (`place-order.ts`) | Aligned | Already recommended in AGENTS.md (F3.4 reversal). **Owner** |
| Pyramiding: decreasing lots every 10 points (price-scaled), stop on each add | A02; A03; A04; A05 | **Built 2026-09-28:** `pyramid.ts` (half the last lot at each crossed swing top once the last lot shows a full risk unit, stop to combined break-even, up to four lots); a Portfolio suggestion; measured with `pyramid: true`; Academy 6 lesson. Automated adds not placed | Partial (suggested and measured; not automated) | Automated adds need the exit managers to track more than one entry per plan |
| Reverse signal day; 7–10 Day Rule | A8 1951 pp. 311, 317–318 | **Built 2026-09-28 (G20):** `extremeRules.ts` | Aligned (context, measuring) | Act on it once measured |
| Gap rules (exhaust gap; filled gap reverses the minor trend) | A8 1951 pp. 318–325 | **Built 2026-09-28 (G21):** `extremeRules.ts` (exhaust gap, gaps in new territory, filled-gap reversal; limit days have no equity counterpart) | Aligned (context, measuring) | Act on it once measured |

### 3.5 Volume

| Gann rule | Source | GSPS today | Status | Next step |
|---|---|---|---|---|
| Normal bottoms on *decreasing* volume and narrowing range; climax volume at a low is the panic exception; tops on heavy volume | A2.1 Ch. 12; A09 Ch. X; A8 p. 63; A04 Ch. VII | **Built 2026-09-27 (D1).** `volumeClimax.ts` reads drying-up, lower-volume retests and climaxes; the scored criterion ("Volume at the turn") and the coarse pre-filter pass a low on drying up, a lower-volume retest or a panic climax, and a high on heavy volume or a lower-volume secondary top | Aligned | Measure on the next run |
| Shrinking volume on an equal or lower low = liquidation over | A04 Ch. VII | **Built 2026-09-27 (D1):** `retestOnLowerVolume` | Aligned | — |
| Volume relative to float; ⅔ of float in a week = distribution | A04 Ch. VII; A2.1 Ch. 12 | **Built 2026-09-28 (D2).** `lib/gann/capitalStock.ts` reads weekly volume and range volume against shares outstanding (SEC XBRL, stored in `instrument_profile` and `instrument_shares_outstanding`). The ⅔ week and the plain-top week are a Gann exit for longs in `exitRules.ts` (replay `exitRule: "gann"`); all three readings are on the confluence trace and recorded as context factors | Aligned (exit measured in the replay) | Measure on the next run |
| Shares-per-point efficiency at tops | A2.1 Ch. 12 | **Built 2026-09-28:** `sharesPerPoint.ts`: volume per point on the current up leg against the prior one; nearly double near the high is a top warning | Aligned (context, measuring) | Decide on the next full run |

### 3.6 Risk and money management

| Gann rule | Source | GSPS today | Status | Next step |
|---|---|---|---|---|
| Risk ≤ 10% of capital; equal risk over 4–5 positions | A03; A04; A05 | `lib/risk/*`, `checkPositionLimits` | Aligned (percentage form) | — |
| Series of losses: after 2–3 losses stop and study; cut the unit to 10% of remaining capital | A8 pp. 12, 17, 29; A02; A04 Ch. III | **Built 2026-09-28 (E1):** `lib/risk/lossSeries.ts` pauses new entries after 3 consecutive losses (rest of that day and the next trading day) on every path, paper and live; percentage sizing re-bases the unit after losses. `cooldown.ts` now cites the rule and states that its % thresholds are GSPS's own | Aligned | — |
| Don't increase size after a long winning run | A04 Rule 24 | Verified 2026-09-28: sizing is a fixed % of current equity and nothing raises it on results (the demo's larger-size days alternate by date, not by wins) | Aligned (structure) | — |
| Close all trades twice a year and rest | A02 Book I | **Built 2026-09-28:** a dashboard reminder around June 21 and December 21 (switchable, dismissable); never closes anything; Novice lesson | Aligned | — |
| Reward/risk: don't take a 3–5-point target unless the stop is 1–2 points | A04 Ch. II | plan R:R checks | Aligned | — |
| Never trade in bad health or impaired state | A05 Ch. II | the loss-series pause; a reminder on the order ticket; the Novice lesson on the five qualifications | Aligned (education and reminder) | — |

### 3.7 The trader: education and copy

| Gann rule | Source | GSPS today | Status | Next step |
|---|---|---|---|---|
| Five qualifications; hope and fear as the enemy; prove the rules yourself | A05; A03; A10 | GSPS School: Academy 4 course "The Method's Rules" (2026-09-28), including a lesson on the five qualifications and hope and fear, in our own words | Aligned | A Foundations version would reopen the required academy for existing learners: owner's call |
| Seven Zones of Activity | A02 Ch. XI | **Built 2026-09-28:** `sevenZones.ts` reads the zone from behaviour (the chapter gives no price boundaries): direction, activity against the stock's own year, gaps, the zone-3 first sign of the end; card, trace, four measured factors; Academy 6 lesson | Aligned (context, measuring) | Decide on the next full run |
| Early and late leaders; first-year-high filter; stocks that bottom first top first | A04 Ch. VII | **Built 2026-09-28:** `leadership.ts`: bottomed or topped before/after the market (SPY), and the first-year high | Aligned (context, measuring) | Decide on the next full run |
| Never buy one stock to follow another in its group | A04 Ch. VII | stock-own trend | Aligned | — |
| Dated forecasts: allowed when verified by documentation (owner, 2026-09-28) | all | A forward-looking window may be shown when its source, method and measured record are documented (e.g. the macro-cycle projection from Gann's cited Dow turns, `lib/gann/macroCycle.ts` on branch `claude/stoic-brown-p296wd`, and the F4 calendar test) | Partial | Bring `macroCycle.ts` onto this branch and show its documented windows with their record. **Owner** (the module is on an unmerged branch) |

### 3.8 Astrology, numerology and forecasting

| Item | Source | GSPS today | Status | Next step |
|---|---|---|---|---|
| Planetary averages (helio/geo, 6 planets and the 5 without Mars) | A2.3 1954 letter | none | Missing (research) | AS1: ephemeris library, rule fixed in advance, Dewey test, confluence only |
| Active angles (a planet's longitude and its 90/120/180°) on the Circle Chart | A2.3 | none | Missing (research) | AS2 |
| Jupiter–Saturn aspects; Saturn return; Mars half-return | A2.3; B03; A2.1 1931 lesson | none | Missing (research) | AS3, AS4 |
| Eclipse longitudes | B05 only (not in A02/A04) | none | Excluded until a Gann source is found | C-A4-2 |
| Gann's sacred numbers (3, 7, 9, 12…), digital root | A10; blueprint | `digitalRoot.ts` confluence | Aligned (confluence only) | — |
| Name and letter-count numerology; per-market price-to-degree scales chosen ad hoc | A2.1 Ch. 15A; A03 | none | Excluded | No validatable rule; multiple-comparisons pattern |
| The undisclosed Master Time Factor forecast | A04; A07 | none | Cannot be copied | See Part 1 |

---

## Part 4 — Decisions the owner needs to make first

> **Decided 2026-09-27 (project owner): decisions 1, 2 and 3 are "Gann's method supersedes my own. Implement Gann's method."** X3, X4 and X1 are to be built to Gann's text: swing charts on counter-move duration with trend turns on breaking the last swing extreme; no fixed profit objective, exits on the stop or a Gann trend-change signal and selling only at Gann-derived levels; volume read with the normal drying-up bottom as the rule and the climax as the panic exception. Decisions 4–7, same day: (4) confirmation on every path; (5) always Gann's rules, so Execute needs the breakaway; (6) break-even and trailing stops on Gann's structure; (7) astrology stays research-only, maintained separately. Scores may change so long as they follow Gann. Intraday use to be verified by measurement.

These block or shape the build order. Each is a real choice between "what GSPS does" and "what Gann wrote." Under "WD Gann precedence" the default is Gann's side unless a stated reason says otherwise.

1. **X3 — Rebuild the swing charts to Gann's definition.** This is the most consequential item. Everything trend-related sits on it.
   - Recommendation: yes, as step B1 below, then re-derive the 6/3.5 cutoffs from a fresh replay.
2. **X4 — "Never fix a target price" vs the fixed TP1 and master target.**
   - Recommendation: keep resting targets only at Gann-derived resistance levels. Let the runner exit only on a Gann trend-change signal (hold test, three adverse closes, trailing by the last reaction, over-balance).
   - Measure both on the replay before switching Guided and the demo.
3. **X1 — Volume at bottoms.**
   - Recommendation: option (b). Add Gann's normal-bottom rule (volume drying up, range narrowing) alongside the panic-climax case, and score whichever applies.
4. **Entry confirmation everywhere** (AGENTS.md F3.4 reversal). It's already recommended on measured evidence and pending.
5. **In-range trading vs the breakaway** (A8 p. 52).
   - Recommendation: keep range states as Watch context. Arm Execute only on the breakaway.
6. **Break-even and trailing on Gann's structure** (G23, G24, G18). This depends on decision 2.
7. **Astrology research track: go or no-go.** It needs an ephemeris library dependency. It is confluence only.

---

## Part 5 — Build sequence

The order follows three rules:
- cheapest and most literal rules first
- anything that moves the verdict only after the owner decides, and always followed by a fresh replay
- every new field enters as display/confluence first, then gets measured, and only then may it gate (AGENTS.md "Gann-derived AND measured")

Each step says whether a user waits on it (AGENTS.md "Speed is a product requirement"). All of these are per-symbol computations on bars the scan already loads, so the added scan cost should be small, but it must be measured with the `[market-scan]` breadcrumbs.

**Stage A — literal, cheap, display/confluence only (no owner sign-off needed beyond this plan)**

> **Built 2026-09-27** in one module, `lib/gann/disclosedRules.ts`, shown on the confluence card and in the explanation trace, and never scored. A1–A7 are there as context fields. A8 citation headers were added to `entryTrigger.ts` and `timeCycles.ts`; `spectralCycle.ts` already carried its citations. Deviations from the plan as written:
> - A2 lives in the new module, not `retracement.ts`, so the scored retracement criterion is unchanged.
> - A3 and A6 read from the scan's major pivots without changing `timeCycles.ts`' own windows. `WHEEL_COUNTS` still lacks ⅔ (240 days) and the other ⅛s; A6's ranking includes them.
> - A5 counts completed 3-Day Chart swing extremes within 1% of a level, rather than editing `levels.ts`.
> - **Infused the same day** (owner: "the point of the parity is to align, infuse and implement throughout the platform"): A3/A6's day-count bands and full year fractions now drive `timeCycles.ts`' windows (scanner ranking); A2's three major percentage-of-price levels join the S/R list (level criterion, stops, targets) on the live scan and the replay; A7's weekly/monthly Rule of Three counts in the scored `ruleOfThree` criterion. A1, A4 and A5 act through the trend read and are recorded per backtest trade as `contextFactors` for measurement; they move to the verdict or lifecycle (Stage C) when measured.

- A1 · G1 close vs bar midpoint (per-bar trend read) on the confluence card.
- A2 · G13 percentages of the extreme price as levels in `retracement.ts`.
- A3 · G17 day-count bands from each major pivot in `timeCycles.ts`.
- A4 · The "counter-move clock" (G2/G24 as a context field): days and weeks since the last swing extreme, the campaign's typical reaction length, and the 2nd/3rd-month warnings.
- A5 · G15 level-test counter (2nd, 3rd, 4th test) on `levels.ts`.
- A6 · G8 fraction-of-year ranking on the time windows.
- A7 · Rule of Three on the weekly and monthly charts (display first).
- A8 · C4 citation headers (no behaviour change).

**Stage B — the trend engine (owner decisions 1 and 5)**
- B1 · **Built 2026-09-27** (`STRATEGY_VERSION` `2026-09-27-gann-swing-charts`). Rebuild `swingChart.ts`:
  - daily chart = counter-moves of ≥2–3 bars on highs and lows
  - weekly chart = ≥7 calendar days
  - trend turns on breaking the last swing extreme
  - a price-scaled 9-point variant kept as an option, per A09
  - Re-point `swingChartTrend`, `trendStrength.ts` and `readGannTrend`, and apply it identically in the live scan and the replay (`lib/scan/entrySelection.ts`).
- B2 · **Built 2026-09-27** (`lib/gann/campaignLedger.ts`) and wired into the verdict: over-balance of space or time and the monthly-low break now stop `readGannTrend` confirming a trend, which feeds the macro trend reads, the regime engine and setup direction. The first-year high is computed but rarely available on a year of daily bars. Time balancing is shown and measured, not yet acted on. The **campaign counter-move ledger**: per symbol, each swing's points and duration, the campaign's section count, and its greatest reaction in points and in time. It powers:
  - G3 (the Space Rule)
  - G14 (over-balance of time and space)
  - G6 (monthly-low break)
  - G22 (time balancing)
  - G25 (first-year-high filter)
- B3 · A fresh replay on the new `STRATEGY_VERSION`. Re-derive the Execute/Watch cutoffs. Record the result in AGENTS.md.

**Stage C — lifecycle and exits (owner decisions 2 and 6)**
- Decision 5 · **Built 2026-09-27** (`STRATEGY_VERSION` `2026-09-27-gann-breakaway`). Range setups are Watch context only; Execute in a range-bound market needs the breakaway (the entry crosses the highest top or lowest bottom of the 3-Day Chart's last 13 weeks). Same code on the live scan and the replay; the `breakaway` hold is registered in `criteria-registry.ts`.
- C1 · G4 hold test and three-adverse-closes exit as lifecycle invalidations.
- C2 · G23 break-even on a price-scaled profit threshold.
- C3 · G18/G24 trailing by the last reaction and by the prior month's low; final-stage daily trail.
- C4 · X4 targets from Gann levels only; the runner exits on a B2 trend-change signal.
- C5 · Entry confirmation on all paths (decision 4). **Built 2026-09-27**: `lib/trade/place-order.ts` checks it for every entry carrying the protocol's levels (ticket advised entry, Guided, demo, and automation, per the owner's "automation adheres to the same rules as everything else"), via `lib/lifecycle/confirmNow.ts`.
- Measure C1–C4 on the replay with `entryRule` variants before any production switch.
- C1–C4 · **Built 2026-09-27 for measurement** in one pure module, `lib/gann/exitRules.ts` (`readGannExit`): the hold test (a daily close back under the crossed level by Gann's 3 points, price-scaled by `pointScale.ts` since 2026-09-28; it first used the lost-motion allowance, which run 16 showed was a tenth too tight), three successive adverse closes, break-even after one risk unit of profit (Gann's 3-point stop and 3-point break-even, as a ratio), the stop under each higher bottom since entry and under the prior month's low, the final-stage trail (last reaction's size, prior day after a 2-day counter-move), and exits on a weekly trend change or a campaign over-balance after entry. No fixed target. The replay runs it as `exitRule: "gann"` against the fixed bracket, and the report splits results by exit reason (`exitReasonSplit`). The live exit manager is switched once the replay agrees (decision 4's "if it agrees with our own backtest").

**Stage D — volume and data**
- D1 · **Built 2026-09-27.** Gann's volume rule in full, not only the climax: drying-up bottoms, lower-volume retests and secondary tops, the climax as the panic exception (see the X1 row). The criterion key stays `volumeClimax`; it is unmeasured on the new construction.
- D2 · G7 volume against shares outstanding. **Built 2026-09-28** (owner chose SEC EDGAR as the source). `scripts/fetch-instrument-reference.mjs` fetches once; migration 0083 stores it (applied to production). `lib/gann/capitalStock.ts`: the ⅔-of-the-stock week at a top, the week turning over almost all of it (a plain top), and the whole stock trading inside a range after an advance. The first two are a Gann exit for longs (`exitRules.ts`, measured with `exitRule: "gann"`). Live scan and replay read the same code; the replay uses the count filed before each session, restated for splits. Rule 21 (small float for longs, large for shorts) is now unblocked but not built. **Loaded to production 2026-09-28:** 802 symbols matched to SEC, 665 with a share count, 30,034 history rows. Refresh with `--apply` after each 10-Q season.
- D3 · G10 time from the company's inception. **Built 2026-09-28** (owner chose Wikidata). `lib/gann/incorporationCycle.ts`: the anniversary, Gann's own U.S. Steel seasonal degrees (his printed dates are the test fixture) and the 5–60-year cycles. Context only, like the fixed calendar, since Gann gives these dates no direction. Of 817 universe symbols, 582 have a date, but only 135 to the day (426 are year-only, giving cycle years only). Wikidata's date is usually the founding, not the incorporation Gann names. **Loaded to production 2026-09-28:** 582 dates (135 day, 21 month, 426 year).

**Stage E — risk and education**
- E1 · G16: cite Gann in `cooldown.ts`, align the thresholds (owner), and add "don't size up after a winning run." **Built 2026-09-28:** `lib/risk/lossSeries.ts` on every placement path; the % breaker is documented as GSPS's own; no result-based size increase exists.
- E2 · GSPS School lessons for the disclosed rules users now see in the product: time rules, the Rule of Three, the 3-point rule, sections, over-balance, the Seven Zones, early and late leaders, and why forecasts are measured. **Built 2026-09-28:** a four-lesson course in Academy 4 (advisory for Pro/Expert, so no required academy reopens for existing learners). The Seven Zones and the trader's qualifications lessons followed the same day.

**Stage F — timing refinements and research**
- F1 · G9 7/14-day alternation; G20 reverse signal day and 7–10 Day Rule; G21 gap rules; G11 Square of 144 convergence; G12 projection dispersion.
  **Built 2026-09-28** as context on the card, lines in the explanation trace, and measured factors in the replay (`extremeRules.ts`, `timeConvergence.ts`, seven new `contextFactors`). None changes a verdict until the replay measures it. Adds about 0.2 ms per scanned symbol.
- F2 · The astrology track AS1–AS4 (decision 7): ephemeris, a rule fixed in advance, Dewey's full test, confluence only.
- F3 · Measurement upgrades M1–M7 throughout (Schuster test, out-of-sample, regime splits, base rates).
  **2026-09-28:** M1 Schuster p in `spectralCycle.ts`; M2/M3 the backtest report now repeats both factor tables for the early and late half of the window (`halves`); M4/M6 every calendar and timing field is a measured context factor against the unconditioned population; M5 labelled; M7 recorded. The remaining M1/M2 items (cosinor interval, log detrending, artifact guards, 70/30 hold-out) were built the same day in `spectralCycle.ts`; the extra checks run only when a cycle clears the dominance threshold, so the common case costs one scan as before.
- F2 · Stays research-only and separate (decision 7). F4 · Unblocked 2026-09-28: Stages A–E are built (D2/D3 landed via #300).
- F4 · **Done 2026-09-28:** `F4_CYCLES_CALENDAR_RESEARCH.md`. The equinox anchor is plausible as a forced-cycle anchor but unproven against Jan 1 for equities; Gann's missed forecasts are explained by average-vs-specific timing, phase loss after shocks, beats and fractional periods, without deciding whether the cycles are real; the 100-year cycle fails repetition count and the 20-year cycle is best read as a ~16–22-year window; Tomes supports Gann's 2×3 divisions but not his order below the quarter. A pre-registered test (three year conventions × three window sets × two series, Holm-corrected) is designed, not run; four roadmap edits are proposed there for the owner.

---

## Part 6 — How we'll know parity is reached

A disclosed rule counts as copied only when all four hold:
1. **Implemented as written.** The code header cites the source and tier and states any scaling of Gann's literal numbers.
2. **Present on every surface it applies to**: the live scan, the replay, confluence, the coarse pre-filter, lifecycle, the School (AGENTS.md cross-platform consistency).
3. **Measured.** It has an entry in `lib/validation/criteria-registry.ts` if scored, or a hit-rate-vs-base-rate check if it is a calendar or confluence field. An inverted result is treated first as a porting bug, per AGENTS.md.
4. **Recorded.** The master report's matrix row moves to Aligned, with the commit.

When every row in Part 3 reads Aligned, Research-only (with its reason) or Excluded (with its reason), GSPS runs every rule Gann disclosed. That is the most faithful copy the surviving record allows.

---

## Part 7 — Three-question basis for this roadmap

1. **Gann:** every row cites its Tier A source. Tier B material appears only where it quotes Gann (the 1954 letter via B05) or as a counter-example.
2. **Dewey and Tomes:** every time item is a periodicity or recurrence claim. That is why Stage A ships them as confluence first and F3 measures them against base rates and out of sample before any can gate. The 1929/1940 forecast record (M7) is the concrete reason.
3. **Hermetic:**
   - **Correspondence** is the organising principle. Gann applies the same rule at daily, weekly and monthly scale, and GSPS must apply it on every surface. That is Part 6's second test.
   - **Cause and Effect** orders the build. The trend engine (cause) is fixed before the exits and cutoffs that depend on it (effects).
   - Rhythm and Polarity are subjects of individual rows (cycles; long/short mirrors), not the plan's method.
   - Mentalism, Vibration and Gender don't describe a build order.
