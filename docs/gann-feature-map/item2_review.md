# Item 2 review: commit 1fa1084 (gsps-item2)

## Checks
1. **Test-only diff: confirmed.** All 9 changed files are under `__tests__/`.
2. **Tests run green:** `npx vitest run` on the 9 changed files gives 9 files and 96 tests passed.
3. **Mutation checks** were run on a scratch copy; the worktree was not touched.
   - These tests fail when their rule is broken in the code:
     - nearby-level merge (tolerance set to 0)
     - shares-per-point top warning (forced to false)
     - campaign ledger, bear monthly-high break (disabled)
     - leadership (`LEAD_DAYS` 10 changed to 100)
     - 1-year anniversary (1 removed from `MAJOR_CYCLE_YEARS`)
     - 3/8 and 5/8 (5/8 moved to 0.6)
   - Two tests do not fail when their rule is broken (gaps 1 and 2 below).
4. **PLAN.md item 2 coverage:** every listed rule is covered.
   - readTrend (A-TREND-01/02)
   - monthly-low/high break
   - volume at highs
   - shares-per-point top warning
   - merging nearby levels
   - bearish counter-move clock
   - topped before the market
   - The 5-point stop cap (A-STOP-02) was deferred to item 4. That is reasonable, not a gap. PLAN.md says that test "will fail today", item 2 adds only passing tests with no behaviour change, and item 4 is the item that writes the failing test and fixes it.

## Gaps
1. **The pyramid test "never adds to a losing position" does not test the guard** (`lib/gann/pyramid.test.ts:36`).
   - Removing the profit guard (`lib/gann/pyramid.ts:100`, changed to `if (false)`) leaves this test green. The price-99 and price-100 cases still return null through the later break-even check (`pyramid.ts:118-120`).
   - The commit message says "Each new assertion was checked to fail when its rule is broken". That is not true for this test.
   - Fix: also assert `reason` matches `/hasn't yet gained/`, or use a fixture where only the profit guard blocks the add.
2. **The ten-degree-counts test does not test `WHEEL_COUNTS` for 45, 90, 120 and 180** (`lib/__tests__/gann.test.ts:97`).
   - Removing those four counts from `WHEEL_COUNTS` (`lib/gann/timeCycles.ts:69`) leaves the test green, because `DAY_COUNT_BANDS` (l.76-86: 42-49, 85-92, 112-120, 175-185) opens the window on those days anyway.
   - Fix: also assert that the exact count date appears in `r.dates` when `asOf` is a few days before it. `dates` comes only from the wheel counts and the cycle years, not from the bands.

## Feature entries

| id | verdict | reason | test that satisfies it |
|---|---|---|---|
| A-PYRAMID-04 | FAIL | The code refuses an add below a full risk unit of profit, which covers any loss (`lib/gann/pyramid.ts:99-100`). The new test does not fail when that guard is removed (gap 1), so it does not establish the rule. It passes once the reason, or a fixture where only the guard blocks, is asserted. | none yet (`pyramid.test.ts:36` is close) |
| C-TIME-10 | FAIL | `WHEEL_COUNTS` (`timeCycles.ts:69`) matches the list exactly, and the windows count one day per degree (l.198-200). The new test does not separate 45, 90, 120 and 180 from `DAY_COUNT_BANDS` (gap 2). It passes once the `dates` assertion is added. | none yet (`gann.test.ts:97` is close) |
| C-LEVELS-17 | PASS | `FRACTIONS` in `lib/gann/retracement.ts:41-48` holds the eighths and thirds, including 3/8 (0.375) and 5/8 (0.625). The 1/2 ranking is already tested. The new test fails when 5/8 is moved. | `retracement.test.ts:60` "places 3/8 and 5/8 at their eighths of the swing", together with the existing "assigns the disclosed importance ranking" test |
| C-TIME-41 | PASS | `timeCycles.ts:202-206` projects the same calendar date `y` years ahead from each major pivot, including y=1 (`MAJOR_CYCLE_YEARS`, l.113). The test asserts the window is open on 2026-01-21 and closed on 01-31. It fails when 1 is removed from `MAJOR_CYCLE_YEARS`. | `gann.test.ts:113` "opens a window on the same calendar date a year after a pivot" |
| A-TIME-30 | FAIL | The rule has two parts, and neither new test covers either: 360 is "a time" and 180 is half a time; and the unit can be days, years or degrees. The new test only shows windows opening at 180 and 360 days, the same as every other count. `readYearFraction`/`YEAR_FRACTIONS` (`disclosedRules.ts:204-215`, 360 "anniversary" rank 1, 180 "1/2 year" rank 2) is still untested for these two. Years and degrees are not built (a structural difference). Gann's own p.372 contradicts the rule (a time = 20 years). | none |

**Summary: 2 PASS (C-LEVELS-17, C-TIME-41), 3 FAIL.**

## Re-review after dd2a475 (tightening commit)

dd2a475 changes only two test files: `lib/__tests__/gann.test.ts` and `lib/gann/__tests__/pyramid.test.ts`. Mutations were run on a scratch copy, as before.

- **Without mutation:** gann.test.ts and pyramid.test.ts pass, 26 of 26 tests.
- **Pyramid profit guard turned off** (`pyramid.ts:100` changed to `if (false)`): "never adds to a losing position" now **fails**. Its new reason assertion (`/hasn't yet gained/`) catches it. Gap 1 is closed.
- **45, 90, 120 and 180 removed from `WHEEL_COUNTS`:** the ten-counts test now **fails** ("45 days: expected [] to include '2025-03-07'").
  - Each of 90, 120 and 180 was also removed on its own, and each makes the test fail on its own count.
  - Gap 2 is closed.

| id | verdict | reason | test that satisfies it |
|---|---|---|---|
| A-PYRAMID-04 | PASS | The profit guard (`lib/gann/pyramid.ts:99-100`) refuses any add before the last lot gains a full risk unit, so a loss is never averaged. The test now proves the refusal comes from that guard, and it fails when the guard is removed. | `lib/gann/__tests__/pyramid.test.ts:36` "never adds to a losing position" |
| C-TIME-10 | PASS | `WHEEL_COUNTS` (`lib/gann/timeCycles.ts:69`) is exactly 45/90/120/135/180/225/240/270/315/360, one day per degree (l.198-200). The test asserts each count's own date, so the day-count bands no longer hide a missing count, and it fails when any band-covered count is removed. | `lib/__tests__/gann.test.ts:97` "opens a window on each of the ten degree counts from a pivot, and not between them" |

**Final result for the five entries:** A-PYRAMID-04, C-TIME-10, C-LEVELS-17 and C-TIME-41 PASS. A-TIME-30 FAIL, unchanged: no test asserts 360 as the full time and 180 as half a time, and the years/degrees part is not built.
