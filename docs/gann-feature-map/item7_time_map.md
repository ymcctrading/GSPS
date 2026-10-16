# Item 7 map: Gann's time rules (A-TIME, C-TIME, plus other time-bearing entries)

This is a read-only analysis of `/home/claude/gsps-item5s4`, branch `item5-step4`, at `984a7da` ("Item 6 review fixes").

**Sources:**
- `gann_features.json`: 35 A-TIME and 42 C-TIME entries;
- `PLAN.md` "Full parity order", item 7: "Time: counts, fractions, anniversaries and bear-market durations act on the verdict where Gann acts on them, not as card context only";
- `claude-progress.txt`;
- `docs/gann-feature-map/item6_trend_map.md`;
- `docs/memory-bank/GANN_PARITY_ROADMAP.md` §3.1;
- the detailed notes for W006, W003, W022, W036, W046, W032 and W033 under `/mnt/project-files/literature-reading-output/works/`;
- the long-book checkpoint at `/mnt/project-files/literature-reading-output/external/checkpoint_latest/unzipped/literature-reading-output/works/`. Its numbering differs: W001 = *How to Make Profits in Commodities* (HTMPC), W005 = *Truth of the Stock Tape* + *Wall Street Stock Selector* (WSSS), W009 = *45 Years in Wall Street*, W023 = Master Stock Market Course.

Line numbers are for `984a7da`.

**Status:**
- `STRATEGY_VERSION` today is `2026-10-16-gann-trend-review` (`lib/backtest/strategyVersion.ts:164`).
- Today is 2026-10-16, roadmap phase Q1. Item 7 is out-of-phase parity work (PR phase `N/A`, direct owner request).

**Tests run** (all pass, 12 files, 113 tests): `disclosedRules`, `gann`, `cycle-ranking`, `missingRules`, `extremeTiming`, `angleMonthCounts`, `squareOf52`, `campaignLedger`, `boilingPoint`, `decadeCycle`, `macroCycle`, `incorporationCycle`.

## 0. How GSPS reads time today (verified)

