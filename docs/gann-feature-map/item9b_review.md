# Review 11: item 9 steps 5-8 (4d05920, fbe0bba, 4291baf, c3dc4a8)

I made no edits to the item5-step4 worktree. I worked in two detached copies at c3dc4a8: `scratchpad/review11/wt` for the suite and `scratchpad/review11/mut` for mutations and probes. I removed both copies after the run, so the probe files they held (`range`, `exitgap`, `baserate`) are gone, but the harness is kept at `review11/tools/mutate.py`. Branch item5-step4 has since moved to 19e537d; this review covers c3dc4a8 only.

## Checks
- `npx tsc --noEmit -p .`: exit 0. `npm run -s check:terms`: clean (784 files). Full `npx vitest run`: 2990 passed.
- The version was bumped once per commit. No replays have run on any of the four versions, so every verdict below rests on code review.
- Parity holds for FL3's reading. The scan's `charts.daily`, the replay's `charts.daily`, placement's `entryChartBars(daily, today)` and the exit's 364-day window (live through `gann-exit-live.ts` on completed sessions, and in the replay loop) all read the same 52 weeks of completed sessions. FL1 flows through `readTrend` into the live scan, the replay and the coarse pre-filter (`marketScan.ts:369,402`). FL6 and the campaign ladder are wired the same way on both surfaces.
- Page check against the W006 notes: p.13 "old tops become bottoms…"; p.24, the 1931 break of 120 and then 110 as support, with the 119 rally failing; pp.14-15, the 111½ double top ("failure to pass 112 = top"); pp.23-24, the campaign ladder. All four match the cited rules.
- Mutations (26 run on 13 related test files): 19 killed, 7 survived (see M1).
- Random walks (40 seeds, 300 days each, $40 and $200, 1.2-2% daily volatility):
  - A failed double or triple top stands against a long on **18.7-22.1%** of days, and the mirror against a short on 15-22%.
  - The failed top sits a median **11-15%** above price (p90 26-28%, max 57%).
  - FL1 changes the support list on 64-72% of days and the nearest support on 49-60%.
  - `readTrend` now costs 0.27-0.31 ms per 252-bar call, against 0.017 ms before.

## Findings

**H1. A failed double top now blocks Gann's own double-bottom buy, and the hold has no bound.**
- Where: `score.ts:773` (`applyFailedTopHold`), `confirmNow.ts:181`, `replay.ts:886`, `multipleTops.ts:95-108`.
- Scenario: tops at about 110 twice, a bottom at 99.7, price 101.5. `computeGannOldLevelEntry` arms the second-test buy at 99.7 (A-ENTRY-02, W006 "buy at double bottoms, stop 3 points under"). At the same time, `failedTestAgainst` reports the 110.3 top as failed. So the scan holds the setup to Watch, placement refuses it and the replay skips it.
- In any range whose top was tested twice, price sits more than 3 points under that top by construction. So the rule refuses every long at the range's bottom.
- The map's FL3 (a) said "within the trade's TP1 path". The code has no path or distance bound. The `failed` state ends only when a new 3-Day top forms. The registry saturation is 0..1, so nothing would flag the roughly 20% base rate.
- Fix:
  - Apply the hold only when the failed level lies between the entry and the plan's TP1 or master target, or within `NEAR_PCT` or 3 points of the entry.
  - Exempt the `oldLevel` bottom buy, whose stop already sits under the bottom.
  - Report the hold's pass rate on the replay.

**M1. The exit misses a failure that prints after the fill.**
- Where: `exitRules.ts:214` (`offset + failed.lastTestIndex >= firstAfter`).
- This requires the second test's swing extreme to fall on or after the fill. The 3-Day chart confirms that pivot days later.
- Probe: entries on bars 17-19 of the `doubleTop` fixture. Nothing stood against them at entry (state "none"), the top failed afterwards, and no exit fired. The test "does not exit a long bought after the failed top had already printed" (`failedTop.test.ts`, bar 19) actually enters before the failure. It pins this gap as intended behaviour.
- Fix: exit when the top has failed now and the reading on the sessions before the entry date was not `failed`.

**M2. Test strength.** Seven mutants survived.
- T2 and D2: the bottom-side 3-point allowance in `trend.ts` and `disclosedRules.ts` can be dropped. No test covers a bottom broken by less than 3 points.
- H1: the hold also fires on Avoid, which would lift it to Watch.
- E4: the exit window can be shortened by 30 days.
- C2: placement can read the raw 365 days, including today's forming bar.
- R1: the replay skip can be disabled with `false &&`. The source-regex test still matches.
- P4: the campaign ladder's price argument can change.
- Fix: write behavioural tests for each. The campaign ladder has only a unit test and a regex wiring test. No test shows a stop or target actually landing on a campaign bottom.

**M3. FL3 has not reached every surface.**
- School has no line on waiting under, or exiting at, a failed double top. Compare `curriculum.ts:714`, which teaches the double-bottom buy.
- `contextFactors.ts:183`'s `thirdTestFailedAgainstTrade` now fires on doubles, so the name is wrong.
- The placement note in `confirmNow.ts` always says "double", even for a triple.
- The coarse pre-filter doesn't apply the hold. That matches the distribution precedent, but nothing records it as an exception.

**L1. FL1's cost was not measured, though AGENTS.md asks for a measured figure.**
- Where: `trend.ts:48`. `crossed()` rescans the bars after every pivot.
- Cost: about 16-18× per call. That is about 1 ms per symbol live (four calls) and three calls per session in the replay.
- Fix: precompute suffix maximum and minimum closes, so the check is O(n).

**L2. Copy.**
- `applyFailedTopHold`'s note says "until price crosses the level". The hold actually lifts once the close is back within 3 points.
- The comment in `campaignBottoms.test.ts` calls a broken bottom below price "resistance". It is neither.

## Verdicts (replays pending for all four versions)
- **A-LEVELS-01: PASS** on code review. Crossed tops count as support and broken bottoms as resistance, on the 3 points, live and in the replay, coarse included. School is aligned. Close the bottom-side mutants (M2).
- **A-LEVELS-05: PASS.** The 110-style old top below price reads as support (`trend.test.ts`). The 119-against-120 pin is in `levelRole.test.ts:61`.
- **A-LEVELS-03: PASS** on code review. Unbroken ladder bottoms under price join the pool on both surfaces, so the nearest unbroken one acts first. The data-span exception is recorded. A plan-level test is still owed (M2).
- **A-LEVELS-04: FAIL.** The hold contradicts Gann's double-bottom buy and fires on about 20% of random-walk days at levels 11-15% away (H1). The exit misses failures that print after the fill (M1). School is not wired (M3).
- **C-NUMEROLOGY-04: PASS.** The digital root no longer gates anything. It is card context only, and the 3-6-9 pin exists (`digitalRoot.test.ts:173`).
- **FL6:** clean. No other target source reads fan prices.
