# 2026-10-20 full large-cap universe run, score bands: notes

Read this before the JSON beside it (`2026-10-20-766sym-score-bands.json`, with the summary
and all five reports). This is the first per-score-band run on the nine-pillar score.

## Provenance

| | |
|---|---|
| Workflow | "Universe backtest (manual)", run [39518863954](https://github.com/ymcctrading/GSPS/actions/runs/39518863954) |
| Code | `main@b5bb20d` (`b5bb20db41b27c469a0f936c254dfa5beb86b9a7`) |
| `strategyVersion` | `2026-10-20-gann-weekly-parity`. Includes the over-balance fix, P3 monthly strength, closed sessions and weekly parity. Does not include the time-pillar change |
| Universe | large-cap, 832 of 832 symbols, none skipped |
| Window | `2026-08-24T12:00:00Z` → `2026-10-20T20:45:00Z` · 15Min · `targetR` 2 · 40.5 minutes |
| Cells | five, all live rules: `useProductionStop`, `usePlanLevels`, `entryRule: "confirmed"`, `exitRule: "gann-runner"`. They differ only in `attributeScoreRange`: [0,3], [4,5], [6,6], [7,7], [8,9] |

All five cells have the same trades, as intended. The workflow's "identical trades"
warnings are generic and expected here, because `attributeScoreRange` changes only the
attribution. Each report confirms it was applied (`attributeWithin: "score 6–6"` and so on).

## Live rules, against the 2026-10-17 run

| Bucket | 2026-10-17 (`2026-10-17-gann-nine-pillars`) | This run |
|---|---|---|
| All | +0.002 (1,169) [−0.025, +0.030] | +0.020 (1,147) [−0.009, +0.048], win 22.4%, PF 1.12 |
| Execute | −0.085 (73) [−0.200, +0.038] | −0.040 (66) [−0.169, +0.090], win 10.6%, PF 0.83 |
| Watch | +0.009 (979) [−0.020, +0.037] | **+0.030 (966) [+0.001, +0.060]**, win 23.0%, PF 1.21 |
| Reject | −0.005 (117) | −0.038 (115), win 24.3% |

Halves, all trades: −0.014 (573), then +0.053 (574). Execute: −0.051 (33), then −0.029 (33).

The two windows differ by about a week at each end, and the universe has 832 symbols
against 824. Execute is still the worst bucket and still below Watch. For the first
time, Watch's interval is wholly above zero, but only just.

The timeouts still carry the result. 409 of 1,147 trades were still open at the
holding limit, marked at +0.338 on average (+138.3R in total). Without them, the
other 738 trades average about −0.157R. Initial stops (70 trades) average −0.856,
and three adverse closes (194) average −0.224.

## Score bands

Each band's n, expectancy and win rate are rebuilt from its factor table (passing plus
failing on any one row). All rows agree, and the 0–3 band equals the Reject bucket
exactly. **The reports carry no interval for a band.** The intervals below are
approximate: each band's mean ± 1.96 × 0.487 / √n, where 0.487R is the standard deviation
implied by the cell's overall interval. They are not from the report.

| Score | n | Expectancy R | ≈95% interval | Win rate | 1st half | 2nd half |
|---|---|---|---|---|---|---|
| 0–3 | 115 | −0.0384 | [−0.127, +0.051] | 24.3% | −0.136 (57) | +0.057 (58) |
| 4–5 | 331 | **+0.0417** | [−0.011, +0.094] | 21.1% | +0.002 (165) | +0.081 (166) |
| 6 | 328 | +0.0248 | [−0.028, +0.078] | 24.1% | −0.002 (164) | +0.052 (164) |
| 7 | 267 | −0.0087 | [−0.067, +0.050] | 20.6% | −0.051 (133) | +0.034 (134) |
| 8–9 | 106 | +0.0676 | [−0.025, +0.160] | 23.6% | −0.042 (53) | +0.178 (53) |
| 6+ pooled | 701 | +0.0185 | [−0.018, +0.055] | | | |
| 4+ pooled | 1,032 | +0.026 | [−0.004, +0.056] | | | |

**Where expectancy turns positive.** It turns positive at score 4 and stays at or near
zero all the way to 9. Above 4 it doesn't rise with the score. Score 7 is below score 6,
and 6+ pooled is below 4–5 (−0.023, approximate interval ±0.064). Each band is negative
in its first half and positive in its second, so the late part of the window lifts
every band.

