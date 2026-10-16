# Review 17: A-LEVELS-04 at 5247256 (worktree /home/claude/gsps-item5s4)

**Verdict: FAIL, narrowly. Keep `passes` false.** Review 16's N-M1 and N-L1 are fixed as described. But going back to an exact comparison exposes a floating-point defect that the one-cent tolerance had been hiding (it also existed at review 14). On the scan and in the replay it holds Gann's textbook breakout: a crossing of an equal-priced triple top or bottom, which is the failed level itself. Placement lets the same trade through. The fix is one line (M1 below). With that fix in, I would flip the field.

## Checks (each run once)
- `npx vitest run`: 288 files, 3025 tests passed.
- `npx tsc --noEmit -p .`: clean.
- `npm run -s check:terms`: clean (785 files + 2 public docs).
- `git status`: clean. The probe test I added (`lib/gann/__tests__/zz_review17_probe.test.ts`) was deleted. Mutant script: `mut.py`, log: `mutants.txt`, probes: `probe1-3.mjs`, `probe.out`, all in this folder.

## Review-16 items
| R16 | Status | Evidence |
|---|---|---|
| N-M1: the cent's tolerance applied on the scan and in the replay | **Fixed** | `multipleTops.ts:168` is exact again. The scan (`scanTicker.ts:461`) and the replay (`replay.ts:890,1398`) pass `crossingLevelOf(trigger)`, which is the exact pivot price. The DOGE lower-second-top case is held again. |
| N-L1: the bottom side was untested | **Fixed** | Mutants S1 (short bias sign) and E2 (strict `<` for bottoms) are killed. |
| N-L2: placement looser than the scan by up to half a cent | **Bounded as proposed, still present.** See L1. | `entryTrigger.ts:944-945` |

## Findings

**M1. Floating-point drift in the cluster mean makes the scan and the replay hold a crossing of the failed level itself (3+ equal tests). Placement exempts the same trade.**
- Where: `multipleTops.ts:62` computes the cluster level as a running mean, `(level * tests + p) / (tests + 1)`. `multipleTops.ts:168` then compares the crossed level to it exactly.
- Two tests never drift: `(a + a) / 2 == a`.
- Three tests at the same cent price can land one ulp off. Over every cent price from $0.01 to $1,000:
  - 7.9% sit one ulp above (tops) and 7.9% one ulp below (bottoms).
  - Example: 42.70, 42.70, 42.70 gives a level of 42.70000000000001.
  - Triples whose latest test sits exactly at the mean (for example 42.69, 42.71, 42.70) drift about 12.5% each way.
- Behavioural probe, using the real `readMultipleTops`, `computeGannEntryTrigger`, `gannEntrySource` and `protocolCrossedLevel`:
  - Three tops with highs of exactly 42.70 fail to 36.5. The trigger is `crossing` at level 42.70, the triple top itself.
  - `failedTestInPath(..., crossingLevelOf(trig))` holds it (the scan and the replay hold it).
  - The placement path, rebuilt from the cent plan with +0.005, exempts it.
  - At 42.71 there is no drift, and all surfaces exempt it.
- Effect:
  - The scan drops Gann's "a triple top crossed is a strong breakout" from Execute to Watch.
  - The replay skips the entry, so the measured population loses these trades.
  - The order ticket would still place it.
- Bottoms mirror this for shorts.
- Fix: compare with a relative epsilon far below a cent, for example `crossedLevel >= failed.level * (1 - 1e-9)` and the mirror `crossedLevel <= failed.level * (1 + 1e-9)`. Another option is to round the cluster mean to about 1e-9.
  - Mutant E3, which applies this to tops, passes all 124 related tests and clears the probe.
  - Add a test with three equal 42.70 tops (and three equal bottoms at a drifting price).

**L1 (carried N-L2). Placement excuses crossings up to a cent short of the failed level that the scan holds.**
- Sweep over cent prices: placement never refuses an exact crossing, for tops or bottoms (0 of 49,990).
- A crossing d short of the level is excused at placement in this share of cases:
  - d = 1/3¢: about 67%
  - d = 0.5¢: about 62%
  - d = 2/3¢: about 33%
  - d = 1¢: 0%
- Realistic case: two tops one cent apart, latest lower (10.45, then 10.44). The mean sits 0.5¢ above the latest top. The scan holds it to Watch, and an advised ticket on it is placed about 62% of the time.
- Size of the largest excused shortfall, as a share of price:
  - 0.03% at $25-200
  - 0.15% at $5-25
  - 0.66% at $1-5
  - 5.8% under $1
- At equity prices this does not matter. Under $1 it matters only for sub-dollar equities: placement calls confirmation with `assetClass: "us_equity"` (`place-order.ts:281`), so crypto symbols such as DOGE probably never reach this check at all (pre-existing; not verified end to end; outside this rule).
- The real fix remains carrying the exact crossed level on the plan and the ticket. This is not a blocker.

**L2. Context-factor comment is slightly off.**
- `contextFactors.ts:190-195`, `failedTopBeyondFirstTarget`, does not pass `crossedLevel`. A crossing-exempt trade that was entered therefore reads `false` ("in path").
- The comment says trades with a failed top in the path "are not entered". Crossing-exempt ones are.
- No data is lost: among entered trades with `thirdTestFailedAgainstTrade`, `false` identifies exactly the crossing-exempt ones. But the comment and any reading of this factor as "the excused population" should say so.

## Other surfaces a crossed level reaches
- `protocolCrossedLevel`: only `place-order.ts:257` (plan) and `:275` (advised ticket). Both pass the protocol's own stop. A resting kind gives null.
- `gannCrossedLevel` in `portfolio-manager.ts:327` feeds the round-number rule, not A-LEVELS-04. Orders it places still go through `place-order.ts`.
- `exitRules.ts:203`, `gann-exit-live.ts:115`, `evenFigures.ts:210`, `replay.ts:996,1043`: a different concept (the breakout-failure exit and round numbers). They do not use `failedTestInPath`.
- `failedTestInPath` callers: `score.ts:786` (the scan's hold), `replay.ts:890,1398`, `confirmNow.ts:196`, `contextFactors.ts:194` (L2).

## Mutants (against failedTop, failedTopPlacement, confirmNow and replay tests)
| ID | Mutation | Result |
|---|---|---|
| S1 | placement bias always + (wrong for shorts) | killed (1) |
| S2 | placement bias against the trade | killed (5) |
| C1 | CENT_ROUNDING 0.004 | killed (3) |
| C2 | CENT_ROUNDING 0.0099 | killed (2) |
| E1 | tops strict `>` | killed (31) |
| E2 | bottoms strict `<` | killed (2) |
| E3 | tops `>= level * (1 - 1e-9)` (the proposed M1 fix) | survived, as expected: shows the fix breaks nothing |
| P1 | plan path uses unbiased `gannCrossedLevel` | killed (1) |
| F1 | confirmNow drops `crossedLevel` | killed (1) |

## Owner questions (not blockers)
- Review 15 M2: does a 15-minute close count as the pass? Unchanged.
- Sub-dollar plans are rounded to cents (`levels.ts:811`). Crypto confirmation at placement fetches with `us_equity`.
