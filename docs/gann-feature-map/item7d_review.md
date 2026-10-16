# Review: item 7 step 2 (class C time context) and the item 7c review fixes (67f2724..5b27268)

Reviewer: fresh context, read-only. Worktree `/home/claude/gsps-review7d` at 5b27268. Probes and mutations ran only in the copy at
`/tmp/claude-0/-home-claude-GSPS/7b7249ce-f02f-5728-a844-fc19299dfe3f/scratchpad/review7dcopy`.

Commits reviewed:
- 1301670: step 2a (C-TIME-09, -12, -19, -21, -37, -38, -44)
- d5364e3: steps 2b/2c (C-TIME-25, -42, -40, -39, -23)
- 5b27268: fixes for item7c_review H1, M1, M2, M3, L1, L2

## Checks run

- `npx vitest run` on the 11 changed or related files (secondaryTime, thirdMonth, monthlyWarning, exitRules, bearMarketCallers, market-scan-shortable, gann, criteria-gate, disclosedRules, campaignLedger, trendStrength): **203 passed.**
- Full suite: **275 files, 2783 tests passed.**
- `npx tsc --noEmit -p .`: **exit 0.**
- `npm run -s check:terms`: clean (762 files). No new test title or user-facing string contains "Gann".
- `gann_features.json`: not touched by the diff.
- `STRATEGY_VERSION`: bumped to `2026-10-16-gann-record-sections` in 5b27268, which changes the verdict, exits and lists. Steps 2a-2c are context only and have no bump. That is correct: `fans.ts`'s `fanAnchors` refactor leaves `computeFanLines` unchanged, and `readCounterMove` only gains a field.
- **Class C isolation.**
  - `secondaryTime` is read only by `contextFactorsFor`, which the replay uses for attribution only, and by `describeSecondaryTime`, which feeds the card text.
  - No scored criterion, gate, hold or ranking reads it.
  - `WHEEL_COUNTS`, `DAY_COUNT_BANDS`, `MAJOR_CYCLE_YEARS`, `ANGLES`, `SEASONAL_POINTS` and the disclosed Square-of-52 weeks are unchanged and pinned.
  - **Surfaces:** live goes through `lib/signals/confluence/gann.ts:256` → `readDisclosedRules`; the replay goes through `replay.ts:639`.
- **Mutation run** (`scratchpad/mut7d.py`, 8 test files). These were caught:
  - H1 revert, and H1 applied to the bull side only;
  - the L1 at-entry guard removed;
  - M1 text forced on;
  - M2 exam reverted;
  - M3 dedupe removed;
  - time-balance tolerance changed 1 → 1.5.

  These survived:
  - `DAYS_PER_DEGREE` set to 1;
  - seasonal tolerance 1 → 2;
  - fan-ratio window 2 → 5 days;
  - `HALF_PRICE_HALF_TIME_DAYS` 90 → 30;
  - month-count and cycle-fraction direction flips in `contextFactors`;
  - `Math.round` → `Math.floor` in `readCycleFractions`;
  - **L1 with the monthly-break/section branch removed.**

## Re-check of the 7c fixes

**H1 (record section tops): fixed, both directions.**
- Probe `zzprobe7d.test.ts` in the copy ran the 7c shapes plus longer bounces. All read `third:false`, `changing:false`, with the weekly trend intact. Shape E and E2 read direction bullish, and their bear mirrors bearish. The shapes:
  - A: a 10-day bounce;
  - 14-day and 21-day bounces to lower tops;
  - E and E2, with rising 3-day swings afterwards;
  - each of these mirrored for a bear market.
- Genuine cases still fire:
  - G: new lows on day 75;
  - I: the bounce makes a new record and the reaction from it reaches day 62.
- 7c's probe C (a low on day 62, then a recovery) still reads `changing`. That is the known design note, not a defect.
- `thirdMonth.test.ts` and `monthlyWarning.test.ts` now carry the ≥7-day-bounce case and its bear mirror. Mutations H1a and H1b are caught.

**M1 (copy agrees with the trend read): fixed.**
- The `thirdMonth` text in `describeDisclosedRules` now follows `ledger.counterMoveThirdMonth`.
- The card tile changed to "past 2 months", and a separate tile shows the ledger's call.
- The curriculum lesson and quiz now say "still making new lows in its third month".
- The held case is asserted and the mutation is caught.
- Leftover, cosmetic: when `ctx.campaign` is null the line still asserts "has made no new extreme in its third month". This is rare, because both readers need a weekly trend.

