# Review 18: A-LEVELS-04 at 680f1d0 (worktree /home/claude/gsps-item5s4)

**Verdict: PASS. `passes` may flip to true.** Review 17's M1 is fixed, and I found no other drift-prone comparison with a realistic failing scenario. Nothing H or M remains. The accepted items are unchanged: the half-cent placement slack, and the 15-minute close as the pass, which sits with the owner.

## Checks (each run once)
- `npx vitest run`: 288 files, 3026 tests passed.
- `npx tsc --noEmit -p .`: clean.
- `npm run -s check:terms`: clean (785 files + 2 public docs).
- `git status`: clean before and after the mutants. Every mutant was applied to a source file and then restored. No test files were added.

## Review-17 items
| R17 | Status | Evidence |
|---|---|---|
| M1: float drift in the cluster mean | **Fixed** | `multipleTops.ts:159,174-176` compares with a relative 1e-9. The test at `failedTop.test.ts:374` covers three equal 42.70 tops and a drifting bottom. Mutants N1/N2 (exact compare) and N4 (wrong sign for bottoms) are killed. |
| L2: context-factor comment | **Fixed** | `contextFactors.ts:189-192` |
| L1: half-cent placement slack | Carried, accepted | `entryTrigger.ts:936-949` |

## Rule end to end
- **Reading** (`multipleTops.ts:70-118`): it judges the cluster holding the latest swing. A close 3 points the far side makes the test fail, and it stays failed until a close passes the level by 3 points or a new swing forms. This matches W006 pp.14-15 and 44 and the source notes (A05: the 1934 double top failed at 112, and a third test decides).
- **Same `failedTestInPath` on every path:**
  - scan hold: `score.ts:786`, wired at `scanTicker.ts:407,451`
  - replay: `replay.ts:890,1398`
  - placement: `confirmNow.ts:196`, via `place-order.ts:257,275`
  - context factor: `contextFactors.ts:195`
- **Exit:** `exitRules.ts:240-253` matches the test by its session timestamp, which is exact integer data and so not open to drift. Mutant N6, which matches by index instead, is killed.
- **Card line and lesson:** consistent with the rule. The card line is `disclosedRules.ts:718-721` and the lesson is `curriculum.ts:718`.

## Other float and exact-equality comparisons
Probe: `probe.mjs` (three equal cent tests from $0.01 to $1,000; 15,818 of the means drift).
- **"away" and "past" lines** (`:102-103`): a cent close never lands on a different side of the line between the drifted mean and the exact price. **0 flips.**
- **Cluster membership at the band edge** (`:60`): **0 flips.**
- **The "in path" pass line** (`:181-182`): it compares the entry and TP1 with `<` and `>` against an irrational-valued line. The crossing case is handled by the exemption before this test runs.
- **`sameTest`:** compares timestamps, so it is exact.

## Findings
**L1. Exact-boundary close on the "away" test is untested.** This is not drift. Where the allowance is exactly representable, a cent close can sit exactly on the line:
- every quarter-dollar level up to about $11.6, where the 12% clamp applies
- $200, the anchor price

Example: a double top at 10.00 and a close at exactly 8.80 do **not** read failed, because the test is a strict `<`. Gann's "3 points under" arguably includes exactly 3 points. Mutant N5 (`<=`) survives. This is rare and ambiguous, so it is not a blocker. Pick one reading and pin it with a test; the same applies to `past`.

**L2 (carried).** Placement can excuse a crossing up to half a cent short of the level, where the scan holds it. This is already accepted.

## Mutants
Run against the failedTop, failedTopPlacement, timeRulesAndTops, exitRules, replay and confirmNow tests (154 tests).

| ID | Mutation | Result |
|---|---|---|
| N1 | tops: exact `>=`, no epsilon | killed (1) |
| N2 | bottoms: exact `<=`, no epsilon | killed (1) |
| N3 | LEVEL_EPSILON 1e-3 | killed (3) |
| N4 | bottoms: epsilon with the wrong sign | killed (3) |
| N5 | "away" `<` changed to `<=` | **survived** (L1) |
| N6 | exit `sameTest` by index, not timestamp | killed (1) |
| N7 | in-path TP1 `>` changed to `>=` | killed (1) |
| N8 | LEVEL_EPSILON 1e-4 | killed (2) |

Mutant log: `mutants.txt`. Script: `mut.py`. Probes: `probe.mjs`, `probe2.mjs`.
