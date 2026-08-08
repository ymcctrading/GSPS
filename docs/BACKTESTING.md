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

## Criteria that carry no information inside `Execute`

The factor table reports a criterion as **never varied** when every trade in the
bucket landed on the same side of it. Such a criterion cannot be tuned to
improve anything: it never separates a winner from a loser, it only shifts every
score by a constant.

**Reversal pattern armed** is constant *by construction* and always will be. The
replay only evaluates setups where a pattern was detected, and takes the trade
direction from the pattern itself, so the criterion is true on every replayed
trade in every bucket. It contributes a guaranteed +1, which means the `Execute`
cutoff of ≥7/9 is really ≥6 of the 8 criteria that can vary. It also means replay
scores sit systematically higher than live-scan scores, where a symbol can be
scanned with nothing armed and no plan priced — **do not compare a replay score
distribution against a live one.**

### The ninth criterion, and two ways to get it wrong

This slot was a free point for a long time, and fixing it took two attempts
worth recording, because both failure modes look like working code.

**It began as "Clean risk-reward (TP1 ≥ 2R)", which could never fail.**
`computeTradeLevels` sets TP1 to `max(2R, structural extreme)`, so
`rewardToRiskTp1 >= 2` holds on every well-formed pattern. Every score was
inflated by one and the criterion discriminated nothing.

**Scoring TP1's structural branch instead was no better — it essentially never
passed.** Every pattern sets its trigger a penny beyond the signal candle's
extreme and its stop a penny beyond the other side, so `risk` is close to that
candle's range. For the structural branch to win, the **previous** candle's
extreme would have to sit more than two of those ranges beyond it. Measured
against the flat 2R floor over 6,362 armed setups it fired **zero** times. That
change turned a point nobody could lose into one nobody could win — the same
defect mirrored, and it cut `Execute` by 76%.

That measurement is now historical: TP1 moved to asset-class multiples (1.5R for
equities and crypto), which lowers the bar the structural extreme has to clear
and makes the branch reachable. **Nobody has re-measured how often it fires**, so
do not resurrect it as a criterion on the assumption that it now varies — check
first, with the tool below.

**What works is the master target.** It snaps to a support or harmonic level when
one sits in range and falls back to a plain 3R projection when none does — about
a 29/71 split across armed setups, and 90 of 161 inside `Execute` on the
reference run. Both arms carry enough trades to read, so the criterion finally
does the job the slot was there for.

The lesson generalises: before scoring a condition, check that **both** of its
arms occur. `attributeFactors` reports `constant` precisely so this cannot hide.

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
