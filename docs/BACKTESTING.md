# Backtesting the protocol

`lib/backtest/replay.ts` is the source of truth for win rate and expectancy. It
replays the shipped entry logic bar by bar — the same `detectPatterns`, the same
gap rule, the same risk floor — so a number quoted from it describes the system
that runs, not a re-implementation of it.

Run it from **Backtest** in the app nav (`/learning`), or hit
`GET /api/backtest?symbols=SPY,AAPL&targetR=2&within=Execute` directly.

## Read this before tuning `config.py`

**`lib/confluence-scanner/config.py` does not feed the replay, and tuning it
cannot change a single number the replay reports.** They are two separate
scoring systems that were built in parallel and never joined:

| | `lib/scoring/score.ts` | `lib/confluence-scanner/config.py` |
|---|---|---|
| Language | TypeScript | Python |
| Scale | 9 criteria, one point each | ~120 weighted points across gates + factors |
| Verdict | `Execute` ≥7 · `Watch` ≥4 · `Reject` | gate pass/fail, then a score |
| Read by | the live scan, `/api/batch-scan`, **the replay** | `scanner.py`, `gates.py`, `scoring.py` |
| Read by the replay | **yes** | **no** |

Nothing imports `config.py` outside the Python package. The Tier 1 and Tier 2
entries in its changelog — the sliding-scale risk-reward, the volatility-adjusted
stop bands, the widened ADX gate, the early-stage momentum factor — are real
changes to the Python scanner and have no effect on the app, the live scan, or
any replay result.

The two have also drifted in a way that hides this. The scanner's README reports
that "setups now score 8–9/9", but `/9` is `score.ts`'s scale; `config.py` has no
9-point scale to score on. Reading that line as a Tier 1 result is the specific
mistake this section exists to prevent.

Its `backtest.py` is a different instrument again: it reads `scan_log.jsonl`,
a file a human fills in outcomes for by hand, and needs 30+ labelled trades
before it will report. That log is gitignored and does not exist in the repo.

### So what does move the numbers

Everything the replay scores flows through these, and a change to any of them
shows up in the next run:

- **`lib/scoring/score.ts`** — the nine criteria, their thresholds (fan ≤1.5%,
  harmonic ≤1.0%, TP1 ≥2R), the 7/4 bucket cutoffs, and the bare-2-2 downgrade.
- **`lib/strat/patterns.ts`** — which setups arm at all, plus `gapRuleViolated`
  and `riskFloorViolated`.
- **`lib/strat/levels.ts`** — the trade plan, and `MAX_STOP_ATR_MULTIPLE`.
- **`targetR`** on the replay itself.

Tuning `config.py` against replay output is not a slower path to an answer; it
is a path to no answer. Either port the Tier 1/Tier 2 ideas into `score.ts`
where the replay can see them, or measure them with the Python scanner's own
`backtest.py` and a real `scan_log.jsonl`. Both are defensible. Doing neither
and reading replay numbers as feedback on `config.py` is not.

## Three criteria carry no information inside `Execute`

The factor table reports a criterion as **never varied** when every trade in the
bucket landed on the same side of it. Two of the nine are constant inside
`Execute` *by construction*, not because of the sample:

- **Reversal pattern armed.** The replay only evaluates setups where a pattern
  was detected, and takes the trade direction from the pattern itself. This
  criterion is therefore true on every replayed trade, in every bucket.
- **Clean risk-reward (TP1 ≥ 2R).** `computeTradeLevels` sets TP1 to
  `max(2R, structural extreme)`, so `rewardToRiskTp1 >= 2` always holds.

Both contribute a guaranteed +2 to every replayed score. The practical
consequence: the `Execute` cutoff of ≥7/9 is really **≥5 of the 7 criteria that
can vary**, and neither of those two can be tuned to improve anything, because
neither ever discriminates between a winner and a loser.

This also means replay scores sit systematically higher than live-scan scores,
where a symbol can be scanned with nothing armed and no plan priced. Do not
compare a replay score distribution against a live one.

## What the numbers are worth

The harness is deliberately pessimistic — a setup may only trigger on the very
next bar, a bar covering both stop and target counts as a loss, and round-trip
friction is charged against every trade. It still cannot see the intra-bar path,
the real bid/ask at the fill, or gaps outside the supplied session data. **Treat
any result as an upper bound on a strategy's quality.**

Two more limits worth holding onto:

- **Attribution is marginal, not causal.** A criterion can rank high because it
  travels with one that works. `attributeFactors` reports the correlation
  between a criterion passing and the trade's realised R — one criterion at a
  time, with nothing partialled out. Treat a strong reading as a hypothesis to
  re-run on a different universe, not a result.
- **Provenance is enforced, not assumed.** With no vendor credentials
  configured, `getMarketDataProvider()` falls back to a seeded random walk that
  will happily produce a full factor ranking describing nothing. Every report
  carries `live` and `source`, and the dashboard puts a **Simulated data**
  banner above a non-live run. Check it before quoting anything.

## Sample-size floor

`attributeFactors` withholds a recommendation when either arm of a split has
fewer than `MIN_SAMPLES_PER_ARM` (10) trades, and reports the factor as **too
few** instead. This mirrors the floor in the Python `backtest.py` so both tools
refuse at the same place. A 3-trade arm will show a correlation of 1.0 given the
chance.
