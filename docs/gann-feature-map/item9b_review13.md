# Review 13: A-LEVELS-04 re-review at de40345 (with dedd72f)

**Verdict: A-LEVELS-04 FAIL.** All of review 12's findings are fixed or partly fixed. The new "a failed top stays failed until passed" rule is faithful to Gann in principle, but it does not survive `readMultipleTops`' nearest-cluster selection. A failed top can drop out of the reading and come back. When it comes back, a trade exits on a failure that stood before the fill, and the entry hold misses it. The change doubled how often that happens. On top of that, the "passed" logic is untested, and the claim that P2/P3 are equivalent is false. Guided Mode and the demo account apply a stricter hold than the scan and the replay.

I made no edits in `/home/claude/gsps-item5s4` (its HEAD is 371e47d, which is de40345 plus a progress note). I worked in scratch worktrees `rev13` (de40345) and `rev13b` (dedd72f). The tools are in `scratchpad/review13/tools/`: `probe13.test.ts`, `mutate13.py`, `eqv.py`/`eqv.test.ts` and `stale.test.ts`. Their logs are in `scratchpad/review13/`.

## Checks
- `npx vitest run lib/gann lib/lifecycle lib/trade`: 88 files, 903 tests passed.
- `npm run -s check:terms`: clean (785 files plus 2 public docs).
- STRATEGY_VERSION was bumped twice, to `...-third` and then `...-passed`. No replay has run on either.

## Review-12 findings
| R12 | Status | Evidence |
|---|---|---|
| H1 exit suppressed for excused entries | **Fixed** | `exitRules.ts:232-236`: `sameTest` compares the latest test's session (`.t`). The new test (failedTop.test.ts, "review 12 H1") exits on the third test. Mutants M6, M7 and M8b are killed. Caveat: see H1 below. |
| M1 placement fails open without TP1 | **Fixed for the ticket and plan paths; regressed elsewhere** | `place-order.ts:252,266` reads the plan's TP1 or `entryTarget`. `confirmNow.ts:189` uses ±Infinity when TP1 is unknown, so it fails closed. Manual Override cannot move it: `order-ticket.tsx:452-455` sends `levels.takeProfit1`. Guided Mode and the demo account send no target (see M1 below). |
| M2 inclusive TP1 bound | **Fixed** | `multipleTops.ts:149-152`: TP1 must be beyond level + 3 pts. Mutants M13, M14, M15 and M15b are killed. |
| M3 unmeasured | **Partly fixed** | The `failedTopBeyondFirstTarget` factor is added (`contextFactors.ts:190-192`) and wired in the replay (`replay.ts:1055,1087`). No replay has run. `thirdTestFailedAgainstTrade` still measures the unbounded reading, and that reading now has a new (persistent) meaning. |
| L1 survivors A1/A3/A4/E2/E4 | **Mostly fixed** | Boundary mutants M15, M15c and M15d are killed, and a fill-session test was added. The window-edge mutants still survive (L1 below). |
| L2 window anchoring | **Partly fixed** | The window is now anchored on the next bar or the next weekday (`exitRules.ts:218-228`). Holidays are ignored, and the edge mutants survive. |
| L3 hold lifts on a re-test | **Fixed by de40345** | `multipleTops.ts:91-97`. The School copy (`curriculum.ts:718`) and the notes (`confirmNow.ts:196`, `score.ts:797`) match the code. |

## Findings at de40345

**H1. A failed top drops out of the reading when another cluster is nearer to price. Trades then exit on a failure that stood before the fill, and the hold misses it.**
- `multipleTops.ts:81` keeps only the double-top cluster *nearest the price*. Only that cluster can be "failed", and only if it holds the latest top (line 85).
- So a failed top at 110.5 is invisible while price sits near an older double top at 96.5.
- Probe Q1: entry at 97 with TP1 120 is not held. Price then rallies to 104 with no new swing, the 110.5 top "reappears" as failed, and `readGannExit` returns `failed_top`.
- Random walks (120 walks × 41 entries, 10-session horizon, `stale.test.ts`): 33 of 281 failed-top exits are stale at dedd72f, and **71 of 472 (15%)** at de40345. Stale means both the test and its 3-point failure printed before the fill. Every one of them was hidden in the entry reading.
- This contradicts the exit's own premise (`exitRules.ts:204-216`): a test that already failed at entry is part of the setup. It also contradicts de40345's claim that the failure lasts until it is passed.
- Fix: compute the failed state for the latest-top cluster on its own, independent of which cluster is nearest. Add Q1 as a test.

