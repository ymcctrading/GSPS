# Review 15: A-LEVELS-04 re-review at db588ac (branch item5-step4)

**Verdict: FAIL, narrowly.** There are no H findings. Every review-14 finding is fixed. One new cross-surface inconsistency (M1) remains: the live scan and replay excuse a crossing that placement refuses, at the classic equal-tops double top. The fix is small (a cent tolerance, or store the crossed level). With that fix and a behavioural scan test (L1), I would flip the field to PASS. M2 is a design question for the owner. It does not block the flip on its own.

No tracked file was left changed (`git status` clean). The probes are kept in this folder: `zz15probe.test.ts`, `zz15probe2.test.ts`. Mutants: `mut.py`, log `mutants.txt`.

## Checks
- `npx vitest run`: 288 files, 3020 tests passed.
- `npx tsc --noEmit -p .`: clean.
- `npm run -s check:terms`: clean (785 files + 2 public docs).

## Review-14 findings
| R14 | Status | Evidence |
|---|---|---|
| H crossing exemption 3 pts short of the pass | **Fixed** | `multipleTops.ts:168` is now `crossedLevel >= failed.level` (bottoms `<=`). The allowance is monotone in price (`pointScale.ts`, power curve with exponent about −0.41 on pct, so absolute points rise with price), so X ≥ L implies X+3pts(X) ≥ L+3pts(L): the arming close is at or past the pass line. Tests at L, L+2, L−0.01 and L−3pts, with bottoms mirrored (`failedTop.test.ts:109-117,146-147`). |
| M latest-cluster selection unpinned | **Fixed** | Two new tests (`failedTop.test.ts:76-88`). My mutant N1 (review 14's L2: the cluster with the max `lastIndexInList`) is killed. |
| L placement read the attached stop | **Fixed** | `protocolCrossedLevel` (`entryTrigger.ts:936`). The plan path uses `plan.coordinates.invalidation` (`place-order.ts:255-257`). The advised path uses `entryStop` only (`:275`). Tested in `failedTopPlacement.test.ts:40-52,75`. |
| M card masking | **Documented, harmless to the hold** | `multipleTops.ts:95-98`. The failed latest cluster takes priority in `readMultipleTops`, so `failedTestAgainst` always sees it. Only the card line and `multipleTopCrossedWithTrade` lose a nearer crossed cluster. `contextFactors.ts:181-184` now says to compare runs on one STRATEGY_VERSION only. |
| L2 exemption untested behaviourally | **Partly fixed** | `confirmNow.test.ts:264-272` is now behavioural. The scan and replay-verdict wiring is still regex-only (see L1 below). |

## New findings

**M1. Rounded plan levels make placement refuse a crossing the scan and replay excuse, at equal-tops double tops.**
- Where: `place-order.ts:255-257,275` and `entryTrigger.ts:936-939` against `multipleTops.ts:168`.
- The live scan (`scanTicker.ts:461`) and the replay (`replay.ts:890,1398`) pass the exact `trigger.level`. Placement recovers it as `(3·entry + stop)/4` from levels rounded to cents (`levels.ts:404` rounds the stop, `:624` the entry).
- On cent-valued levels from $10 to $500, the recovered level is below the true one in 18,722 of 49,001 cases (38%), by under a cent. Example: L=10.05, e=10.45, s=8.84, recovered 10.0475.
- The exemption's comparison is exact `>=`. So when the crossed level equals the failed level (two or three tests at the same high: the cluster mean equals the pivot price exactly, and the trigger crosses that latest top), the scan shows Execute and the replay enters, but placement returns `awaiting_confirmation` ("The market failed at a double top…").
- The replay therefore measures trades production refuses.
- Fix: compare with a one-cent (or rounding-error) tolerance, or carry the crossed level on the plan or ticket rather than recovering it from rounded prices.

**M2. The exemption's "pass" is a 15-minute close. The rule's pass is a daily close.**
- Where: `confirmNow.ts:122-146` and `replay.ts:902-906` against `multipleTops.ts:103-105` and `exitRules.ts:238-251`.
- A crossing confirms on an execution-timeframe close past `gannBreakLine`. `readMultipleTops` lifts a failure only on a daily close past L+3pts.
- Probe (`zz15probe.test.ts`):
  - Failed double top at L=110.50, pass line 115.78.
  - The crossing at L is excused. A 15-minute close at 116.08 confirms, and the fill is at 112.26.
  - The day closes at 112.5, and the following sessions close between 112.9 and 114.
  - The daily reading still says `failed` (same `lastTestIndex`). `readGannExit` returns `exit: null`: the failed-top exit sees the same test as at entry, and the hold test needs a close under L−3 = 105.2.
- So the platform holds a long while its own card says "failed on its second test, a top", and no failed-top exit can fire until a new test forms.
- Live and replay agree, so this is not a parity break. It is a fidelity and premise gap: "the close the entry waits for is the pass" is true only on the same timeframe.
- For the owner: either require the crossing's daily close for the exemption, or treat the post-fill daily reading as passed once the entry's crossing confirmed. This predates db588ac (beca553 introduced the exemption).

**L1. The scan and replay-verdict exemption wiring is pinned by regex only.**
- Mutants N3 (`scanTicker.ts:461` passes `null`) and N5 (`replay.ts:1398` passes `null`) are killed only by `failedTop.test.ts:291,296` source regexes.
- No test runs `applyFailedTopHold` through a scan or replay verdict in which the crossing flips Execute or Watch. The replay entry skip (N4) is behaviourally covered.

**L2. The School lesson overstates the hold.**
- `curriculum.ts:718` says Mr. Bull "doesn't buy a move whose first target sits at or above that top".
- The code holds only when TP1 is past L+3pts (`multipleTops.ts:173`). A TP1 at the top, or within the allowance of it, is deliberately not held ("sells at the top", `:144-146`).
- The lesson also doesn't mention that the crossing entry is the way through.

**Open, unchanged:**
- R14 M3: the rule's reach (a failed top stands in 47% of readings) is unmeasured. No replay has run on `2026-10-16-gann-failed-tops-crossing`.
- R13 L3: the client-sent `entryTarget` and `entryStop` are trusted.
- R14 L3: a pass followed by a fall back is a design choice.
- Review 14's 3.4% window-slide residual of stale exits was not re-measured.

## Mutants (none in claude-progress.txt's list; run on lib/gann, lib/lifecycle, lib/trade, lib/scoring, lib/backtest and replay.test.ts: 996 tests)
| ID | Mutation | Result |
|---|---|---|
| N1 | `latest` = cluster with max `lastIndexInList` (R14's L2) | killed ("forgets an old failed top once a newer swing top stands apart") |
| N2 | bottoms only: loose exemption `<= beyondByThreePoints(level, 1)` | killed ("mirrors for a short at a failed bottom") |
| N3 | live scan passes `null` crossed level | killed, regex only |
| N4 | replay entry skip passes `null` | killed, 29 tests, behavioural |
| N5 | replay verdict hold passes `null` | killed, regex only |
| N6 | plan-path `crossedLevel: null` in place-order | killed (failedTopPlacement) |
| N7 | confirmNow ignores `input.crossedLevel` | killed (confirmNow behavioural) |
| N8 | `crossingLevelOf` returns level for any kind | killed |
| N9 | pass line = level (no 3 points) | killed |
| N10 | exit `sameTest` compares levels instead of swing session | killed (review 12 H1 test) |
