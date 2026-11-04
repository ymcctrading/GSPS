# EXP-001: the long-only core on untouched history (pre-registered)

Internal. Frozen 2026-11-04, before any bar from the holdout window was read
by this program. Edits after the holdout run are not allowed; a revised
hypothesis is EXP-002 on new data.

## Hypothesis

The bare core strategy, long side only (`lib/backtest/replayCore.ts`,
cell `{"profile":"core","coreShorts":false}`), has positive net expectancy
that is not explained by the market's drift, on history it was never
developed on.

Rationale: on 2020-12 to 2026-10 (development data, looked at many times) it
measured +0.125R a campaign over 6,660 campaigns on the 716-symbol
point-in-time list (`/mnt/project-files/rule-ladder/2026-10-30-long-only-716/`),
the only positive cell among the configurations in `registry.json`.

## Data

- **Holdout window:** campaigns opened 2016-01-01 to 2020-10-31. No run of
  any GSPS replay on this window was found (searched `docs/replay-runs/`,
  `core-rebuild/`, `rule-ladder/`, `replay-diagnosis/` on 2026-11-04).
  Warm-up history before 2016 is read only to form the monthly and weekly
  charts the first sessions need.
- **Universe:** the point-in-time list (`--universe point-in-time --since
  2016-01-01`), each year's own members above the $10B floor, departed
  companies included.
- **Bars:** Alpaca daily, split-adjusted, frozen with `--barCache`; the
  manifest hash is recorded with the result. If Alpaca's free feed holds
  daily bars for fewer than 80% of the window's members, the test is
  BLOCKED (not run on partial data); a second source is a new decision.
- **Command:**
  `node scripts/backtest-universe.mjs --universe point-in-time --timeframe 1Day --since 2016-01-01 --historyFrom 2015-01-01 --historyTo 2020-10-31 --barCache <dir> --symbolsPerMinute 18 --out <dir> --cells '[{"label":"core-long","options":{"profile":"core","coreShorts":false}}]'`
  then `node scripts/quant-validation.mjs --trials 105 --barCache <dir> --controlDraws 200 --riskFraction 0.0025 --maxOpenRiskFraction 0.25 --maxConcurrent 100 --maxPositionFraction 0.1 --from 2016-01-01 --to 2020-10-31 --ledger core-long=<dir>/core-long.trades.json --out <dir>/qv`.
  The command's `--historyFrom` reaches back one year for warm-up; only
  campaigns opened in the window are scored.

## Rules under test (unchanged from the code at the frozen commit)

Entries, stop, trailing exit, pyramid and costs are exactly
`replayCore.ts` as merged; nothing is tuned for this test. Costs $0.02 a
share round trip. Fills: decisions on completed sessions, market orders at
the next open, resting orders at the better of open and price on a touch,
stops at the open on a gap. Known optimism, disclosed: a touch counts as a
fill, and the flat cost ignores spread by price and liquidity.

## Primary metric and thresholds (set before the run)

Trials counted as tried before this test: 105 (registry 80, rule-ladder
rungs 20, ladder references 3, and the two portfolio-cap settings read on
development data on 2026-11-04).

The verdict is **PASS** only if all of these hold:

1. Mean R a campaign > 0, with the 95% time-ordered block-bootstrap lower
   bound > 0.
2. Against the matched random-entry control (200 seeded draws, same symbol,
   side, holding time and stop distance, within ±21 sessions): at most 5% of
   draws at or above the strategy's mean R.
3. Portfolio daily Sharpe (0.25% risk a campaign, 25% open-risk cap, 100
   open, 10% notional, marked to market) above buy-and-hold of the
   equal-weight benchmark over the same window.
4. Deflated Sharpe ≥ 0.95 with 105 trials.

**FAIL** if 1 or 2 fails. **INCONCLUSIVE** if 1 and 2 hold but 3 or 4 does
not, or if fewer than 1,000 campaigns open in the window.

Reported but not gating: mean R without the top 1% of campaigns, cost
stress at +$0.02 and +$0.05 a share, results by year, maximum drawdown and
its length (no drawdown limit has been approved by the owner yet).

## Stopping rule

One run. No parameter, universe or window change after the result is seen.
After a FAIL, the next idea needs data this program has not read: forward
paper trading from 2026-11-05, or another market by a separate decision.

## Development-data reading (2020-12 to 2026-10, not evidence)

Read on 2026-11-04 from the Oct 30 ledgers with `scripts/quant-validation.mjs`,
without mark-to-market (equity moves on exit days only, so drawdowns are
understated):

| Ledger | Mean R | Block 95% CI | Without top 1% | Portfolio (0.5% risk, 6% cap) CAGR / Sharpe / max DD | Portfolio (0.25%, 25% cap, 100 open) CAGR / Sharpe / max DD |
|---|---:|---|---:|---|---|
| long-only core, 716 point-in-time | +0.125 | [+0.037, +0.216] | −0.051 | 1.1% / 0.15 / 21.9% | 11.8% / 0.63 / 58.4% |
| core with shorts, survivor list | +0.013 | [−0.034, +0.064] | −0.144 | −4.5% / −0.40 / 36.0% | not run |

For scale only: the Dow Jones Industrial Average's price index (no
dividends) over 2020-12-01 to 2026-10-28 returned 10.0% a year, Sharpe 0.74,
max drawdown 21.9% (owner-private MeasuringWorth file, computed 2026-11-04).
On development data the long-only core did not beat holding the index on a
risk-adjusted basis.