**M1. Guided Mode and the demo auto-trader place orders with no target, so they hold under *any* failed top beyond the entry.**
- `lib/guided/order.ts:31-54` sends `entryStop` but no `entryTarget` and no `sourcePlanId`. That order is used by `app/api/guided/execute/route.ts:220` and `lib/demo/auto-trade.ts:326`.
- The placement check then reads TP1 as undefined (`place-order.ts:266`), which becomes Infinity (`confirmNow.ts:189`).
- Result: the scan says Execute, the replay enters, and the ticket allows a range-foot buy whose TP1 sits under the failed top. Guided and the demo refuse that same buy with `awaiting_confirmation`. That is review 11's H1 again, on the novice path.
- Fix: send `entryTarget: levels.takeProfit1` from `guidedOrder`.

**M2. The "until passed" rule is untested, and "P2/P3 equivalent" (claude-progress.txt:784) is false.**
- These mutants survive both the narrow suite and the wide suite (lib/gann, lifecycle, trade, scoring, backtest, `__tests__`, components/trade):
  - **M4**: drop `!passed` entirely.
  - **P2**: the pass test for tops loses its 3 points.
  - **P2b**: the same for bottoms.
  - **P3**: the pass is searched before the close-back as well as after it.
- On random walks with realistic highs and lows (57,840 readings, `eqv.py`), they change the reading on this many readings:
  - P2: 3,213 (5.6%)
  - P2b: 3,543
  - M4: 418
  - P3: 116
- The existing "passed" test (failedTop.test.ts:41-45) only covers a case where a crossing or a new swing already clears the state.
- Fix: add a fixture where price passes the level by the 3 points, falls back within 5 sessions, and has no confirmed new swing. Add one where price closes over the level by less than the 3 points with no swing confirmed yet.

**M3. The rule's effect grew roughly 1.6-2.5× and is still unmeasured.**

| | dedd72f | de40345 |
|---|---|---|
| A failed top stands against a long (fixed-TP1 walks) | 24.1% of sampled days | 36.6% |
| ...plan pool (review-12 rate harness) | 22.9% | 37.8% |
| In the TP1 path, TP1 at +5/+10/+15% of 3,000 days | 0 / 113 / 275 | 69 / 278 / 491 |
| In the path, real plan pool | 0.0% of days | 0.4% |
| Failed-top exits per 10-session long | 6.4% | 10.1% |

- No replay has run on either STRATEGY_VERSION.
- Against the live plan pool, the hold is nearly dormant. The rule acts almost entirely through the exit.

**L1. Survivors that are not equivalent.**
- Exit window: M8 (`sameTest` by index rather than by time), M9 (next calendar day rather than next weekday), M10/M10b (window ±1-2 days) and M10c (entry window anchored on the last bar). None of the window edges are pinned.
- Ticket: M19 (`entryTarget` = `masterProfit`) and M20 (`entryTarget` dropped) survive including components/trade. `order-ticket.test.tsx` never asserts `entryTarget`. Both fail closed, so these only over-hold.

**L2. An entry just above an unpassed failed top is not held.**
- `failedTestInPath` requires `level >= entry` (`multipleTops.ts:151`), while the top stays failed up to level + 3 pts.
- Probe Q2: price is at 112, which is over 110.5 and under the 115.8 pass line. The reading is `failed`, but entry 111.5 with TP1 125 is not held.
- A crossing entry is priced at the pass line, so this mostly affects `oldLevel`/`hold` entries.
- The entry bound should be `entry < beyondByThreePoints(level, 1)`.

**L3. Two smaller points.**
- A TP1 within the 3 points *above* a failed top is excused as "sells at the top". At $110 that band is about 4.8% wide, and TP1 there needs a move through the old top. It is defensible, but it is a design choice for the owner.
- The advised path trusts the client's `entryTarget` (`/api/orders`), as it already trusts `entryStop`. A direct API call can clear the check. This is pre-existing and comes from the same design.

## Faithfulness and parity
- Persistence until a close passes the level by the 3 points matches W006 pp.14-15 and p.44: the buying point is the crossing by the allowance. A held double bottom counting as failed against a short until a close 3 points under it is the faithful Polarity mirror.
- Its reach is wide: 36% of readings show a failed bottom against shorts. That is expected, because nearly every double bottom bounces 3 points.
- The card text (`disclosedRules.ts:721`) still reads correctly.
- No lookahead found. Confirmation reads completed sessions (`confirmNow.ts:190`), and the replay reads `history < i`.
- Live scan, replay and ticket/plan placement agree. Guided and the demo do not (M1).

## Summary
Review 12's H1/M1/M2 are fixed, but A-LEVELS-04 is still **FAIL**. A failed top flickers in and out with nearest-cluster selection, so 15% of failed-top exits fire on a failure that stood before the fill (H1). Guided and the demo over-hold (M1). The new "until passed" logic is untested, and its equivalence claim is false (M2).