| Step | Code | What it does | Wiring |
|---|---|---|---|
| Time windows | `lib/gann/timeCycles.ts:172-243` `timeCycles(dailyBars, asOf, windowDays=2)` | Anchors are `majorPivots(findPivots(bars,5)).slice(-12)`. From each anchor it counts `WHEEL_COUNTS` [45,90,120,135,180,225,240,270,315,360] (l.69) ±2 days, `DAY_COUNT_BANDS` (l.76-86) and `MAJOR_CYCLE_YEARS` [1,2,3,5,7,10,15,20,30,50,60] (l.112) anniversaries, plus `FIXED_CALENDAR_WINDOWS` (l.119-132: 10 windows, 8 from A04's permanent calendar plus 7/22-24 and 11/21-23). A low anchor gives a bullish window, a high anchor a bearish one. | Live: `scanTicker.ts:180` (wall clock). Replay: `replay.ts:566` (`asOf`). Card fields `scanTicker.ts:218-225`, `replay.ts:618-623`. |
| Year-cycle convergence | `timeCycles.ts:275-292` `yearCycleConvergence(monthlyBars, asOf)` | Exact-month match of `majorPivots(findPivots(monthly,3))` at 1..60 years. | Live: `scanTicker.ts:183`, plus the shortlist re-rank in `marketScan.ts` (~l.812 `rankShortlist`, `YEAR_CYCLE_BONUS_CAP` 2, l.982). Replay: `replay.ts:1390-1406` `yearCycleHitsAt`, measurement only. |
| **Coarse cycle bonus** | `lib/marketScan.ts:365` `CYCLE_WINDOW_BONUS=1`, `:367` `cycleBonus`, used at `:456` (reversion) and `:522` (continuation), from `timeCycles(daily)` at `:953` | +1 to the coarse score when any window is active. | **Live only.** The replay has no coarse pass, so this effect never reaches a replay. This is a cross-platform gap (AGENTS "Cross-platform consistency"). |
| Counter-move clock | `lib/gann/disclosedRules.ts:294` `counterMovePhase` (≤21 normal, ≤30 extended, ≤60 secondMonth, else thirdMonth); `:301-317` `readCounterMove` | Trend from the weekly 7-day chart; counter swing from the 3-Day Chart; days counted from the last pivot. | Context (`contextFactors.ts:42-51`), live via `lib/signals/confluence/gann.ts:256`, replay via `replay.ts:639`. **Measured:** `counterMoveBeyondFirstMonth` −0.215R, as Gann predicts (`docs/replay-runs/2026-09-27-766sym-NOTES.md:136`). |
| Day-count bands, year fractions | `disclosedRules.ts:242` `readDayCountBands`; `:207-218` `YEAR_FRACTIONS` (360 anniversary rank 1, 180 rank 2, 90/270 rank 3, 120/240 rank 4, eighths rank 5; `FRACTION_WINDOW_DAYS` 2); `:255` `readYearFraction` | | Context only (`contextFactors.ts:92-94`). `yearFractionMajor` is a positive lead on a small sample. |
| Seasonal counts | `lib/gann/seasonalCounts.ts` `SEASONAL_POINTS` | Points from 21 Mar: ½ = 22 Sep rank 1; full year rank 1; ¼ and ¾ rank 2; ⅓ and ⅔ rank 3; eighths rank 4 (⅛ = 5 May). Tolerance 2 days. | Context (`contextFactors.ts:109-112`). **Measured:** `seasonalCountMajor` −0.078 (n 621), inverted. |
| Time rules | `lib/gann/timeRules.ts:48-73` `readTimeRules` | Halt of 2 or 3 sessions in a 20-session window; `reactionInZone` 8-21 days; `thirdWeek` 14-21 days; `abnormal` over 28 days. | Context (`contextFactors.ts:124-131`). |
| Timing convergence | `lib/gann/timeConvergence.ts` `readTiming` | `ALTERNATION_DAYS` 7/14/21 ±1 from the last 3-Day pivot; `square144` from the year's extreme (within 365 days); projection dispersion. | Context only. |
| Time balance | `lib/gann/campaignLedger.ts:257-262` `timeBalanceDates` | Projects the matching prior leg's duration. | Context (`contextFactors.ts:142-145` `onTimeBalanceDate`). |
| **Time over-balance (acts)** | `campaignLedger.ts:219-220` `timeOverbalanced` (current counter-move days > campaign's greatest); `:224-226` `trendDays`/`counterDays` | Feeds `trendStrength.ts:171-173` `changing`, which nulls the trend read. Also an exit (`exitRules.ts:174`). | **Moves the verdict** on every `readTrend` surface, live and replay. This is the one place time already acts. |
| **Item 5 hold durations (act)** | `lib/gann/entryTrigger.ts`: `HOLD_WEEKS_MIN_DAYS=8` (l.406), `HOLD_DAYS_MIN_SESSIONS=2` (l.408), `BULL_REACTION_DAYS=[8,21]` (l.410), `counterMoveSince` (l.594), `bearRallySell` (Friday, 8-21 days), record hold of 28 days | Durations gate buying and selling points. | Prices and arms plans, live and replay. |
| **Hold-time exit (acts)** | `lib/gann/exitRules.ts:148-157` `three_adverse_closes` | Exits when each of the first three sessions from the fill closes against the trade. | Live (`lib/trade/gann-exit-live.ts`) and replay (`exitRule` `gann`/`gann-runner`). |
| Scored | `lib/gann/timePriceSquare.ts` `computeTimePriceSquare` | One point = one ATR, 4-bar tolerance. | `timePriceSquare` criterion. |
| Card-only cycles | `macroCycle.ts` (DJIA anchors; context, Δ+0.10 on 1h bars and Δ+0.24 on daily, but the same for every symbol on a date), `decadeCycle.ts:93`, `incorporationCycle.ts:100` (`contextFactors.ts:175-183`), `boilingPoint.ts:58`, `accumulation.ts:46`, `angleMonthCounts.ts` (`monthsElapsed` l.86, calendar-month difference; runs on about 1 year of daily bars), `squareOf52.ts:68/95`, `masterTwelve.ts:27-32` `HALVING_CHAIN`/`GREAT_CYCLE`, `:85` `squareMonthsFromPriceRange`, `fans.ts` `timeProjectionDate` (`ANGLES` l.37) | | Card or `contextFactors` only. |
| Events | `lib/signals/regime.ts:46/78/87` `scheduledBinaryEvent` | The regime becomes "event" and stands aside. | Display tier and plan expiry. |
| Monthly bars | `lib/gann/leadership.ts:88` `MONTHLY_REACTION_CHART {kind:"bars",count:2}`, `:118` `monthlyWithCurrent`, `:136-147` `marketBullStart`; `lib/data/marketBenchmark.ts:41` `getMarketMonthlyBars` (SPY, 10y); `lib/backtest/run.ts:440` `marketMonthlyBars` | A 2-bar monthly reaction chart already exists. `marketBullStart` can be mirrored as `marketBearStart`. | Live and replay both have SPY monthly bars. The replay's per-symbol monthly bars are daily rollups (`replay.ts:40-49`). |
| Template for a time hold | `lib/scoring/score.ts:707-727` `applyMonthlyBreakHold` (Execute → Watch), wired `scanTicker.ts:412`, `replay.ts:1329` | The established pattern for adding a hold. | Live and replay through one function. |
| Copy | `lib/school/curriculum.ts:961` | Says "A reaction that reaches a third month is treated as a change of trend". | **Copy ≠ code**: the code only records this as context. Line 962 says windows are "never a reason to trade on their own". |

**Base-rate warning (CYC-24, CYC-51).**
- `timeCycles` combines 12 anchors × (10 wheel counts ±2 days + 11 cycle-years + 9 day-count bands) + 10 calendar windows.
- The bands alone cover about 67 of the first 185 days after a pivot.
- So "some window is active" is near-always true. Any window that is to gate needs its own base rate measured first.
- The F4 calendar test on 2019-2025 found that no window set beats random placement. AGENTS records that the windows stay context.

**Constraint on class C additions.**
- Adding values to `WHEEL_COUNTS`, `DAY_COUNT_BANDS` or `MAJOR_CYCLE_YEARS` changes live coarse ranking (`cycleBonus`) and the shortlist re-rank. That is a verdict change on the live surface only.
- Adding angles to `fans.ts` `ANGLES` changes `normalizedSlope`, which feeds the quarantined scored criterion `gannAngleSlope`.
- So every class C count must live in **separate lists** read only by `contextFactors` and the card.

## 1. A-TIME entry-by-entry map

Legend for "Today": (a) prices or arms plans, (b) scored, (v) moves the verdict another way (direction, hold, gate, ranking), (c) context or card only, (e) nothing.

Surfaces: **LS** live scan, **CP** coarse pre-filter (live only), **RP** replay, **CF** confluence/card/contextFactors, **EX** exits, **SCH** school copy.

### A-TIME-01: a bull-market reaction runs no more than 2-3 months; resumes in the third (a falling stock keeps falling in the third)
- **Rule:** "In a bull market a rising stock reacts no more than 2-3 months and resumes in the third; a falling stock keeps falling in the third month." **Source:** W006 p.38. **Class A.** `passes: false`.
- **Gann's action:** he calls a reaction running into the third month a change of trend.
  - WSSS Ch.IV monthly time rule: "strong stocks seldom ever react into the 2nd month; stop under the previous month's low; if into the 2nd month, watch the 3rd or 4th".
  - HTMPC p.56: "in big upswings a reaction will not last more than 2 months".
  - HTMPC p.51 Time Period rule and Master Course: a reaction longer in time than the greatest previous one means the trend has changed.
- **Today (c):**
  - `readCounterMove` / `counterMovePhase` on daily bars; phases in days (61+ = thirdMonth). Context only, on LS, RP and CF.
  - Measured −0.215R beyond the first month, the sign Gann predicts.
  - The separate time over-balance in `campaignLedger.ts:219` does act, but against the campaign's greatest counter-move, not against a fixed month count.
- **Gap:** nothing acts when a counter-move reaches its third month. The curriculum (`:961`) already says it does.
- **Smallest change (fork F2):**
  - A monthly counter-move clock on the 2-bar monthly reaction chart (`leadership.ts:88` `MONTHLY_REACTION_CHART`, rolled from the same daily bars live and in replay).
  - When the counter-move makes a new extreme in its 3rd calendar month, the monthly read's `changing` is set (option b).
  - Or, under option a, with-trend Execute is held to Watch through an `applyThirdMonthHold` modelled on `applyMonthlyBreakHold`, wired `scanTicker.ts:412` and `replay.ts:1329`.
- **Moves the verdict:** yes. Bump `STRATEGY_VERSION` and run a 766-symbol replay. Align `curriculum.ts:961`.
- **Failing test first:** `lib/gann/__tests__/disclosedRules.test.ts` (or a new `monthlyCounterMove.test.ts`). On a bullish weekly and monthly trend, a reaction making a new low in its third calendar month sets `changing`, or holds Execute. A reaction that resumes in month 2 does not.

### A-TIME-02: a bear rally of only 6-7 weeks, or no more than two months, is weak; one that cannot reach its third month is weak
- **Rule:** as written. **Source:** W006 p.38. **Class A.** `passes: false`.
- **Gann's action:** the mirror of -01 (Polarity). Master Course: bear rallies last 2-4 weeks.
- **Today (c):** `readCounterMove` on a bearish weekly trend uses the same day thresholds. The test is TO WRITE: no test covers the bearish side.
- **Smallest change:** same build as -01, with the mirror test. A bear rally that makes a new high in its third month sets the bearish read's `changing`.
- **Moves the verdict:** yes, together with -01.
- **Failing test:** `readCounterMove` on a bearish weekly trend with a 45-day rally reports `inCounterMove=true`, phase `secondMonth`. The monthly mirror of -01's test also applies.

### A-TIME-03: a first rally out of a bear that cannot go higher in its third month on large volume is only a first rally; a real bull rises three full months or more
- **Rule:** as written. **Source:** W006 pp.14, 43. On p.43, there was no rally of more than two months from Apr 1930 to Jul 1932. **Class A.** `passes: false`.
- **Gann's action:**
  - HTMPC pp.39-40, buying point 4: the first rally from an extreme bottom exceeds the Bear-Campaign rallies.
  - Buying point 5: the time period exceeds the last rally's.
  - Master Course, time version: the first rally lasts longer than the greatest bear rally.
- **Today (e):** no rule on the duration or volume of the first advance.
- **Smallest change:**
  - A `firstRally` label on the campaign ledger: from the bear low, advance months ≤ 2 = first rally; ≥ 3 full months = real bull. Context.
  - The "time version" (first rally longer than the greatest bear rally) is a time over-balance of the prior campaign. It acts through the -01/-02 build and the existing `timeOverbalanced`, not separately.
  - Volume reuses `volumeClimax` as context.
- **Moves the verdict:** no for the label; any verdict effect comes through -01/-02.
- **Failing test:** an advance out of a bear that stalls before its third month on heavy volume is labelled `firstRally`. One that runs three full months is labelled `bull`.

### A-TIME-04: watch for a change in trend one, two and three years from any important top or bottom
- **Rule:** as written. **Source:** W006 pp.14, 44 ("My rule tells you to always watch for a change in trend one year, two years, etc."). **Class A.** `passes: false`.
- **Corroboration:** HTMPC p.58 (anniversaries 1, 2, 3 years; 18/24/30/36/42/48 months); 45Y R10 (1-5 years; 15, 22, 34, 42, 48, 49 months).
- **Today (v, live only; c in replay):**
  - `MAJOR_CYCLE_YEARS` includes 1, 2 and 3.
  - `timeCycles` adds `cycleBonus` to live coarse ranking; `yearCycleConvergence` re-ranks the live shortlist.
  - The replay measures these but does not rank by them.
- **Gap:** "watch" acts only as live ranking. Whether it should do more is fork F1.
- **Smallest change now:** a pin test. Stating or closing the live/replay asymmetry is build step 8.
- **Failing test (pin):** `lib/__tests__/gann.test.ts`. `timeCycles` marks a window active exactly 1, 2 and 3 years after a major low and after a major high, each within `windowDays`, with low = bullish and high = bearish.

### A-TIME-05 and A-TIME-21: count months from each major top and bottom (1936: 42/37/36/48; coffee 19 Mar 1954: 9/2/6/5)
- **Rules:**
  - A-TIME-05, W006 p.15: "Count months from each major top and bottom to find periods to watch".
  - A-TIME-21, W046 p.2: "Count the months from each prior pivot to the current turn".
  - Both class A, `passes: false`.
- **Today (c):** the `angleMonthCounts.ts:86` `monthsElapsed` helper exists (DJIA 1896-1935 test). No list of month counts from every prior pivot exists. `angleMonthCounts` runs on about a year of daily bars, card only.
- **Smallest change:**
  - `monthCountsFromPivots(monthlyBars, asOf)` returns `{pivot, kind, months}` for each `majorPivots(findPivots(monthly,3))`.
  - Live on 10 years of monthly bars; replay on monthly rollups.
  - Feed `contextFactors` (e.g. `monthCountOnCycle`, any count equal to 12, 24 or 36 or in the 45Y R10 list) and the card.
- **Moves the verdict:** no (context). It becomes an input to F1's option (b) later.
- **Failing test:** the coffee case. Given the five pivots (19 Jun 1953 low, 15 Sep, 19 Oct high, 19 Jan, and so on) and 19 Mar 1954, the list returns 9, 2, 6 and 5. The 1936 case returns 42, 37, 36 and 48.

### A-TIME-06: bear markets last 12 to 43 months; from a top, watch for a bottom at months 30-36, then 40-43
- **Rule:** as written. **Source:** W006 p.13. **Class A.** `passes: false`. `gsps_location: none`.
- **Gann's action:**
  - p.13 lists bear durations of 53, 30, 36 and 43 months.
  - "Greatest no more than 43 months, shortest 12; culminations near 27, 30, 34, 36-43"; from 1929, watch for a bottom at the 30th-36th month, then the 40th-43rd.
  - pp.15-16: the 1929-32 losses came from buyers thinking stocks were cheap while "the time period had not run out".
- **Conflicts:**
  - The 53-month figure on the same page contradicts "no more than 43".
  - Master Course Ch.10B gives the greatest bear as 34 months 5 days (fork F3).
- **Today (e).**
- **Smallest change:**
  - `readBearDuration(marketMonthly, asOf)` with a `marketBearStart` that mirrors `leadership.ts:136-147` `marketBullStart`.
  - Returns months since the bear top, `inBottomWindow` (30-36 or 40-43) and `beforeShortest` (< 12).
  - Context, live (`getMarketMonthlyBars`) and replay (`run.ts:440` `marketMonthlyBars`).
  - Whose bear is fork F4.
- **Moves the verdict:** no, unless F1 (b) uses `beforeShortest` / "time not run out" as a hold on long reversions in a market bear.
- **Failing test:** `lib/gann/__tests__/bearDuration.test.ts`. A projector anchored on a major top flags months 30-36 and 40-43 as bottom windows, and months 1-11 as `beforeShortest`.

### A-TIME-07: bull campaign lengths repeat (97 vs 99 months) [research-only]
- **Source:** W006 pp.9-12. **Class A**, research-only and confluence-only.
- **Action:** do not build into the verdict. At most a pin test confirming no consumer exists. **Held.**

### A-TIME-08: late tops make late bottoms; each stock keeps its own time period
- **Source:** W006 pp.31, 35-37. **Class A.** `passes: false`.
- **Today (c):**
  - `timeCycles` anchors on each symbol's own `majorPivots`, which satisfies "its own time period".
  - `leadership.ts` `readLeadership` has `toppedFirst` and `bottomedLate`.
- **Gap:** no test asserts the rule.
- **Smallest change:** pin test only. `readLeadership` marks a stock that topped well before the market as `toppedFirst`, and one that bottomed after it as `bottomedLate`. Two symbols with different pivots get different `timeCycles` windows.
- **Moves the verdict:** no.

### A-TIME-09: accumulation takes time; wait for a definite buying signal, don't anticipate
- **Source:** W006 p.39; W036 p.12. **Class A.**
- **Today (a):** item 5's buying points, entry confirmation (`entryConfirmation.ts`, `confirmNow.ts`, `place-order.ts`) and `accumulation.ts` context already satisfy "wait for a definite signal". An existing test asserts that an initial break alone never confirms.
- **Smallest change:** pin. Consider marking this entry `passes` on review.
- **Moves the verdict:** no.

### A-TIME-10, -13, -14, -20, -24, -25, -26, -29, -34, -35, -40: UNDISCLOSED
- These are the Master Time Factor, the three curves, Cycle Theory, two bull/two bear years, the Master and Great Time Cycles, transition periods, the Master Calculator, harmonic projection, founding anniversaries and ages, and the relative position of price to time.
- **Never built** under the pass rule.
- Code stand-ins exist and stay as they are, labelled stand-ins:
  - -29: `spectralCycle.ts`;
  - -34/-35: `incorporationCycle.ts`;
  - -40: `timePriceSquare.ts`, scored. It is the stand-in for an undisclosed rule; its legitimacy rests on C-TIME-04, which is UNVERIFIABLE (see §4).

### A-TIME-11: a panic about every 20 years [research-only]
- **Source:** W006 pp.49-50, quoting WSSS pp.203-204.
- 20 is already in `MAJOR_CYCLE_YEARS`.
- Pin test: a 20-year-old major low activates a window, and nothing in `score.ts` reads it. **Held** from the verdict.

### A-TIME-12: hold time (loss at the first close suggests you are wrong; three closes against = get out; profit after three days = with the trend)
- **Source:** W006 p.23. **Class A**, merged with A-EXIT-01. `passes: false`. The item-1 sweep marked it FAIL because only the exit clause is built.
- **Today (EX):** `exitRules.ts:148-157` `three_adverse_closes`, live and replay. Not built:
  - the first-close warning;
  - "profit after three days means with the trend".
- **Gann's action for the third clause:** HTMPC/W006 Rule 5 pyramids only with the trend. A position showing profit after three days is the one that may be added to.
- **Smallest change:**
  - `readHoldTime(fills, bars)` returns `firstCloseAgainst` (a warning, shown on the position) and `withTrendAfter3` (three sessions in profit).
  - Gate pyramid add suggestions and the replay's pyramid on `withTrendAfter3` (fork F6).
- **Moves the verdict:** not the entry verdict. It moves pyramid suggestions and the replay pyramid. If the replay's pyramid moves trades, bump `STRATEGY_VERSION` and run a replay.
- **Failing test:** `lib/gann/__tests__/exitRules.test.ts`:
  - a fill whose first close is against the trade reports `firstCloseAgainst`;
  - a fill in profit at each of the first three closes reports `withTrendAfter3`;
  - a pyramid add before that is refused.

### A-TIME-15: trade the dates, not the price: when the market turns near a forecast date, buy or sell regardless of price
- **Source:** W036 p.22. This is Gann's only explicit act-verb on dates. **Class A.**
- **Today (c):** calendar and anniversary windows are context only, by AGENTS (F4 null result).
- **Action:** fork F1. The recommended staged option (b) is in §5. A pin test now: a turn inside an active window changes nothing by itself (it documents today's rule and flips when F1 lands).

### A-TIME-16: change dates alternate high and low
- **Source:** W036 pp.7, 22. **Class A.**
- **Today (c):** `readTiming` alternation 7/14/21 days from the last 3-Day pivot. There is no forecast-date list with polarity.
- **Smallest change:** context only.
  - When a low prints on a projected high date, the next projected date is labelled an expected high.
  - The base-rate problem applies, so it never gates.
- **Failing test:** `extremeTiming.test.ts`, as in the feature's TO WRITE.

### A-TIME-17: rank change dates; dates marked X are the most important
- **Source:** W036 p.13. Gann does not disclose how dates get their X.
- **Today (c):** ranks come from other sources (`SEASONAL_POINTS`, `YEAR_FRACTIONS`); an existing test covers them.
- **Action:** pin only. The X basis cannot be built.

### A-TIME-18: the major grain change dates are Mar 20-24, Jun 21-23 and Sep 20-24
- **Source:** W036 p.22.
- **Today (c):** `FIXED_CALENDAR_WINDOWS` with ±2-day widening gives Mar 19-25, Jun 18-26 and Sep 19-26, which covers all three ranges.
- **Action:** a pin test asserting that each grain date range is inside an active window.
- **Moves the verdict:** no.

### A-TIME-19: separate change-date calendars for rails and industrials
- **Source:** W036 p.7. **Class A.**
- **Today:**
  - Per-symbol pivot windows already differ by symbol.
  - The fixed calendar fires the same dates for everyone. The group dates themselves are undisclosed.
- **Action:** pin test (two symbols with different pivots get different windows). The per-group fixed calendar is not buildable without the dates.

### A-TIME-22: each market has recurring important dates each month (coffee 1st, 15th, 18th, 19th)
- **Source:** W046 p.2. The per-instrument dates cannot be derived (the 5860/5660 discrepancy on the same page is unresolved).
- **Option (fork F0):** WSSS Ch.IV (1-3, 10, 15, 20-23) and HTMPC p.58 (6-7, 9-10, 14-15, 19-20, 23-24, 29-31) give general days-of-month lists. A new entry from those sources could be built as context. Otherwise hold.
- **Moves the verdict:** no.

### A-TIME-30: a 'time' = 360, half a time = 180
- **Source:** W022 p.371. Contradicted on p.372, where a time is a score of 20 years.
- **Status:** item 2 review: still FAIL. No 360/180 assertion exists, and years and degrees are not built.
- **Smallest change:**
  - A test that `YEAR_FRACTIONS` ranks 360 as anniversary rank 1 and 180 as half, rank 2, and that `WHEEL_COUNTS` contains both.
  - Record the p.372 contradiction in the module header (fork F5: keep 360).
- **Moves the verdict:** no.

### A-TIME-31, -32, -33: day-for-year; founding-date counts; Daniel's 1,290/1,335 [research-only]
- **Source:** W022 pp.213, 370-374.
- **Held.** At most a research-only module with no consumer and a test that no scoring code imports it. Not recommended now.

### A-TIME-36: turns on scheduled report dates
- **Source:** W022 pp.195-197, 217. The source is a novel (*Tunnel Thru the Air*), so it is weak.
- **Today:** the regime stands aside on `scheduledBinaryEvent`.
- **Smallest change:** a context `turnDate` field next to the event flag. Not urgent.

### A-TIME-37: swings of a fixed duration (about thirty days up; a ten-day wheat cycle)
- **Source:** W022 pp.145, 195.
- **Today (c):** the 28-31 band in `DAY_COUNT_BANDS`.
- **Action:** pin. Day 30 from a pivot falls in the 28-31 band.

## 2. C-TIME table (class C stays context-only and never gates)

"Held" means UNVERIFIABLE: kept until the reading lands (fork F0). "Build" lists the context field; each goes in its own list, never into `WHEEL_COUNTS`, `DAY_COUNT_BANDS`, `MAJOR_CYCLE_YEARS` or `ANGLES`.

| Id | Rule (short) | Source / status | Today | Smallest change | Verdict? |
|---|---|---|---|---|---|
| C-TIME-01 | Most moves last 3 units (days, weeks, months) | W003 p.15; UNVERIFIABLE | `ruleOfThree` counts closes, not move duration | Held. Corroborated by WSSS Ch.IV (2-3 days, 2-3 weeks) and the third-month rule | — |
| C-TIME-02 | Divergences don't time a turn; cycles do | W003 p.16; C | Consistent by absence | Pin: no `CRITERION_KEYS` entry or gate reads a price/oscillator divergence | no |
| C-TIME-03 | Short on a high-volume range break at a cycle expiry | UNVERIFIABLE | Pieces exist separately | Held | — |
| C-TIME-04 | Squaring of time and price | UNVERIFIABLE | **Scored** `timePriceSquare` stands on this | Held. Flagged in §4: a scored criterion rests on an UNVERIFIABLE entry | — |
| C-TIME-05 | Seasonal dates plus about 15 days later | UNVERIFIABLE | 5-6 Jan, 5 Feb, 6 May, 7 Jul and 8 Aug are absent or only partly covered | Held | — |
| C-TIME-06 | 30…360 calendar-day counts incl. 210, 330 | UNVERIFIABLE | 210 and 330 absent from `WHEEL_COUNTS` | Held. Master Course Ch.5 (30, 60, 120, 150, 210, 240, 300, 330, 360) corroborates it, so it is a strong F0 candidate | — |
| C-TIME-07 | Trading-day 11.25 grid | UNVERIFIABLE | Grid exists in months only | Held | — |
| C-TIME-08 | 13/26/39/45/52/78 weeks; the 7th week | UNVERIFIABLE | 45 and 78 absent | Held | — |
| C-TIME-09 | 6, 12, 144 months | W003 p.18; C | No explicit count | Build `monthCountsC` (6, 12, 144) in a separate list, read from -05's `monthCountsFromPivots` | no |
| C-TIME-10 | Day = degree; the 45…360 key counts | C; **passes** | `WHEEL_COUNTS` identical | Done | — |
| C-TIME-11 | Two kinds of cycle (taxonomy) | C | — | Nothing to build | — |
| C-TIME-12 | Fractions of any cycle (30 years → 3.75, 7.5, 10) | C | Fractions apply only to the 360-day/52-week year | Build `cycleFractions(years)` as context; test 30 years → 3.75, 7.5, 10 | no |
| C-TIME-13, -14, -15, -16, -17 | Squares of 52, 90, 12/9, 144; the 20,736 halving chain | UNVERIFIABLE | Partial (`squareOf52`, `masterTwelve`, `square144`) | Held | — |
| C-TIME-18 | 3rd-4th day; 2-3-week reactions; days 7, 14, 21 | C | `readTiming` alternation and `timeRules` | Pin test that alternation marks 7, 14 and 21 | no |
| C-TIME-19 | 23 days (1/16); 49 days; 42 → 45-46 | C | 23 is not a window; 49 only as a band top | Build a separate `cDayCounts` [23, 49, 45-46] list. HTMPC p.57 (49th-52nd, 42nd-45th) corroborates it | no |
| C-TIME-20 | Year cycles 90/60/…/5; combining a third with a half/quarter | UNVERIFIABLE | No 90-year cycle | Held | — |
| C-TIME-21 | 39, 17, 35 weeks | C | 35 absent | Build a separate weekly list including 35. Master Course Ch.6 (35-36 weeks) corroborates it | no |
| C-TIME-22 | Price as time units | UNVERIFIABLE | `squareMonthsFromPriceRange`, no consumer | Held | — |
| C-TIME-23 | 50% of the range at 50% of the time → a 3-month fast move | C | None | Build `halfPriceHalfTime` context on `timePriceSquare`'s inputs, with a pre-registered tolerance | no |
| C-TIME-24 | Decade digit character | UNVERIFIABLE | `decadeCycle.ts`, card only | Held | — |
| C-TIME-25 | Counter-trend 3-4 days (indices) / 3-5 (stocks); next 7-10 | C | GSPS's "normal" runs to 21 days | Build `shortCounterMove` context: day 5+ = past normal, 7-10 = the next counter-move | no |
| C-TIME-26, -27 | 5-year smallest cycle, the 59th month; campaigns ≤ 3-3½ years, the 23rd month | UNVERIFIABLE | Partial | Held. Master Course (campaigns ≤ 3-3½ years; culminations in months 23-24, 34-35, 41-42…) corroborates -27, so it is an F0 candidate | — |
| C-TIME-32, -33, -34 | Fourier analysis, composite projection, weekly midpoint input | C | `spectralCycle.ts` stand-in | Defer to item 12 (cycle research) | — |
| C-TIME-35 | Jupiter-Saturn window | C, not sourced to Gann | None | Held under the astrology rule | — |
| C-TIME-36 | Square of Nine time wheel | C | `squareOf20` research | Low value; nothing now | — |
| C-TIME-37, -38 | 22.5° and 15° seasonal steps | C | 45° steps and thirds only | Build a separate `seasonalFineSteps` list (not `SEASONAL_POINTS`, which is measured) | no |
| C-TIME-39 | Retracement hit at the matching angle's time | C | None | Build context: 50% reached on the 1x1's projected date | no |
| C-TIME-40 | Fan time ratios 1x8…8x1 | C | Only 25-400% | Build a **separate** `FAN_TIME_RATIOS` list; do not touch `ANGLES` (it feeds the quarantined `gannAngleSlope`) | no |
| C-TIME-41 | Anniversary of a major low | C; **passes** | 1-year cycle | Done | — |
| C-TIME-42 | Time balance: H-H, L-L, H-L, L-H spans; near-equal → turn | C | `timeBalanceDates`, matching leg only, no tolerance | Add H-H/L-L spans with a ±1-unit tolerance as context. HTMPC p.311 corroborates it. Keep W032's note that it needs a false break to act (C-STOP-03) | no |
| C-TIME-43 | Measure from extremes, not fixed dates | UNVERIFIABLE | Both are used | Held | — |
| C-TIME-44 | Fine circle divisions (112½, 150…) | C | Days: the 10 wheel counts only | Build a separate `CIRCLE_FINE_DIVISIONS` list as context | no |
| C-TIME-45 | Cluster projections from 2% swings | C | Dispersion exists | Defer to item 12. Its own TO WRITE says measure the base rate first | — |
| C-TIME-46 | Year divisions in weeks | UNVERIFIABLE | Covered by `squareOf52` | Held | — |

## 3. Other time-bearing entries (outside A-TIME and C-TIME)

**Built by earlier items** (verify against item 7's changes; do not rebuild):
- Item 5's time durations in entries: A-ENTRY-01, -08, -10, -18 (hold 8+ days or 2+ sessions; 8-21-day reactions; bear-rally sell on a Friday, 8-21 days; 28-day record hold).
- Item 6: A-TREND-05, -07, -08 (2-3-month first rallies), -11 and -12 (monthly breaks).
- `timeOverbalanced` acts through `changing`.

**Open, with a time component:**
- A-STOP-04 / A-STOP-05: daily and weekly trails.
- A-EXIT-02: holds of 1-2 weeks.
- A-VOLUME-09 / -11 / -12: volume after long time periods.
- A-SELECTION-02 / -03: time since the bottom when choosing stocks.
- A-OTHER-07 (research), A-OTHER-13, A-PRICE-05.
- C-STOP-03: "time alone is not enough"; confirm with a false break. This is the strongest support for F1 option (b), where a window acts only together with a price event.
- C-LEVELS-08 / -23, C-PRICE-04.
- Memory-bank rows: M-T3 to M-T18, M-R1, M-R3, M-R11, M-E11, M-K4. Several of these mirror the UNVERIFIABLE C-TIME entries, and their long-book source pages are now readable (fork F0).

**CYCLE entries tied to time windows:** CYC-09, -24, -34, -39, -40, -43, -47, -51, -52. **CYC-24 and CYC-51 (base rate and window coverage) are prerequisites for any window that gates.**

## 4. Conflicts and copy-vs-code findings

1. **AGENTS vs PLAN.** AGENTS says the time windows stay context only (F4 calendar test null on 2019-2025). PLAN item 7 says time acts on the verdict where Gann acts. These two owner directions disagree. They can be reconciled only by acting where Gann's own text has an act-verb (third month, time not run out, trade the date) and keeping the generic window set context. See F1.
2. **Bear ceiling.** W006 p.13 gives "no more than 43 months" while its own list contains 53. Master Course Ch.10B says 34 months 5 days (F3).
3. **A 'time'.** W022 p.371 says 360; p.372 says 20 years (F5).
4. **Price OR time.** HTMPC p.312 ("exceeding the previous greatest in price or time") supports the code's OR in `trendStrength.ts:171-173`. This bears on item 6's C-TREND-03 question.
5. **Copy ≠ code.**
   - `curriculum.ts:961` says a reaction reaching a third month is treated as a change of trend; the code only records it as context. This is fixed by step 3.
   - The same lesson says "three lower closes … three higher closes turn a downtrend up", while `ruleOfThree` uses 2 higher / 3 lower.
   - `curriculum.ts:962` ("never a reason to trade on their own") changes if F1 (b) lands.
6. **Scored criterion on an UNVERIFIABLE base.** `timePriceSquare` is scored. Its Gann basis, C-TIME-04 ("squaring of time and price"), is UNVERIFIABLE, and A-TIME-40 is UNDISCLOSED. Flag for the owner. Recommendation: no change in item 7; re-check C-TIME-04 under F0.
7. **Live-only ranking.** `cycleBonus` (`marketScan.ts:365-367, 456, 522`) and the year-cycle re-rank act on the live shortlist only. The replay never sees them, which is the cross-platform-consistency failure shape.
8. **Side finding, out of scope.** `score.ts` `applyReversionConfirmation` (~l.764) holds Execute → Watch on the STRAT "2-2" pattern. AGENTS forbids the STRAT taxonomy from feeding a gate. Report it to the owner separately.

## 5. Owner forks (one line each, recommendation first)

- **F0 (UNVERIFIABLE time entries).** The long-book checkpoint now covers the probable origins (HTMPC, WSSS, *45 Years*, Master Course). **(rec)** Re-check C-TIME-01, -05, -06, -08, -20, -26, -27 and -46 and the M-T rows as a separate step that changes only the status after a page check, never the entry text. Until then they stay held, per PLAN.
- **F1 (how windows act; A-TIME-15, -04, -06).**
  - (a) Context only (today; matches AGENTS and F4).
  - **(b, rec, staged)** A "time period has not run out" hold. A reversion (counter-trend) Execute holds to Watch unless a Gann class-A window from the symbol's own pivots is active (1-2-3-year anniversaries, A-TIME-04; or the A-TIME-06 bear windows for longs in a market bear). Sources: W006 pp.15-16, W036 p.22, HTMPC p.56 ("not until sufficient time has expired does any big move start"), C-STOP-03. Order: measure the window set's base rate first (CYC-24/-51), then a replay cell, then live.
  - (c) Trade the date regardless of price. Not recommended: it bypasses the buying points and the 5-point cap.
  - (d) Ranking only, but modelled in the replay too (this closes §4.7).
- **F2 (third-month rule, A-TIME-01/-02).**
  - (a) Hold with-trend Execute → Watch.
  - **(b, rec)** Set the monthly read's `changing`. Gann calls it a change of trend, the measurement agrees (−0.215R), and the copy already says so.
  - Which chart: **(rec)** the 2-bar monthly reaction chart (`leadership.ts:88`), or 61+ calendar days on daily bars.
- **F3 (bear ceiling).** **(rec)** Use W006's explicit 30-36 and 40-43 windows and no ceiling gate. Record 53 and 34m5d as conflicts.
- **F4 (whose bear, A-TIME-06).** **(rec)** The market's (SPY monthly), consistent with item 6's F6; or the stock's own.
- **F5 (A-TIME-30).** **(rec)** Keep 360 and note the p.372 score of 20 years.
- **F6 (A-TIME-12).** **(rec)** Tie "profit after three days" to pyramid adds (Gann's Rule 5), live suggestions and the replay; or display only.

## 6. Build order (smallest and most literal first)

1. **Test-only pins (no product change, no version bump).**
   - Entries: A-TIME-04 (1/2/3-year windows, polarity by anchor), -08, -09, -11, -18, -19, -30 (360 rank 1, 180 rank 2), -37 (day 30 in 28-31); C-TIME-02, -18; A-TIME-02's bearish counter-move test.
   - Files: `lib/__tests__/gann.test.ts`, `lib/gann/__tests__/disclosedRules.test.ts`, `missingRules.test.ts`, `extremeTiming.test.ts`, `lib/validation/__tests__/criteria-gate.test.ts`.
   - Any pin that fails is a real bug and becomes its own fix.
2. **Class C context fields** (separate lists, `contextFactors` and the card only; no version bump).
   - Entries: C-TIME-09, -12, -19, -21, -23, -25, -37/-38, -39, -40 (`FAN_TIME_RATIOS`, not `ANGLES`), -42, -44.
   - First test per field: the TO WRITE in `gann_features.json` (e.g. 30-year fractions → 3.75/7.5/10; day 23 and day 49 flagged; a 35-week window).
   - Add a guard test that `WHEEL_COUNTS`, `DAY_COUNT_BANDS`, `MAJOR_CYCLE_YEARS` and `ANGLES` are unchanged.
3. **A-TIME-01/-02 (+ -03's label): the third-month rule.** **Moves the verdict.**
   - Files: new `lib/gann/monthlyCounterMove.ts` (on `MONTHLY_REACTION_CHART`), `trendStrength.ts` (`changing`) or `score.ts` (`applyThirdMonthHold`), `scanTicker.ts:412`, `replay.ts:1329`, `curriculum.ts:961`.
   - Failing test first: a reaction making a new extreme in its 3rd month sets `changing` (or holds Execute), and a resumption in month 2 does not. Add the bear mirror.
   - Bump `STRATEGY_VERSION` and run a 766-symbol replay; pass the full SHA and the cells input. Report mutation count and scan cost (CPU only, `mark()`).
4. **A-TIME-12: hold time.**
   - Files: `exitRules.ts`, the pyramid path (live suggestions plus the replay pyramid), the position card.
   - Failing test first: `firstCloseAgainst`, then `withTrendAfter3`, then a pyramid add refused before day 3.
   - Moves pyramiding, not the entry verdict. Bump the version only if replay trades change.
5. **A-TIME-05/-21 month counts and A-TIME-06 bear duration, as context**, live and replay.
   - Files: new `monthCountsFromPivots`, new `lib/gann/bearDuration.ts` (with `marketBearStart` mirroring `marketBullStart`), `contextFactors.ts`, the card.
   - Failing tests first: coffee 9/2/6/5; 1936 42/37/36/48; bear windows 30-36 and 40-43.
   - No version bump.
6. **CYC-24/-51 base rates** for the class-A window set (anniversaries plus bear windows) on the 766-symbol universe.
   - A measurement step and a precondition for step 7.
   - Record the result in `docs/replay-runs/`.
7. **F1 (b): the "time not run out" hold**, as a replay cell first, then live on owner go-ahead. **Moves the verdict.**
   - Files: `score.ts` (a new hold on the `applyMonthlyBreakHold` template), `scanTicker.ts`, `replay.ts`, `curriculum.ts:962`.
   - Failing test first: a reversion Execute with no active class-A window holds to Watch, and one inside a 1-year anniversary does not.
   - Bump `STRATEGY_VERSION` and run the replay.
8. **Live-only coarse ranking (§4.7).** Model `cycleBonus` and the year-cycle re-rank in the replay (F1 d), or record them in AGENTS as a stated live-only exception. If the code changes, it moves live ranking.
9. **Held, not built:**
   - UNDISCLOSED: A-TIME-10, -13, -14, -20, -24, -25, -26, -29, -34, -35, -40;
   - UNVERIFIABLE C-TIME entries, until F0;
   - research-only: A-TIME-07, -11, -31, -32, -33;
   - astrology rule: C-TIME-35;
   - deferred to item 12: C-TIME-32, -33, -34, -45.

## 7. Already done or covered elsewhere

- **Pass already:** C-TIME-10 and C-TIME-41 (item 2 review).
- **Time acts today:**
  - `timeOverbalanced` → `changing`;
  - item 5's hold durations;
  - `three_adverse_closes`;
  - scored `timePriceSquare`;
  - live-only coarse ranking.
- **Measured leads (context, not proof):** `counterMoveBeyondFirstMonth` −0.215R; `monthlyBreakAgainstCampaign` −0.319; `yearFractionMajor` positive on a small sample; `seasonalCountMajor` −0.078 (inverted); `macroMajorCycleActive` Δ+0.10 on 1h bars and Δ+0.24 on daily (date-wide, so it measures when trades happen, not which symbols).
- **`GANN_PARITY_ROADMAP.md` §3.1:** the time rows read "Aligned (context, measuring)". The counter-move row already names "an owner decision on using it as a trend-change signal", which is fork F2.
