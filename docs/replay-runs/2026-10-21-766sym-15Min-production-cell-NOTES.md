# 2026-10-21 full large-cap universe run, 15-minute, production cell: notes

The file name says 766 symbols, the list's size when the naming began; this run covered 832.

Read this before the JSON beside it (`2026-10-21-766sym-15Min-production-cell.json`: summary
and both reports). It is the first valid run on the production-faithful cell
(`entryRule: "reaction"`, `exitRule: "gann"`), with the intraday profile's 15-minute
replication run in the same job on the same bars.

## Provenance

| | |
|---|---|
| Workflow | "Universe backtest (manual)", run [39619745098](https://github.com/ymcctrading/GSPS/actions/runs/39619745098), job 119289716678 |
| Code | `main@9e9a290` (`9e9a2902c5faf8d665975ddb96e5b9e61f6d59ae`) |
| `strategyVersion` | `2026-10-21-gann-decade-month-et` |
| Universe | large-cap, 832 of 832 symbols, none skipped |
| Window | `2026-08-24T12:00:00Z` → `2026-10-21T15:00:00Z` · 15Min · `targetR` 2 · 28.7 minutes |
| Cells | `prod`: `{"usePlanLevels":true,"entryRule":"reaction","exitRule":"gann"}`; `intraday-15m`: `{"profile":"intraday"}` |

`prod`: armed 50,852, triggered 2,720, refused fills 6, dropped plans 0, retired plans 12,650.

## Production cell

| Bucket | Trades | Expectancy R [95% CI] | Halves |
|---|---|---|---|
| All | 3,482 | +0.048 [+0.018, +0.078] | +0.050, then +0.046 |
| Execute | 271 | −0.037 [−0.146, +0.086] | +0.009, then −0.083 |
| Watch | 1,223 | +0.005 [−0.039, +0.051] | +0.001, then +0.008 |
| Reject | 1,220 | +0.092 | |
| Derived (reversals, re-buys) | 768 | +0.076 [+0.019, +0.135] | |

Execute does not beat Watch, and Reject is the best scored bucket. The population figure rests on trades still open at the
10-session limit or the end of data: `timeout` 1,110 trades at +0.648R; every closed exit reason is at or below
zero except `final_stage` (+0.059, 261). Initial stop 389 at −0.867.

Score bands (whole score, n, R): 1 40 +0.37 · 2 505 +0.12 · 3 675 +0.05 · 4 614 −0.01 ·
5 473 +0.02 · 6 270 −0.07 · 7 110 −0.03 · 8 25 +0.66 · 9 2 −0.06. The bands broadly decline from 2
through 7; only score 8 is positive, on 25 trades. The 6/3.5 cutoffs were held (they are 7/4 since `2026-10-21-cutoffs-seven-four-one-entry`): two months
of one phase is not enough to move them, and the six-year daily rerun is the run that
re-derives them.

Entry kinds: crossing 1,189 (+0.020), old level 850 (+0.070), hold 1,443 (+0.057).
Setup kinds: reversion 2,088 (+0.089), continuation 1,394 (−0.014).

## Intraday profile, 15-minute replication

3,033 trades, +0.036R [+0.005, +0.066], win 45.5%, halves +0.014 then +0.058. Read by the
intraday thread against its pre-registered rule
(`docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md` Part 5): the gain comes from 181 trades still
open when the data ended; the other 2,852 are −0.012R. The six-year 1-hour run is the
primary test.
