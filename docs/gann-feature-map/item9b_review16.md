# Review 16: A-LEVELS-04 at ba5fd18 (worktree /home/claude/gsps-item5s4)

**Verdict: FAIL, narrowly. Keep `passes` false for now.** Review 15's M1 and L2 are fixed for every equity priced at a few dollars or more. But the fix is an absolute one-cent tolerance, and it is applied on the scan and replay surfaces too, where the level is exact. On sub-dollar instruments the platform scans (DOGE/USD in `lib/sectors.ts:43`, XRP among `lib/data/alpaca.ts:126`'s known crypto), that cent cancels review 14's H fix: the lower-second-top hold. It is a one-line fix (N-M1 below). With that fix and a bottom-side test (N-L1), I would flip the field. L1 does not block.

## Checks (run once, at the end)
- `npx vitest run`: 288 files, 3022 tests passed.
- `npx tsc --noEmit -p .`: clean.
- `npm run -s check:terms`: clean (785 files + 2 public docs).
- `git status`: clean. The probe test I added was deleted. Mutant script: `mut.py`, log: `mutants.txt`, both in this folder.

## Review-15 items
| R15 | Status | Evidence |
|---|---|---|
| M1: placement rebuilt the crossed level from cent prices | **Fixed for normal prices** | `multipleTops.ts:159,174-176`. Probe: over all reaction pairs from $1 to $500 (tops and bottoms, entry L±p/3, stop L∓p, both rounded to cents), the most the rebuilt level ever moved was 0.0025. The theoretical bound for (3e+s)/4 is 0.005. Both are inside 0.01. The reviewer's 10.05/10.45/8.84 case is pinned (`failedTop.test.ts:351-355`). |
| L2: the lesson overstated the hold | **Fixed** | `curriculum.ts:718` now reads "a move that has to clear that top by 3 points to reach its first target". That matches `inPath` (`multipleTops.ts:179-182`). The waiting rule ("until a close clears that top by 3 points") also describes the crossing as the way through. |
| L1: scan/replay verdict wiring tested by regex only | **Still regex-only. Acceptable, does not block** | See below. |
| M2: a 15-minute pass vs a daily pass | With the owner, unchanged | Not re-examined. |

## New findings

**N-M1 (M). On sub-dollar symbols the one-cent tolerance cancels the lower-second-top hold, on the scan and in the replay.**
- Where: `multipleTops.ts:174-176`.
- The tolerance is an absolute $0.01. It also applies where `crossedLevel` is exact: `scanTicker.ts:461` and `replay.ts:890,1398` pass `trigger.level` directly. Only placement rebuilds the level from cents. So the cent is not just a rounding allowance; it widens the rule everywhere.
- Gann's allowance at sub-$25 prices is clamped at 12% (`pointScale.ts`). A cluster's tests can sit up to 12% apart, so the latest, lower top can sit up to about 6% under the cluster mean. At DOGE's price of about $0.16, 6% is under one cent. So every crossing of a lower second top is now exempt, which review 14 H deliberately holds.
- Probe on `failedTestInPath`, crossing X = L − 0.0099:
  - L = 0.16: exempt. The arming close (X + 3 pts = 0.1681) sits 6.9% of price short of the pass line (0.1792). That is more than half Gann's allowance. It is review 14's H at about half strength.
  - L = 0.58 (XRP): exempt, 1.9% short.
  - L = $1: 1.1% short. L = $2: 0.55%. L = $5: 0.22%. L = $10: 0.11%.
  - Bottoms mirror the same way. At B = 0.16, a short's arming close of 0.1495 against a pass line of 0.1408.
