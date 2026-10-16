# Review 14: A-LEVELS-04 re-review at beca553

**Verdict: A-LEVELS-04 FAIL.**

Every review-13 finding is fixed or partly fixed. But the new crossing exemption lets a long through a failed double top that has not been passed. That is the exact situation the rule exists to stop.

`failedTestInPath` excuses any crossing whose crossed level is at least `failed.level − 3 pts`. In Gann's reading, the pass is a close 3 points over the failed top. This exemption accepts a crossing close up to 3 points short of that line.

The failed second test of a double top is usually the lower top, and the trigger crosses the latest swing top. So on random walks:
- 57% of the exempted entries are crossings whose own close does not pass the failed top.
- At a +10% TP1, the hold on crossing entries falls from 2,501 cases to 74.

I made no edits in `/home/claude/gsps-item5s4`. I worked in a scratch worktree, `rev14` (beca553), which I have since removed. My tools are in `scratchpad/review14/tools/`: `zz14probe.test.ts`, `mutate14.py`, `eqv14.py`, `eqvC.py` and `eqv.test.ts`. Their logs are `probe.txt`, `mutants_*.txt` and `eq_*.txt` in `scratchpad/review14/`.

## Checks
- `npx vitest run lib/gann lib/lifecycle lib/trade lib/__tests__/replay.test.ts`: 89 files, 967 tests passed.
- `npm run -s check:terms`: clean (785 files plus 2 public docs).
- Narrow suite in the worktree (the six named files): 142 tests passed.
- STRATEGY_VERSION is now `2026-10-16-gann-failed-tops-latest`. No replay has run on it. Its comment does not mention the crossing exemption.

## Review-13 findings
| R13 | Status | Evidence |
|---|---|---|
| H1 failed top hidden by nearest-cluster selection | **Fixed. A small residual remains through a different mechanism.** | `multipleTops.ts:95-105` judges the cluster that holds the latest swing. Probe Q1 now holds at entry (`inPath(97,120)` true) with no later exit, and test `failedTop.test.ts` "review 13 H1" pins this. Mutant L9 (failed only when the latest cluster is the nearest) is killed. Residual: on 520-bar weekday walks, 26 of 773 failed-top exits (3.4%) still fire on a test that was confirmed, and had failed, before the fill. All 26 were hidden at entry. The cause is that the 52-week window slides, and the greedy running-mean `cluster()` (`:57-68`) then regroups the pivots, so the cluster's membership and level change with no new test (example: tests=3 at 26.31, entry reading null). Review 13 measured 15%. |
| M1 Guided/demo send no target | **Fixed** | `lib/guided/order.ts:44` sends `entryTarget: levels.takeProfit1`. The demo uses `guidedOrder` (`auto-trade.ts:329`), as does Guided Mode (`guided/execute/route.ts:223`). Mutants G1 and G2 are killed. |
| M2 "until passed" untested | **Fixed** | The P2/P2b/P3/M4 equivalents (L4, L4b, L5, L6) are all killed by the new tests (`failedTop.test.ts:43-48`, and the seeded walk at `:303-324`). |
| M3 unmeasured, effect grew | **Not fixed, and it grew again** | A failed top stands in 27,092 of 57,840 readings (47%; review 13 had 36.6%). A failed bottom stands in 48%. Failed-top exits occur in 13.7% of 10-session longs (review 13: 10.1%). No replay has run. |
| L1 window and ticket survivors | **Fixed** | `failedTopWindow` is exported (`exitRules.ts:101-112`) and pinned on dates. W1-W5, X1, X2, T1 and T2 are all killed. |
| L2 entry just over an unpassed top | **Fixed** | `multipleTops.ts:168`: `entry < pass line`. Q2 is now held. I1 and I2 are killed. |
| L3 TP1 band; client-sent target trusted | **Open (owner decision / pre-existing)** | Unchanged. P3 (the attached stop preferred over `entryStop`) survives the narrow suite but is killed by `reactionWiring.test.ts`. |

## New findings

**H1. The crossing exemption excuses crossings that do not pass the failed top.**
- `multipleTops.ts:162-165` uses `passesIt = crossedLevel >= beyondByThreePoints(failed.level, -1)`. A crossing of level X arms on a close over X + 3 pts. When X sits under the failed top's level L, that close is below L + 3 pts, which is the line `readMultipleTops` itself requires for a pass (`:99`).
- An unpriced crossing (`computeGannEntryTrigger:313`) crosses the latest swing top. That top is a member of the failed cluster, always within the cluster band, and usually below the mean, because the failed second test is the lower top. So the floor at −3 pts excuses nearly every such crossing.
- Probe X1: tops at 112 and 109.6 give a cluster at 111.30, with the pass line at 116.60. The trigger crosses 110.10, with a crossing line of 115.37 and an entry of 111.86. It is held without the exemption and not held with it.
  - A close at 115.99 crosses the trigger line. The daily reading still says `failed` at 111.30.
  - The entry fills. The long later exits `failed_top` on the third test.
  - Gann's buy is a close 3 points over the old top (about 117.8 here), not over the lower retest.
