# Review 12: A-LEVELS-04 re-review at cd064b8 ("Failed tops hold only when they stand before the first target")

**Verdict: A-LEVELS-04 FAIL.** The hold half is mostly fixed. The fix opens a new hole in the exit half: a long bought while a failed top stood above its TP1 (now allowed) never exits when that top is tested again and fails after the fill. That is Gann's "the third test decides" case, and it now covers almost every trade that enters under a standing failed top.

I made no edits to `/home/claude/gsps-item5s4`. I worked in a detached worktree at cd064b8 (`scratchpad/rev12`, now removed). The probe tests and the mutation harness are kept in `scratchpad/review12/tools/` (`probe.test.ts`, `rate.test.ts`, `perf.test.ts`, `mutate.py`), with output in `probe.log`, `mutants_narrow.txt` and `mutants_wide.txt`.

## Checks run
- `npx vitest run lib/gann/__tests__/failedTop.test.ts lib/lifecycle/__tests__/confirmNow.test.ts lib/gann/__tests__/campaignBottoms.test.ts lib/analysis lib/gann/__tests__/disclosedRules.test.ts` (main worktree): 7 files, 97 tests passed.
- `npm run -s check:terms`: clean (784 files plus 2 public docs).
- STRATEGY_VERSION was bumped to `2026-10-16-gann-failed-tops-path`. No replay has run on it.

## Review-11 findings, one by one

| R11 | Status | Evidence |
|---|---|---|
| H1 hold unbounded, blocks double-bottom buy | **Partly fixed** | `failedTestInPath` (`multipleTops.ts:124-134`) bounds the hold to entry ≤ level ≤ TP1, and it is wired on the scan (`score.ts:784`, `scanTicker.ts:461`), the replay (`replay.ts:888-890`, `scoreSetup` 1398) and placement (`confirmNow.ts:185`, `place-order.ts:244,259`). With the live pool (Square of Nine plus S/R), the range-foot buy is no longer held (probe P3: TP1 104.55 / 105.31 / 108.65 against a failed top at 110.5). It is still held when TP1 lands on the failed top itself (probe P2; see finding M2 below). "Report the hold's pass rate on the replay" was not done. |
| M1 exit misses post-fill failure | **Fixed for the case raised** | `exitRules.ts:211-221` compares the reading on sessions before the fill with the reading now. Probe P4: fills on bars 19 and 20 exit `failed_top`, and bar 21 (already failed) does not. It reads only the bars passed in: the replay passes sessions `< date` (`replay.ts:1251`), and live passes completed sessions only (`gann-exit-live.ts:126`). The window is 364 days, equal to `ENTRY_CHART_DAYS`. **But see H1 below:** the same `!atEntry` test suppresses genuinely new failures. |
| M2 surviving mutants | **Fixed for R11's list** | T1, T2, D2, C2 (raw year including today), P4, H1 (Reject) and R1 (skip disabled) are all killed now. New survivors are listed under L1 below. |
| M3 School / triple wording / coarse exception | **Fixed** | School has a new line at `curriculum.ts:718`. Triple wording is fixed in `confirmNow.ts:191` and `score.ts:785`. The coarse-filter exception is recorded in the `applyFailedTopHold` docstring (`score.ts:773-776`). The `thirdTestFailedAgainstTrade` name was already documented at c3dc4a8 (`contextFactors.ts:176-178`). |
| L1 cost | **Fixed** | `closesAfter` (`trend.ts:47-60`) is a one-pass suffix max/min. Measured: `readTrend` 0.278 ms against `readGannTrend` 0.298 ms on 252 bars, so the level step is now negligible. |
| L2 copy | **Fixed** | The hold, placement and campaign-test comments now match the code ("back within the allowance"). |

## Findings at cd064b8, ranked