- Scenario: DOGE/USD tops at 0.165, then 0.156, and closes 3 points under. The cluster mean is 0.1605; the latest top is 0.156. The entry trigger crosses 0.156. 0.156 ≥ 0.1605 − 0.01, so the scan shows Execute and the replay enters. At the commit before ba5fd18, both held it to Watch.
- Fix (smallest): keep `>=` / `<=` exact when the level is exact (scan, replay, and `confirmNow` when its caller passes the trigger's own level). Apply the rounding allowance only where the level was rebuilt from cents (`place-order.ts:257,275`), and size it to the actual bound, half a cent. For example, give `protocolCrossedLevel` callers a `tolerance` argument, or snap: `crossed + 0.005 >= level`.
- Better fix: carry the exact crossed level on the plan and the ticket, as review 15 suggested.
- Related, pre-existing and outside this rule (for the owner): `lib/strat/levels.ts:811` rounds every plan price to cents, crypto included. A DOGE plan's entry and stop therefore carry up to 3% rounding. Sub-dollar plans cannot express Gann's 3 points faithfully on any rule.

**N-L1 (L). The bottom side of the tolerance is untested.**
- Mutant B1 removes the bottom tolerance entirely (`crossedLevel <= failed.level`), and it survives every related test.
- The cent fix is only pinned for tops (`failedTop.test.ts:344-363`).
- Scenario: a short at an equal-bottoms failed double bottom. Its rebuilt level lands a fraction over B, so placement refuses what the scan excuses. That is review 15's M1, mirrored, and nothing would catch it coming back.
- Fix: mirror the reviewer case and the sweep for `bearish` with `protocolCrossedLevel(cents(B - x), cents(B + 3x))`.

**N-L2 (L). Placement can now be looser than the scan by up to half a cent.**
- The rebuilt level can sit up to 0.005 above the true one.
- Example: a true crossed level of L − 0.013 is held by the scan, but can be rebuilt as L − 0.009 and excused at placement on the advised-ticket path.
- At equity prices this is a sub-cent edge. N-M1's fix (allowance only at placement, sized to half a cent) bounds it.

**L1 (carried, does not block).**
- The regexes in `failedTop.test.ts:288-300` pin the exact argument text: `failedTops, scoreDirection, levels, crossingLevelOf(gannTrigger)` and the replay equivalents.
- So dropping the argument, swapping it or substituting `null` all fail (review 15's N3 and N5).
- `levels` and `crossingLevelOf(gannTrigger)` are built from the same `gannTrigger` on both surfaces (`scanTicker.ts:270,317,461`; `replay.ts:1398`). That leaves no hidden mismatch for a behavioural test to find.
- What only a behavioural test would catch: a reordering of the hold composition. For example, a later `applyStopBreachHold` or `applyDataLagHold` turning a Watch back into Execute, or `levels` being re-derived from another trigger.
- If the owner wants it closed: call `replay.ts`'s exported verdict helper (the function ending at `:1399`), or `scanTicker`'s with mocked fetches, on a failed-double-top fixture twice:
  1. A crossing trigger whose level equals the top: assert `outputState` is Execute and there is no `failedTop` breakdown row.
  2. The lower second top crossed: assert Watch with the `failedTop` row.

## Mutants (on `lib/gann/multipleTops.ts`, run against failedTop, failedTopPlacement, confirmNow, replay and replay-reaction tests)
| ID | Mutation | Result |
|---|---|---|
| T1 | tolerance 0.005 | survived. Harmless: the observed bound is 0.0025. Shows the tests do not pin the size. |
| T2 | tolerance 0.0026 | survived. Same reason. |
| T3 | tolerance 0.0199 | survived. Only the L − 0.02 assertion bounds it from above. |
| B1 | bottoms exact (no tolerance) | **survived**: N-L1 |
| B2 | bottom tolerance with the wrong sign | killed ("mirrors for a short at a failed bottom") |
| B3 | bottom tolerance 0.019 | survived (as T3) |
| R1 | relative tolerance, 0.1% of level | killed (L − 0.02 at L = 110) |
| S1 | tolerance scaled by price (0.5¢ × L) | killed |

T1–T3 and B3 survive because the tests bound the tolerance only loosely ([0.0025, 0.02)). That is acceptable for an engineering constant. B1 is the gap that matters.
