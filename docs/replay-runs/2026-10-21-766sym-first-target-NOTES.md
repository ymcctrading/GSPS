# 2026-10-21 full large-cap universe run, score bands on the first-target build: notes

Read this before the JSON beside it (`2026-10-21-766sym-first-target.json`, with the summary
and all five reports). It repeats the 2026-10-20 score-band run on the build that changes the
time pillar and the first target.

## Provenance

| | |
|---|---|
| Workflow | "Universe backtest (manual)", run [39526268612](https://github.com/ymcctrading/GSPS/actions/runs/39526268612), job 118981520311 |
| Code | `main@3d492c4` (`3d492c4fbd4551a0c17b1a8435279d6c4d4a8113`, PR #364) |
| `strategyVersion` | `2026-10-21-gann-first-target`. Adds two changes to the 2026-10-20 build: P7 needs price and time squared AND the reaction inside its limit (no dated window), and TP1 is the first level that pays the risk |
| Universe | large-cap, 832 of 832 symbols, none skipped |
| Window | `2026-08-24T12:00:00Z` → `2026-10-20T20:45:00Z` · 15Min · `targetR` 2 · 33.8 minutes. Same window as 2026-10-20 |
| Cells | five, all live rules: `useProductionStop`, `usePlanLevels`, `entryRule: "confirmed"`, `exitRule: "gann-runner"`. They differ only in `attributeScoreRange`: [0,3], [4,5], [6,6], [7,7], [8,9] |

All five cells have the same trades, as intended. The "identical trades" warnings are generic
and expected. Each report confirms its range (`attributeWithin: "score 6–6"` and so on).
Armed 39,678, triggered 1,385, refused fills 7 (101 on 2026-10-20), retired plans 22,603.

## Live rules, against the 2026-10-20 run

| Bucket | 2026-10-20 (`gann-weekly-parity`) | This run |
|---|---|---|
| All | +0.020 (1,147) [−0.009, +0.048] | +0.025 (1,574) [−0.001, +0.049], win 18.7%, PF 1.14 |
| Execute | −0.040 (66) [−0.169, +0.090] | +0.005 (344) [−0.036, +0.047], win 19.2%, PF 1.03 |
| Watch | +0.030 (966) [+0.001, +0.060] | **+0.037 (998) [+0.005, +0.069]**, win 17.3%, PF 1.22 |
| Reject | −0.038 (115) | +0.001 (232), win 23.7% |

Halves. All: −0.000 (787), then +0.050 (787). Execute: +0.013 (172), then −0.004 (172).
Watch: +0.011 (499), then +0.063 (499).

The window is the same, but the population is not: 427 more trades (+37%). Refused fills fell
by 94 (101 to 7), which explains only part of it; triggered entries actually fell (1,475 to
1,385), so the rest comes from trades a triggered entry leads to (reversals and re-entries)
or from plans priced differently by the new TP1. Not traced in this pass. Execute grew
from 66 to 344 and is no longer negative, but it is still below Watch. Watch's interval is
again wholly above zero, just.

Reversion +0.070 (835), continuation −0.026 (739), the same split as before.

**The timeouts still carry the result.** 605 of 1,574 trades (38%) were still open at the
holding limit, marked at +0.345 on average (+208.5R). Without them, the other 969 trades
average about **−0.175R** (−0.157 on 2026-10-20). Initial stops (73) average −0.955, three
adverse closes (284) −0.230, prior-week stops (102) −0.367, break-even exits (159) +0.200.

## Score bands

Rebuilt from each band's factor table (passing plus failing on one row); the 0–3 band equals
the Reject bucket exactly. Intervals are approximate: mean ± 1.96 × 0.500 / √n, where 0.500R
is the standard deviation implied by the overall interval. The reports carry none. Halves are
from each report's `halves.early`/`halves.late` factor tables.

| Score | n | Expectancy R | ≈95% interval | Win rate | 1st half | 2nd half | 2026-10-20 |
|---|---|---|---|---|---|---|---|
| 0–3 | 232 | +0.0007 | [−0.064, +0.065] | 23.7% | −0.058 (116) | +0.059 (116) | −0.038 (115) |
| 4–5 | 615 | +0.0142 | [−0.025, +0.054] | 16.3% | −0.007 (307) | +0.035 (308) | +0.042 (331) |
| 6 | 436 | +0.0414 | [−0.006, +0.088] | 17.4% | +0.023 (218) | +0.060 (218) | +0.025 (328) |
| 7 | 225 | +0.0053 | [−0.060, +0.071] | 21.3% | −0.039 (112) | +0.049 (113) | −0.009 (267) |
| 8–9 | 66 | **+0.1636** | [+0.043, +0.284] | 22.7% | +0.139 (33) | +0.189 (33) | +0.068 (106) |
| 6+ pooled | 727 | +0.0413 | ±0.036 | | | | +0.019 (701) |
| 4+ pooled | 1,342 | +0.0289 | ±0.027 | | | | +0.026 (1,032) |

**Where expectancy turns positive.** Barely at all below 6: 0–3 is flat and 4–5 is +0.014.
6+ pooled (+0.041) beats 4–5 by +0.027 (approximate interval ±0.054) — the reverse of
2026-10-20, but inside noise. Score 7 is again below score 6. Score 8–9 is the only band whose
approximate interval clears zero and is positive in both halves, on 66 trades.

## The even-money hold no longer decides Execute

Execute is 344 of the 727 trades scoring 6 or more (66 of 701 before). Holds keep 383 at Watch;
the failing counts below add up to 383 exactly.

| Hold | Held at 6 / 7 / 8–9 | Held total | Held expectancy |
|---|---|---|---|
| `breakaway` | 162 / 75 / 24 | **261** | +0.086 |
| `queerActing` | 34 / 15 / 0 | 49 | +0.015 |
| `weakStock` | 16 / 10 / 4 | 30 | +0.012 |
| `figureCrossing` | 14 / 6 / 0 | 20 | −0.146 |
| `monthlyBreak` | 7 / 9 / 3 | 19 | +0.406 |
| **`tradePlanPriced` (M-K5)** | 3 / 1 / 0 | **4** | −0.009 |

`tradePlanPriced` held 526 on 2026-10-20 and holds 4 now. The first-target change removed it as
the lever. `timeWindowTurn` reports passes only (111), so it held nothing at 6+.

The 383 held trades average about +0.074R; the 344 that reach Execute average +0.005. As on
2026-10-20, the holds take out trades that do better than the ones they let through, and the
hold doing it is now `breakaway` (261 trades at +0.086).

## Cutoffs (6 / 3.5)

- **Watch at 3.5: still unconfirmed, hold.** The 0–3 band is no longer negative (+0.001), and
  4+ beats it by only +0.028 (approximate interval ±0.073).
- **Execute at 6: still unconfirmed, hold.** For the first time 6+ beats 4–5, but by less than
  the noise, and score 7 sits below 6, so the score is not monotone above 6. The 8–9 band is
  the one clear lead; it is too small (66) and too new to move the cutoff to 8. The Execute
  bucket's weakness against Watch comes from the holds (mostly `breakaway`), not from the score.
- **Next:** measure score 6+ with `breakaway` switched off (the switch the 2026-10-20 notes
  proposed for `tradePlanPriced`), and the timeout question, which outweighs any cutoff.

## Pillars within the 6+ bands

Pools bands 6, 7 and 8–9 (727 trades). A delta is the passing trades' expectancy minus the
failing trades'.

| Pillar | Pass | Δ R pooled | Δ at 6 / 7 / 8–9 | Reading |
|---|---|---|---|---|
| marketCycle | 665/727 (91.5%) | −0.009 | −0.034 / +0.096 (96.4%) / +0.160 (1 fail) | mixed |
| trendAllTimeframes | 688/727 (94.6%) | −0.023 | +0.017 / −0.511 (98.7%, 3 fail) / constant 100% | no longer inverts at 6; near saturation at 7+ |
| relativeStrength | 495/727 (68.1%) | **+0.071** | +0.049 / +0.098 / +0.121 | positive in every band |
| activity | 327/727 (45.0%) | −0.027 | −0.022 / −0.057 / −0.541 (5 fail) | slightly inverted |
| priceLevels | 651/727 (89.5%) | +0.059 | +0.127 / −0.318 (8 fail) / −0.343 (2 fail) | positive where it has failures |
| geometricAngles | 175/727 (24.1%) | +0.002 | −0.048 / +0.024 / +0.009 | no signal |
| timeFactors (P7) | **341/727 (46.9%)** | −0.002 | −0.021 / −0.016 / +0.058 | **no longer saturated**; no signal |
| volumeAccumulation | 660/727 (90.8%) | +0.001 | −0.050 / +0.128 / constant 100% | mixed |
| definiteIndication | **722/727 (99.3%)** | −0.286 | −0.287 (5 fail) / constant / constant | **saturated**; inversion now rests on 5 trades |

- **timeFactors (P7, "squared AND inLimit").** Passes 46.9% at 6+ (97.7% before) and 27.9% over
  all 1,574 trades (8/232, 90/615, 154/436, 132/225, 55/66 by band). The saturation is cured.
  It carries no signal at 6+ (Δ −0.002), slightly negative at 4–5 (−0.064), and +0.175 at 0–3
  on only 8 passes. Its pass rate climbs with the score, so it now separates the bands.
- **definiteIndication** passes on all but 5 trades at 6+ and every trade at 7+. The
  greatest-reaction part is the only thing that can fail it. Read the −0.29 as a lead only.
- **trendAllTimeframes** stopped inverting at score 6 (+0.017) and its check `swingChartTrend`
  softened (−0.057 / −0.084 / +0.387 on 5 fails). At 4–5 both still invert (−0.128, −0.103).
- **relativeStrength** is now the best pillar at 6+, positive in each band.
- Checks: `ruleOfThree` (+0.066 pooled) and `historicalSR` (+0.029) positive; `timePriceSquare`
  +0.018; `gannRetracementConfluence` +0.108 at 6 but −0.133 at 7. `entryTriggerArmed` and
  `stopBehindOldLevel` pass on every trade by construction.

Every band is small for a factor table (66 to 615 trades). Read rows marked insufficient as
leads only.
