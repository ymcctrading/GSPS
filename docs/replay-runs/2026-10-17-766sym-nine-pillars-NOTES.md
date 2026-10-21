# 2026-10-17 full large-cap universe run on the nine pillars: notes

Read this before the JSON beside it (`2026-10-17-766sym-nine-pillars.json`, both
cells' full reports). This is the first run on the nine-pillar score.

## Provenance

| | |
|---|---|
| Workflow | "Universe backtest (manual)", run [38991819090](https://github.com/ymcctrading/GSPS/actions/runs/38991819090), artifact `backtest-universe-38991819090` |
| Code | `main@889120a` (#356, "Score out of nine pillars ... the stop is required") |
| `strategyVersion` in the reports | `2026-10-17-gann-nine-pillars` |
| Universe | 824 symbols listed, 8 skipped for Alpaca rate-limiting (BSX, HON, AON, URI, SUNB, OKE, NOK, CRH) |
| Window | `2026-08-18T12:00:00Z` → `2026-10-16T20:45:00Z` · 15Min · `targetR` 2 · run took 28.5 minutes |
| Attribution scope | `attributeWithin: "Execute"` (the factor tables cover Execute trades only) |

The job log as retrieved starts partway through `summary.json`, so its header is
missing. Both per-cell reports are complete. The listed universe has 824 symbols,
not the 766 earlier runs used. The window is also later than the 2026-09-27/28 runs
(2026-07-30 → 2026-09-25), so these numbers are not directly comparable with them.

The score is now 0 to 9: one point per pillar (`marketCycle`, `trendAllTimeframes`,
`relativeStrength`, `activity`, `priceLevels`, `geometricAngles`, `timeFactors`,
`volumeAccumulation`, `definiteIndication`). The nine former criteria are checks
inside those pillars and are still measured. Cutoffs are unchanged at 6 / 3.5.

## Cells

| Cell | Options |
|---|---|
| `live-rules` | `useProductionStop`, `usePlanLevels`, `entryRule: "confirmed"`, `exitRule: "gann-runner"` (the live exit rule) |
| `stop-bracket` | `useProductionStop`, `usePlanLevels`; the report resolves to `entryRule: "reaction"` (the default since 2026-10-15) and `exitRule: "bracket"` |

## Headline numbers (expectancy in R after costs, 95% interval from `summary.json`)

| Cell | All trades | Execute | Watch | Reject |
|---|---|---|---|---|
| `live-rules` | +0.002 (n 1,169) [−0.025, +0.030] | **−0.085** (73) [−0.200, +0.038] | +0.009 (979) [−0.020, +0.037] | −0.005 (117) |
| `stop-bracket` | −0.049 (3,074) [−0.075, −0.022] | **−0.138** (164) [−0.282, +0.010] | −0.072 (2,192) [−0.102, −0.042] | **+0.040** (718) |

Win rate and profit factor (summary PF counts every trade; the report's own
`required.profitFactor` leaves out timeouts and break-evens and is lower):

| Cell / bucket | Win rate | PF (summary) | PF (report) |
|---|---|---|---|
| `live-rules` all | 23.6% | 1.010 | 0.327 |
| `live-rules` Execute | 9.6% | 0.668 | 0.115 |
| `live-rules` Watch | 25.0% | 1.058 | 0.364 |
| `stop-bracket` all | 36.0% | 0.858 | 0.975 |
| `stop-bracket` Execute | 25.6% | 0.724 | 0.700 |
| `stop-bracket` Watch | 35.7% | 0.798 | 0.925 |
| `stop-bracket` Reject | 39.3% | n/a | 1.292 |

Chronological halves:

| Cell / bucket | First half | Second half |
|---|---|---|
| `live-rules` all | −0.034 (584) | +0.037 (585) |
| `live-rules` Execute | −0.201 (36) | +0.029 (37) |
| `stop-bracket` all | −0.028 (1,537) | −0.070 (1,537) |
| `stop-bracket` Execute | −0.170 (82) | −0.106 (82) |

`stop-bracket` minus `live-rules`: Execute −0.054 [−0.240, +0.133], Watch −0.081
[−0.123, −0.039], all −0.051 [−0.088, −0.012].

## What the run says

1. **Execute is the worst bucket in both cells.** It is below Watch in both, and below
   Reject in both. On the bracket cell, Reject (score under 3.5) is the only
   profitable bucket, at +0.040 over 718 trades. Both Execute intervals still
   include zero, so Execute is not shown to lose money. But the ranking runs the
   wrong way. On the 2026-09-27 runs, Execute beat Watch in every bracket cell.
2. **The live-rules cell's break-even result comes from timeouts.** 390 of 1,169
   trades were still open at the holding limit. They are marked to market at +0.317
   on average (+123.5R in total). Without them, the other 779 trades average about
   −0.156R. The rest of the exit mix: initial stop −0.849 (71), three adverse
   closes −0.227 (199), prior week −0.213 (86), final stage −0.091 (150),
   break-even +0.129 (153). The run-13 caveat still holds: Gann-exit cells are not
   yet a like-for-like result.
3. **Continuation setups lose and reversion setups don't.** `live-rules`: reversion
   +0.045 (632), continuation −0.050 (537). `stop-bracket`: reversion +0.005
   (1,875), continuation −0.134 (1,199).
4. **Entry kind (`stop-bracket`).** Crossing −0.067 (1,102), old level −0.033 (676),
   hold −0.043 (1,296). Among hold entries, the days basis is the worst, at −0.250
   (115).
5. **Plans retired.** `live-rules` armed 40,721, triggered 1,504, refused 104,
   retired 23,203. `stop-bracket` armed 51,917, triggered 3,082, refused 8,
   retired 12,780.

## Pillar factor table (inside Execute)

Delta is the passing trades' expectancy minus the failing trades'. A pass rate above
95% or below 5% is saturated. "Inv" marks a pillar whose delta is negative.

| Pillar | live-rules pass | Δ R | verdict | stop-bracket pass | Δ R | verdict |
|---|---|---|---|---|---|---|
| marketCycle | 69/73 (94.5%) | +0.213 | insufficient | 154/164 (93.9%) | +0.094 | informative |
| trendAllTimeframes | 69/73 (94.5%) | −0.828 Inv | insufficient | 147/164 (89.6%) | −0.077 Inv | informative |
| relativeStrength | 48/73 (65.8%) | −0.141 Inv | informative | 106/164 (64.6%) | −0.252 Inv | informative |
| activity | 45/73 (61.6%) | −0.162 Inv | informative | 79/164 (48.2%) | −0.011 (≈0) | informative |
| priceLevels | 59/73 (80.8%) | +0.154 | informative | 146/164 (89.0%) | +0.418 | informative |
| geometricAngles | 33/73 (45.2%) | −0.098 Inv | informative | 27/164 (16.5%) | +0.418 | informative |
| timeFactors | **73/73 (100%) saturated** | — | constant | **161/164 (98.2%) saturated** | +0.219 | insufficient |
| volumeAccumulation | 64/73 (87.7%) | +0.063 | insufficient | 143/164 (87.2%) | +0.485 | informative |
| definiteIndication | 68/73 (93.2%) | −0.671 Inv | insufficient | 147/164 (89.6%) | −0.550 Inv | informative |

The component checks, for continuity with the nine former criteria:

| Check | live-rules pass | Δ R | stop-bracket pass | Δ R |
|---|---|---|---|---|
| swingChartTrend | 68/73 | −0.775 | 146/164 | −0.023 |
| gannAngleSlope | 66/73 | −0.117 | 82/164 | +0.233 |
| volumeClimax | 56/73 | +0.082 | 137/164 | +0.237 |
| historicalSR | 37/73 | +0.145 | 79/164 | +0.016 |
| entryTriggerArmed | 73/73 constant | — | 164/164 constant | — |
| stopBehindOldLevel | 73/73 constant | — | 164/164 constant | — |
| timePriceSquare | 30/73 | +0.168 | 47/164 | −0.142 |
| gannRetracementConfluence | 45/73 | +0.065 | 126/164 | +0.262 |
| ruleOfThree | 56/73 | +0.002 | 45/164 | +0.075 |

Readings, with the porting-defect presumption ("Gann-derived AND measured") in mind:

- **`timeFactors` is saturated.** Inside Execute it carries no information: it passes on
  every trade in `live-rules` and on 98% in `stop-bracket`. Check how often it passes
  across the whole population. A pillar that nearly always passes is a free point
  towards Execute.
- **`definiteIndication` inverts in both cells** (−0.671 and −0.550). It has two parts.
  The trigger and the stop behind an old level pass on every Execute trade, so the
  failures come from its third part, the greatest-reaction rule. The few Execute
  trades that fail that rule do well: +0.541 (5 trades) and +0.355 (17 trades).
  Look at that rule's translation first.
- **`relativeStrength` inverts in both cells** (−0.141 and −0.252). In the bracket
  cell's halves its sign is not stable (−0.642 then +0.100).
- **`trendAllTimeframes` and `swingChartTrend` invert in both cells**, strongly on
  the confirmed entry (−0.828 and −0.775). That is the same pattern run 12 found with
  `swingChartTrend` under confirmation.
- **Positive in both cells:** `priceLevels`, `volumeAccumulation`, `marketCycle`, and
  the checks `volumeClimax` and `gannRetracementConfluence`. `geometricAngles` and
  `timePriceSquare` change sign between the cells.
- The context table holds 177 rows per cell (67 and 110 informative), measured on
  73 and 164 trades with no correction for multiple comparisons. Read those rows as
  leads only.

## Cutoffs (6 / 3.5)

**The report has no per-score-band split.** Its buckets are verdicts after the holds
(breakaway, stop breach, weak stock and others), not score bands, so where expectancy
turns positive by score can't be read from this run. What the buckets do show:

- On `live-rules`, Reject −0.005, Watch +0.009, Execute −0.085.
- On `stop-bracket`, Reject +0.040, Watch −0.072, Execute −0.138.

On neither cell does expectancy rise with the verdict. A higher cutoff would not help
on this evidence, because Execute, the top of the ranking, is already the worst
bucket. The trouble is what the score counts: several pillars invert inside Execute
and one is saturated. Where the cutoff sits is not the issue.

**Recommendation.** Hold 6 / 3.5 for now, and say plainly that this run does not
confirm them either. They are not re-derived on `2026-10-17-gann-nine-pillars`. The
next step is per-band captures of both cells on this version (`?scoreRange=0-3`,
`4-5`, `6-6`, `7-7`, `8-9`, or a report change that writes `byScoreRange` for each
integer score). Before trusting any cutoff, also check the pillar translation faults
above: `definiteIndication`'s greatest-reaction part, `timeFactors` saturation, and
`relativeStrength`.
