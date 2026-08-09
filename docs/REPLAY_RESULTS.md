# Replay harness results

**No live run has been recorded yet.** This file is the destination for one:

```
npm run backtest
```

That replays the shipped entry logic over the default universe and overwrites this file with
every cell filled in — total trades, win rate, expectancy and total R for each of Execute, Watch,
Reject and unscored, plus the factor table and the stop-width bands. It requires market-data
credentials (`ALPACA_API_KEY` / `ALPACA_API_SECRET`, see `.env.example`) and **refuses to write
anything from the synthetic generator**, which is a seeded random walk that would produce a
complete, confident, meaningless table.

## Why this file exists

`GSPS_Replay_Harness_Test_Results_29pct.pdf` reports a 29% win rate. Total trades, expectancy in
R, and the entire per-bucket breakdown are all `[Enter value]` — while the document's own text
says expectancy, not win rate, is the deciding metric.

The blank is not cosmetic, because the arithmetic turns on it. At a fixed target of `targetR`,
break-even is:

```
E = p × targetR − (1 − p) × 1 = 0   →   p = 1 / (1 + targetR)
```

| Target | Break-even win rate | Expectancy at p = 0.29 |
|---|---:|---:|
| 2R (the harness default, matching TP1) | 33.3% | −0.13R per trade |
| 3R (the master target) | 25.0% | +0.16R per trade |

So as documented, 29% is a **losing** system at 2R and a **winning** one at 3R, and which of
those the protocol actually is was left in the cell nobody filled. That is why the report now
carries `breakEvenWinRate` beside the win rate, and why every bucket row carries an explicit
above-break-even yes/no rather than leaving a reader to do this in their head.

## What a run states that the PDF did not

- **The window.** `window.from`/`window.to` are taken from the bars actually returned, not from
  the lookback that was requested — a symbol that only had six months of history did not cover a
  year, and the report says so.
- **The universe, after skips.** Symbols whose bars could not be fetched are listed with the
  reason and are not silently folded into the totals.
- **Provenance.** `source` and `live`. A synthetic run cannot be written at all.
- **Fill rate.** Setups armed versus triggered, which is the sanity check on whether the sample is
  the strategy or a handful of accidents.

## Before tuning anything

Run this first and commit the result. A change to the score cannot be evaluated against a
baseline that does not exist, and the ATR-relative proximity bands, the weight proposals and the
decision-lag hold are all changes whose effect is only visible as a before-and-after on these
numbers.

See `docs/BACKTESTING.md` for what the harness can and cannot see, and for why a strong factor
reading is a hypothesis rather than a result.