### H1. The failed-top exit is suppressed for every trade that enters under a failed top the hold excused, including a new failing test of that top after the fill.
- Where: `exitRules.ts:219-221`. `atEntry = failedTestAgainst(readMultipleTops(window(firstAfter)), side)` asks whether any failed top stood at entry. It is not limited to the path, and it does not check that it is the same test. `if (failed && !atEntry)` then never fires for the life of the trade.
- Since H1's fix, entries under a standing failed top are routine. Random walks (40 seeds × 3 price/volatility profiles, 300 days, 9,600 sampled days, entry at price, TP1 from the Square of Nine plus `readTrend` pool) gave these figures:
  - A failed top stood against a long on **22.9%** of days, a median 10.1% above price.
  - It was in the TP1 path on only **0.3%** of days (1.3% of standing cases).
  - So about 98.7% of those setups now enter, and all of them have the failed-top exit switched off.
- Probe P1 (Gann's own range trade):
  - Setup: tops at 110.5 twice, then failed. Buy at 100 with TP1 105, which `failedTestInPath` allows.
  - After the fill, price rallies to 110 for a third test and closes back at 103.
  - `readMultipleTops` now reports `tests: 3, state: failed, lastTestIndex: 28` (it was 2 tests, index 16, at entry). `readGannExit(...).exit` is **null**.
  - W006 p.44 and `multipleTops.ts`'s own header say the third test decides, and failing there is a sell.
- The new School line says "If the top fails after he has bought, he leaves." In this case the code does not leave.
- Fix: suppress only when the failure now is *the same test* that stood at entry. Compare the absolute date of `lastTestIndex` and `tests`, or the level within the allowance plus the same last-test date. Exit on any failed test whose last test printed after the fill, or whose failure state is new. Add P1 as a test.

### M1. Placement fails open whenever TP1 is missing or typed, and its TP1 wiring is untested.
- `failedTestInPath` returns null without a TP1 (`multipleTops.ts:131`, documented as intended).
- On the manual ticket's advised entry, `entryStop` is sent even when levels are not attached (`order-ticket.tsx:442-445`). `attachLevels` is undefined when the box is unchecked or `bracketBlocked` (`order-ticket.tsx:460-466`), so `takeProfit1` is undefined (`place-order.ts:259`) and the wait never fires. Before cd064b8 that order was refused.
- In Manual Override, the typed target becomes TP1. A person can lower it under the failed top and clear the gate.
- The ticket already sends the protocol stop separately so that "a stop the person typed in Manual Override doesn't move the line" (`order-ticket.tsx:437-441`). The same reasoning was not applied to TP1.
- Mutants **O1** (plan `takeProfit1` dropped), **O2** (advised `takeProfit1` dropped) and **O3** (advised uses `masterProfit`) all **survive** the wide suite, including `lib/trade` and `lib/lifecycle`.
- Fix: send the protocol's TP1 alongside `entryStop` (for example `entryTakeProfit1`). Fail closed to `failedTestAgainst` when no protocol TP1 is known. Add a behavioural `entryConfirmationRefusal` test for both the plan path and the advised path.

### M2. The inclusive TP1 bound still holds Gann's range trade whose first target *is* the failed top.
- Where: `multipleTops.ts:132` uses `failed.level <= takeProfit1`. The test pins it at `failedTop.test.ts:239`: `failedTestInPath(tops, "bullish", 104, tops.top!.level)` is not null.
- TP1 is the nearest pooled level 3-15% out (`levels.ts:386-390`). The failed double top is itself a `readTrend` resistance cluster at the same price. Probe P2, S/R pool only: for entries of 99.7, 101.5, 104 and 106, TP1 = 110.5 = `failed.level`, so the hold fires. That is review 11's exact scenario.
- In the random-walk run, half of the in-path hits (14 of 28) were TP1 sitting on the failed level.
- A long whose target is the top sells *at* the top. Per W006 pp.14-15 ("failure to pass 112 = top"), that is the sell Gann prescribes, and nothing has to be passed to reach it. A target exactly at the level and one a cent under it currently get opposite verdicts.
- Fix: hold only when TP1 lies beyond the level (strictly, or beyond the level plus the allowance, the "pass" test). Flip the pinned test.

### M3. The rule is now nearly unmeasured.
- The hold fires on about 0.3% of days, where the unbounded version fired on about 23%. No replay ran on this version, and review 11's "report the hold's pass rate" was not done.
- `contextFactors.ts:181-183` still measures the unbounded reading (`thirdTestFailedAgainstTrade = inPath?.state === "failed"`). Its comment calls that "the level in the trade's path", which is no longer what "in path" means at the gate. The factor table therefore cannot measure the gate that is wired.
- Fix: add a TP1-bounded factor (or rename), and run the replay with both cells before calling the rule measured.

### L1. Surviving mutants (failedTop + confirmNow, then the wide suite)
- Run: 26 against the two named files, with 10 survivors re-run against the wide set; 5 more re-ran R11's mutants, all killed.
- Survivors:
  - **A1** (long entry bound `>=` → `>`), **A3** (short TP1 bound `>=` → `>`), **A4** (short entry bound `<=` → `<`). The boundary cases are not pinned on three of the four edges.
  - **E2** (`atEntry` also includes the fill session). No test fails on the fill day's own close for a position whose entry date is that session.
  - **E4** (exit window +30 days). Only a 400-day-old failure is tested as excluded.
  - **E7** (`atEntry` only when `firstAfter > 15`). No test has an at-entry failure with little pre-entry history.
  - **K1** (`closesAfter` inclusive of the pivot bar). This is equivalent: a pivot's own close cannot exceed its own high plus 3 points.
- Killed: A2, A5 (mirror dropped), A6, A7, A8, S1/S2 (score swaps, or master instead of TP1), C1/C2 (confirmNow swap or unbounded), R1/R2 (replay swap or skip disabled), E1, E3, E5, E6, H1, and R11's T1/T2/D2/C3/P4.
- The replay skip is still guarded only by an anchored source regex (`failedTop.test.ts:339-340`). There is no behavioural replay test that a trade is skipped.

### L2. The exit window is anchored on the last bar, not on the next session.
- `exitRules.ts:212-214` reads `[lastBar − 363d, lastBar]`. The scan's entry chart is `[asOf − 364d, asOf)` (`entrySelection.ts:70-81`).
- They agree only when the next session is the next calendar day. Over a weekend or holiday the exit (and `atEntry`) reads up to 2-3 days further back than the scan that admitted the trade. A pivot right at the 52-week edge can then be failed in one reading and absent in the other.
- Small, but the header claims "the 52 weeks before its next session".

### L3. The hold lifts on a re-test, not a crossing.
- The hold lifts once price is back within 3 points under the failed level (the state reverts to `testing`). The new School line teaches the same: "He waits until price comes back to within 3 points of it". The copy now matches the code, as L2 of review 11 asked.
- The open question: under W006 p.44 the third test decides, and the buying point is the *crossing* by the allowance. A long re-admitted 2-3 points under a twice-failed top, with TP1 above it, is buying into the deciding test. This is held for the owner as a design point, not a code defect.

## Parity (question 4)
- Entry and TP1 are the same values on all three surfaces:
  - Live scan: `levels.entry` and `levels.takeProfit1` from `computeTradeLevels`.
  - Placement: `plan.coordinates.entryTrigger` = `l.entry` and `takeProfit1` = `l.takeProfit1` (`fromScanResult.ts:105,113`). Guided and automation pass `attachLevels.takeProfit` = TP1 (`guided/order.ts:50`, `automation/service.ts:299`).
  - Replay: the skip uses `sessionPlanPaths`, priced once per session plan from `history = bars.slice(0, i)` (`replay.ts:848-861`), so there is no lookahead. It equals `scoreSetup`'s per-bar `levels` for equities. For crypto, TP1 is R-based on `executionAtr` and can drift within a session between the cached value and the per-bar value. That drift is minor.
- The `multipleTops` reading is session-level on the replay and uses the completed entry chart live, as review 11 found.

## One-line summary
H1's hold is bounded and mostly correct, and M1-M3 and L1-L2 of review 11 are fixed. The exit now never fires for a trade entered under an excused failed top, including Gann's third-test failure (H1). Placement fails open without a protocol TP1, with its wiring untested (M1). The inclusive TP1 bound still holds the range trade aimed at the top (M2). So A-LEVELS-04 stays **FAIL**.