**Execute is 66 of the 701 trades scoring 6 or more.** Holds keep the other 635 at Watch:

- `tradePlanPriced` held 526 of them. This is the even-money hold: the first target is
  no farther than the risk, or there is no plan.
- `breakaway` held 78.
- `weakStock`, `queerActing`, `figureCrossing` and `monthlyBreak` held a few each.

The 635 held trades average about +0.025R. The 66 that reach Execute average −0.040.
So the holds take out trades that do slightly better than the ones they let through. On
this sample, the Execute bucket's weakness comes from the holds, not from the score.

## Cutoffs (6 / 3.5)

- **Watch at 3.5:** consistent with the data. The 0–3 band is the only negative band, and
  4+ beats it by +0.064, though inside the approximate ±0.094 interval. Hold.
- **Execute at 6:** not supported, and not contradicted either. Nothing above 4 separates
  from the band below it, so there is no point to move 6 to. Hold it, and record that this
  run does not confirm it. The 2026-09-23 sweep (score 6 at +0.53, score 7 at +0.32) does
  not reproduce on the nine-pillar score.
- **The larger lever is `tradePlanPriced`.** It decides 75% of Execute's population at
  score 6+, and its held trades beat the trades it lets through. That is the place to look
  first. One option is a replay switch to measure score 6+ without the even-money hold.

## Pillars within the 6+ bands

The table pools bands 6, 7 and 8–9 (701 trades). A delta is the passing trades'
expectancy minus the failing trades'.

| Pillar | Pass | Δ R pooled | Δ at 6 / 7 / 8–9 | Reading |
|---|---|---|---|---|
| marketCycle | 608/701 (86.7%) | +0.022 | +0.077 / −0.123 / +0.055 (1 fails) | mixed |
| trendAllTimeframes | 639/701 (91.2%) | **−0.116** | −0.111 / −0.157 (96.3%) / −0.213 (99.1%) | **inverted in every band**, near saturation at 7+ |
| relativeStrength | 406/701 (57.9%) | +0.031 | −0.025 / +0.074 / +0.165 | positive now; it inverted on 2026-10-17 |
| activity | 266/701 (37.9%) | +0.035 | +0.048 / +0.039 / −0.120 | mostly positive |
| priceLevels | 589/701 (84.0%) | +0.050 | +0.069 / +0.072 / −0.483 (3 fail) | positive |
| geometricAngles | 202/701 (28.8%) | −0.005 | +0.038 / −0.107 / +0.034 | no signal |
| timeFactors | **685/701 (97.7%)** | −0.063 | −0.015 (95.7%) / −0.374 (99.3%) / constant 100% | **saturated** |
| volumeAccumulation | 622/701 (88.7%) | +0.043 | +0.020 / +0.088 / +0.193 (98.1%) | positive |
| definiteIndication | **682/701 (97.3%)** | **−0.392** | −0.426 (94.5%) / +0.083 (99.6%, 1 fail) / constant 100% | **saturated and inverted** |

- **definiteIndication.** It inverts at score 6, where 18 trades fail it and those average
  +0.427. Its trigger and stop parts pass on every trade, so the failures come from the
  greatest-reaction part. At 7+ it passes on almost everything. As on 2026-10-17, look
  at the greatest-reaction rule's translation first.
- **trendAllTimeframes** inverts in every band, and so does its check `swingChartTrend`
  (−0.084, −0.137, then +0.102 at 8–9 on only 6 fails). This repeats the run-12 and
  2026-10-17 pattern under the confirmed entry: trades that agree with the trend do worse.
- **timeFactors** gives a near-free point. It passes on 95.7%, 99.3% and 100% of trades.
  The time-pillar change is not in this build. Re-measure this pillar on the build that
  has it.
- **relativeStrength** no longer inverts, so the 2026-10-17 lead looks cured or was noise.
- Checks that are positive in most bands: `historicalSR`, `timePriceSquare` and
  `ruleOfThree`. `entryTriggerArmed` and `stopBehindOldLevel` pass on every trade by
  construction.

Every band's sample is small for a factor table (106 to 331 trades). Read anything
marked insufficient as a lead only.