- Random walks (120 walks × 47 days, 52-week window):
  - 2,949 crossing triggers have a failed top standing. 2,617 of them are exempted, and 1,482 of those (57%) have a crossing line under the pass line.
  - In-path holds at +5/+10/+15% TP1 go from 1,837/2,501/2,718 without the exemption to 4/74/143 with it.
  - Of the exempted fills, 148 of 250 (59%) still have the failed top standing on the daily chart at fill, and 33 of 250 then exit `failed_top` within 10 sessions.
- The commit's claim, "its own crossing is the pass", is false for these cases. The test at `failedTop.test.ts:98-99` pins the −3 pts floor, so the faithful variant (mutant E1, `crossedLevel >= failed.level`) is *killed*.
- Fix: exempt only when `crossedLevel >= failed.level`, so the crossing line is at or above the pass line. Arguably the floor should be the cluster's highest top, since Gann's "old top" is the higher one. Drop the band, or put the band to the owner.
- Shorts mirror the same defect (`:163`).

**M1. The latest-cluster rule (the core of the H1 fix) is unpinned.**
- Mutant L1 (`groups[groups.length-1]`, the last-created cluster) and mutant L2 (the cluster with the largest `lastIndexInList`, even when the latest swing belongs to no ≥2 cluster) both survive the narrow suite and the wide suite (lib/gann, lifecycle, trade, `__tests__`, backtest, scoring, guided, components/trade).
- On the review-13 walk harness they change 22,787 and 16,581 of 57,840 readings respectively.
- L2 breaks the "a new swing replaces it" clause, so an old failed top would revive under a newer single top.
- Fix: add a fixture where the latest top joins an *older* cluster, and one where a newer single top stands above a failed double top.

**M2. A failed reading now hides a nearer crossed cluster, on the card and in the factors.**
- 1,922 failed-top readings and 1,673 failed-bottom readings (about 6-7% of failed readings) have a nearer cluster that `crossed`, and that crossing is no longer reported.
- The card (`disclosedRules.ts:718-721`, `confluence-card.tsx:245`) shows one reading per kind. It now says "failed …, a top" where it said "crossed, a strong breakout".
- `multipleTopCrossedWithTrade` (`contextFactors.ts:185`) turns false on those readings. `thirdTestFailedAgainstTrade` keeps its name but has now changed meaning three times, so cross-run comparisons are invalid.
- Fix: report both readings, or at least keep the crossed one for the factor. Bump the factor names.

**L1. Placement recovery is exact, but it rests on unchecked inputs.**
- `gannCrossedLevel(entry, stop)` recovers the level to within 0.02 on all 5,449 crossing triggers, held and unheld alike. Crossing plans store the reaction pair (`fromScanResult.ts:105,110`; `levels.ts:535-536,615`).
- But the advised path falls back to `attachLevels.stopLoss` when the client omits `entryStop` (`place-order.ts:261`). A raised stop lifts the recovered level and can exempt the order. Same trust class as R13 L3.

**L2. The exemption has no behavioural test.**
- `confirmNow.test.ts:264-272` and `failedTop.test.ts:275-283` pin the wiring by regex only. No test runs a scan, replay or placement where the exemption flips the outcome.
- Live and replay do use the same trigger (`scanTicker.ts:461` and `replay.ts:890,1398`). Held crossings never had their crossing before the failed test (0 of 97), so the "held crossing" gaming case is theoretical.

**L3. A pass followed by a fall back counts as a failed top.**
- Pinned at `failedTop.test.ts:303-324`. This overlaps C1's `hold_test_failed`. Defensible under the owner card, but it is a design choice.

## Summary
A-LEVELS-04 **FAIL**. The review-13 findings are fixed, apart from M3 (still unmeasured), a small window-slide residual of stale exits (3.4%), and the open owner items in L3. The new crossing exemption excuses crossings up to 3 points short of the failed top's pass line: 57% of exempted entries do not pass the top they are excused from (H1). The latest-cluster selection is untested (M1). Failed readings now hide nearer crossings on the card and in the factors (M2).
