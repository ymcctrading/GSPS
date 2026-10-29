# The rule ladder: proving each rule one at a time

Internal. Part of the 2026-10-29 rebuild from the core (owner: "let's rebuild
from the core"). The six-year daily run (829 large caps, 2020-11 to 2026-10)
lost: −0.018R over 63,678 trades, Execute −0.081R. Dozens of rules act
together and none was proven alone. The rebuild measures a bare core first,
then adds each existing rule back one at a time, keeping it only if it
improves the core on years it was not decided on.

Code: `lib/backtest/ruleLadder.ts` (the rungs and their order),
`lib/backtest/walkForward.ts` (the keep test), `readSessionRules` in
`lib/backtest/replay.ts` (GSPS's reading of a session, which each rung reads).
The core walker is `lib/backtest/replayCore.ts` (the "Build the bare Gann
core strategy" thread); it calls the ladder's rules at each candidate first
entry through its `rules` hook.

## What a rung is

Each rung is one existing GSPS rule, read the way the live scan reads it on
the session the core enters on, for the core's side:

- a **pillar** rung allows the entry when that pillar passes;
- a **hold** rung allows it unless that hold would hold an Execute there
  (each hold read on its own, whatever the score or the other holds read).

Where GSPS priced no buying point on that side that session, the pillar rungs
refuse and the hold rungs allow.

Three **reference** rules are read too and reported against the core alone,
never kept: GSPS priced a buying point (`ref:plan`), the score reached the
Execute cutoff of 7 (`ref:score7`), and the verdict was Execute
(`ref:execute`). They say what GSPS's own verdict would have done to the core.

## The order (fixed before any run)

Gann's own pre-trade checklist, "How to Trade" (Master Course Ch. 7, Nov
1935, PDF 234-238; restated Ch. 10A, PDF 293-294), then his instrument
checks, then the holds with "when not to trade" (C14) first:

| # | Rung | Gann's check |
|---|---|---|
| 1 | pillar:marketCycle | C1-C2, the year's forecast and the stock's own cycle |
| 2 | pillar:timeFactors | C3-C5, time squaring on the monthly, weekly, daily |
| 3 | pillar:priceLevels | C6-C7, resistance levels, half-way points, held levels |
| 4 | pillar:volumeAccumulation | C8, the volume trend |
| 5 | pillar:geometricAngles | C10, the angles |
| 6 | pillar:definiteIndication | C11-C12, the definite indication and the stop |
| 7 | pillar:trendAllTimeframes | C13, monthly, weekly and daily confirming |
| 8 | pillar:relativeStrength | S4-S10, buy the strong, sell the weak |
| 9 | pillar:activity | S1-S3, active stocks that follow the rules |
| 10 | hold:breakaway | C14, stay out of a narrow range until it breaks away |
| 11 | hold:monthlyBreak | a break of the prior month's low warns |
| 12 | hold:distributionBreakdown | a narrow spell broken on volume |
| 13 | hold:failedTop | a top price failed at is resistance |
| 14 | hold:timeWindow | a counter-trend turn needs time and price together |
| 15 | hold:ruleFollowing | trade stocks that follow the rules |
| 16 | hold:weakStock | weak stocks are not bought |
| 17 | hold:figureCrossing | the third time through a round number |
| 18 | hold:readyNow | targets ahead, profits exceed losses |

Fixing the order first makes each rung one test, not the best of many tries.
Holds added to the live scan after this was written (the campaign-section and
market-trend holds in the merge queue) join the ladder after rung 18, in the
order they merged, once `REPLAY_HOLD_KEYS` names them.

## The keep test (pre-registered)

- **Unit:** one campaign (a position with its adds), R on the whole line, by
  the ET year of its first entry.
- **Measure:** mean R per campaign. Capital is the scarce thing (Gann's five
  stocks), so a filter earns its place by making the trades taken better.
- **Folds:** anchored walk-forward by calendar year. Test years 2022, 2023,
  2024, 2025 and 2026 (to the run's end). For test year Y the decision uses
  every campaign before 1 January Y: add the rule if its kept campaigns' mean
  R there beats the current set's, on at least 100 campaigns. The decision is
  applied to year Y alone.
- **Keep** the rung when, pooled over the test years, the campaigns traded
  out of sample beat the current set's mean R, at least 200 out-of-sample
  campaigns remain, and at least 95% of 2,000 bootstrap draws over symbols
  agree the gain is above zero. The bootstrap re-runs the whole procedure,
  decisions included.
- **Climb in order.** Each rung is tested on top of the rungs kept before it.
- **Confirm.** Offline, a refused campaign is simply dropped; in a real run it
  could have changed what came after it on that symbol. So the kept set is
  run once with the rules gating (`ruleMode: "gate"`), and only that run's
  figures are quoted.

The years, the minimum counts and the 95% level are engineering choices, not
Gann's. With 18 rungs a rule that does nothing has about a 5% chance of
slipping through, so about one false keep is expected; the confirmation run
and the forward test are the check on it. Nothing is tuned: no rule's
threshold moves during the ladder. A rule that fails stays in the code and on
the live scan until the owner decides; the ladder reports, it does not delete.

## What is not on this ladder yet

The trade-management rules (the other exit rules, reversal when caught, the
re-buy after a stop, the final-stage trails) are not filters. Each needs its
own run with the core walker taking the rule as an exit hook, which the core's
first PR does not offer. They are the ladder's second stage, tested the same
way (a cell with the rule against the core, by year), once the hooks exist.

## Run plan (November, free tier)

Nothing runs before 1 November: October's Actions minutes are spent. Data
comes only from the Actions runner (this sandbox has no market-data keys), so
the runs go through `backtest-universe.yml`.

Estimated from the code, not measured: the core walker does far less per
session than the full replay (no score on every session), and a ladder reading
costs about 15 ms per candidate entry (measured on synthetic bars). The full
replay spent about 205 minutes on four slices, mostly scoring every session.

| Step | What | Estimate |
|---|---|---|
| 1 | Smoke run, 25 symbols, tag mode | ~5 min |
| 2 | Tagged core run, whole universe, one job | ~45 min |
| 3 | Ladder computed in the job from step 2 (printed) | in step 2 |
| 4 | Confirmation run, the kept rules gating | ~45 min |
| 5 | Spare, for one failed or cut-off run | ~45 min |
|  | Total | ~140 min (7% of 2,000) |

Order with the other rebuild threads: run step 2 after the survivorship fix
lands, so the universe is the one each date really had; a run before it
carries today's survivors back six years. Each step is dispatched only on the
owner's ask, with its estimate stated first, and stops if the usage meter
reaches its hold.

The job prints the ladder report and a compact campaign block
(`ladder-rows.csv.gz.base64`), so the ladder can be re-read locally with
`scripts/rule-ladder.mjs` without spending minutes.