**M2 (no rest-of-month lookahead): fixed.**
- `gann-exit-live.ts:96-97` and `graduationExam.ts:245` use `monthlyWithCurrent` over the sessions before the day.
- On the first session of a month this rolls the whole prior month from the daily bars, and the provider's bar for the current month is dropped. That is correct.
- Both surfaces are tested and both mutations are caught.

**M3 (no duplicate listings): fixed at unit level.**
- The fix has three parts:
  - `continuationExclusions` keeps every sell row out of the sell pass;
  - `mergeContinuations` dedupes by symbol;
  - `dropSellsAlsoBought` runs before `takeShortable`.
- The unit tests catch the regression.
- A composed `runMarketScan` case is still not covered, as the commit itself states.

**L1 (exit on the ledger's trend-change calls): built. Test gap and one guard gap, see L-b and L-c below.**

**L2: fixed.**
- The A-TIME-04 window is pinned at ±2, with ±3 closed.
- The oscillator guard now covers `lib/analysis`, `lib/strat` and `lib/trade`, and it resolves relative imports.

**L3:** still no 766-symbol replay on `2026-10-16-gann-record-sections` (claude-progress says it is next). PLAN and map step 3 require one before this ships, because the verdict moves.

## Findings

### M-a. MED: C-TIME-39 times the angles inversely to the source author's convention and to `FAN_TIME_RATIOS` in the same module
**Where:** `lib/gann/secondaryTime.ts:171-182` and `:393` (`due = t0 + (p.fraction / p.ratio) * baseIntervalMs`), against `:159-169` (`FAN_TIME_RATIOS`) and `:350`.

**The conflict.** Sidney's own convention (W033 p.2, `works/W033/detailed-notes.md`) is that 1xN rises N points per period, so 1xN is steep and Nx1 is flat. `FAN_TIME_RATIOS` encodes exactly that: 1x8 = 12.5% of the square's time, 3x1 = 300%. The C-TIME-39 reader treats `ratio` the other way, as a price slope: 1x8 is flat (slope 1/8) and 3x1 is steep (slope 3).

**Failing scenario (probe `zzprobe7d3.test.ts`):** one 20-day fall from a high to a low on 2026-01-31.
- C-TIME-40 says "the 3x1 time ratio from the last low comes due 2026-04-01" (+60 days).
- C-TIME-39 flags "the 2/3 retracement reached 2026-02-04, at the time the 3x1 angle gives" (+4.4 days).

Under Sidney's convention a 3x1 reaches 2/3 of the range at 2 × 20 = 40 days. The two card lines disagree on what "the 3x1 angle" is. Eight of W031's nine pairs are affected; only 1/2-1x1 is the same either way.

The pinned test bakes in the inverted reading: `secondaryTime.test.ts:260-266` has 3/8 on the 1x2 at 3/4 of the swing. Under the stated convention it would be 3/16 of the swing.

**Fix:**
- Derive the time from the paired label's `FAN_TIME_RATIOS` entry: `due = t0 + fraction * timeRatio * T`. Sidney's convention then gives a monotone table: 1/8 at T/64 … 1/2 at T/2 … 7/8 at 7T.
- Or, if the build means the chart's price-slope convention (`ANGLES`), say so in the header as an engineering choice that departs from W033. Then rename one of the two label sets so the card does not use the same angle name for two different times.
- Update the 3/8-1x2 test either way.

### M-b. MED: C-TIME-09's 144-month count can never fire on the live scan, only in the replay
**Where:**
- `lib/data/provider.ts:188` and `:243`: live monthly bars are `yearsAgo(10)`.
- `lib/gann/secondaryTime.ts:275-283`: `findPivots(monthly, 3)` caps a pivot's age at about 117 months.
- The replay's monthly bars start `monthlyChartFrom(dailyStart)`, 10 years before a 6-year daily window (`run.ts:358`, `replay.ts:736`), so a late session sees pivots up to about 16 years old.

**Failing scenario:** a major monthly low 144 months before today.
- Live: `monthCounts` can never contain "144 months", because the bar is not fetched.
- Replay: on the same date it does, and `secondaryMonthCountWithTrade` is set.
- So the factor table measures a reading the card can never show. This is the cross-platform rule's failure shape.
- The same applies to every C-TIME-12 fraction longer than about 117 months: 1/2 of 20 years, 3/8 of 30 years and up, most of 50 and 60 years.

**Fix:** pick one.
- Fetch about 13 years of monthly bars on the live path (same request count).
- Cap the replay's `priorMonthly` to the 10 years before each session.
- Record the 144-month and long-fraction counts as an explicit replay-only exception.

**On the written test:** the claim that C-TIME-09's written test cannot be met is right. `readTiming` (`timeConvergence.ts:74-91`) anchors `square144` to the 365-day extreme, so 144 months cannot elapse there. A separate reader is the correct place under the map.

### M/L-c. C-TIME-19's exact-day counts are unobservable for whole weekdays of pivots on trading-day bars
**Where:** `lib/gann/secondaryTime.ts:85-89` and `:237-246`. These are exact single days, measured to the last bar's date.

**Failing scenario (probe `zzprobe7d2.test.ts`, Mon-Fri bars):** a major low on Thursday 2026-01-29. Walking the series forward, the only counts ever reported are `[46, 49]`.
- Day 23 falls on a Saturday, so it is never reported for a Thursday or Friday pivot.
- For a Wednesday pivot, days 45 and 46 are Saturday and Sunday, so the whole 45-46 band is never reported.
- Holidays add more misses.
- The tests use one bar per calendar day, so they cannot see this.

**Fix:** count a hit on the first session on or after the target day (or use ±1 calendar day). Add a fixture on weekday bars.

### M/L-d. C-TIME-23's "recorded for 90 days" is lost at the next minor pivot
**Where:** `lib/gann/secondaryTime.ts:359-377` and `:380-405`. These read only `fanAnchors`, which takes the last `findPivots(bars, 4)` high and low.

**Failing scenario (probe):** price reaches 50% at half the time on 2026-02-10, then rises for 25 days, dips for 3 days and rises again.
- `halfPriceHalfTime` becomes `{level 113.5, date 2026-03-01}`. That reading comes from the 3-day dip's micro-swing; the real 02-10 meeting is gone.
- Without the dip, 02-10 is kept, as in the test.
- On real daily data a strength-4 pivot forms every week or two. So the "three-month fast move" context usually lasts days, not 90.

**Fix:** keep hits from every fan-anchor pair whose meeting date is within 90 days, by scanning `findPivots` pairs back that far. Alternatively, anchor on `majorPivots`.

### L-a. LOW: the fine seasonal steps drift up to 3 days early in the second half of the year
**Where:** `lib/gann/secondaryTime.ts:121` and `:310`.

The uniform 365.2422/360 days per degree reproduces April 5 (15°) and April 12 (22.5°). It ignores the anchors the C-TIME-37 rule states: 22 Sep = 180° and 21 Dec = 270°, also the class A `SEASONAL_POINTS`.
- 195° lands on Oct 4. Interpolating within the quadrant gives about Oct 7, which is outside the ±1-day window.
- 150-165°, 202.5-210° and 255° are 2 days early.
- The test only pins April, and setting `DAYS_PER_DEGREE` to 1 survives.

**Fix:** interpolate within each quadrant between the class A dates. Pin one step after the September equinox.

### L-b. LOW: L1's monthly-break/section exit branch is untested
**Where:** `lib/gann/exitRules.ts:191-192`.

Removing `(l.monthlyBreakInReaction && l.reactionBelowPriorSection)` survives every test. Add an exit test built on the monthlyWarning three-section fixture.

### L-c. LOW: L1's at-entry guard compares booleans, not the reaction
**Where:** `lib/gann/exitRules.ts:194-195`.

**Scenario:**
1. A position is entered while the ledger already stands on a third-month or section call from an older reaction.
2. Price makes a new record (a new section).
3. The new section's reaction then reaches its own third month.

The current ledger and the at-entry ledger both read true, so the exit never fires for a reaction that began after the fill.

**Fix:** require the call's section top (or reaction extreme) at entry to be the same bar as now, or reuse the over-balance branch's `reactionStart >= firstAfter` idea.

### L-d. LOW: test strength
These mutations survive: fan-ratio window 2 → 5, `HALF_PRICE_HALF_TIME_DAYS` 90 → 30, seasonal tolerance 1 → 2, and `Math.round` → `Math.floor` for cycle-fraction months.

`secondaryMonthCountWithTrade` and `cycleFractionWithTrade` are asserted only as `typeof boolean`, so inverting their direction survives.

Doc nit: `DIVIDED_CYCLE_YEARS`'s comment says "the 1-3-year ones are the year fractions already". That is true only of the 1-year cycle. It is not a FAIL, because the entry's stated gap is the 5-60-year cycles.

### L-e. LOW: process
The L3 replay (766 symbols on `2026-10-16-gann-record-sections`) is still owed before A-TIME-01/-02 ship.

## Per-entry verdicts

| ID | Verdict | Reason |
|---|---|---|
| A-TIME-01 | **PASS** (code and tests) | H1 is fixed: the 7c probe shapes, 14- and 21-day bounces and the controls all read correctly. M1's copy, tile and curriculum now agree with the trend read. The day-60/61 boundary and mutations are caught. The L3 replay run is still a pre-merge requirement (PLAN). |
| A-TIME-02 | **PASS** (code and tests) | The H1 bear mirrors read correctly (higher weekly bottoms after 10, 14 and 21-day dips). The 45/70-day bearish `readCounterMove` test exists, and so do the mirror tests. Same L3 caveat. |
| C-TIME-09 | **FAIL** | The 6/12/144-month reader is correct and tested. The written test (readTiming square144) is unmeetable as claimed, and the separate reader is right. However, 144 months is unreachable on the live scan's 10-year monthly fetch while the replay sees it (M-b). |
| C-TIME-12 | **PASS** | `cycleFractions(30)` gives 3.75, 7.5 and 10, plus all nine fractions. The monthly reader is tested, including the no-hit month. Caveat: M-b's long-fraction reach. |
| C-TIME-19 | **FAIL** | The lists and tests match the rule on calendar-day bars, and the class A bands are untouched. On trading-day bars, day 23 never fires for Thursday or Friday pivots, and 45-46 never fires for Wednesday pivots (M/L-c). |
| C-TIME-21 | **PASS** | 17 and 35 weeks, ±2 days, both edges pinned. Weekday-safe, because whole weeks land on the pivot's weekday. |
| C-TIME-23 | **FAIL** | Half the range at half the time is flagged within ±T/16, which meets the entry's test intent. However, the "three-month fast move" record vanishes at the next minor pivot and can be replaced by a micro-swing (M/L-d). The 90-day value is not pinned from below. |
| C-TIME-25 | **PASS** | ≤4 normal, 5-6 past the 4th day, 7-10 the next counter-move's length. Trading days are counted. The direction is filtered to the trade's own trend. All mutations are caught. |
| C-TIME-37 | **PASS** | 22.5° on Apr 12 with class A points excluded. Caveat L-a: drift after September, no hours. |
| C-TIME-38 | **PASS** | 15° on Apr 5, 24 divisions in a separate list. Same L-a caveat. |
| C-TIME-39 | **FAIL** | 50% on the 1x1's date is flagged and the off-date case is not, so the named test is met. The other eight pairs use the inverse of the author's own angle convention, and the module's own `FAN_TIME_RATIOS` contradicts them on the card (M-a). |
| C-TIME-40 | **PASS** | All nine ratios from the fans' anchors, in a separate list, with `ANGLES` untouched and pinned. The 1x8, 1x3, 3x1 and 8x1 dates are asserted. Caveat: the window width is unpinned. |
| C-TIME-42 | **PASS** | Top-to-top and bottom-to-bottom spans within 1 week, while the swing runs toward that kind. The last span is used, not an earlier one. The tolerance mutation is caught. High-to-low and low-to-high stay in the ledger's `timeBalanceDates` (±2 days in `contextFactors`). |
| C-TIME-44 | **PASS** | 112.5 … 337.5 days ±2, in a separate list. Closed between divisions, and the class A `timeCycles` window is not opened on day 165. |

## Reproduction (copy only)
- `review7dcopy/lib/gann/__tests__/zzprobe7d.test.ts`: H1 shapes A (10/14/21-day bounces), B, C, E, E2, F, G, H, I, J and their bear mirrors. It prints the ledger, trend and counter-move line.
- `review7dcopy/lib/gann/__tests__/zzprobe7d2.test.ts`: the C-TIME-23 retention probe and the C-TIME-19 Thursday-pivot weekday probe.
- `review7dcopy/lib/gann/__tests__/zzprobe7d3.test.ts`: the C-TIME-39 and C-TIME-40 "3x1" contradiction.
- `scratchpad/mut7d.py`: the mutation runner. Each file was restored from `.bak` after its run.
