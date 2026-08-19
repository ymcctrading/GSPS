# Backtesting the protocol

`lib/backtest/replay.ts` is the source of truth for win rate and expectancy. It
replays the shipped entry logic bar by bar — the same `detectPatterns`, the same
gap rule, the same risk floor — so a number quoted from it describes the system
that runs, not a re-implementation of it.

Run it from **Backtest** in the app nav (`/learning`), hit
`GET /api/backtest?symbols=SPY,AAPL&targetR=2&within=Execute` directly, or from the command line:

```
npm run backtest                                    # writes docs/REPLAY_RESULTS.md
npm run backtest -- --symbols SPY,AAPL --targetR 3  # a different universe and target
npm run backtest -- --stdout                        # print instead of writing
```

The CLI is the one that produces a committable record, and it refuses to write a report from
synthetic bars or from a run with no trades. See `docs/REPLAY_RESULTS.md`.

### Where the Alpaca keys live

Real Alpaca credentials are configured on Vercel (`gann-protocol/gsps` → Settings → Environment
Variables), scoped to **Production and Preview**, not in any local checkout. As of 2026-08-14 the
project stores them under the names `ALPACAP_API` (key ID) and `ALPACA_API_SECRET_KEY` (secret) —
`lib/data/alpaca.ts`'s `alpacaKeyId()`/`alpacaSecret()` already accept those exact spellings as
fallbacks alongside `ALPACA_API_KEY`/`ALPACA_API_SECRET`, so no rename is needed.

This repo does not store the key values anywhere, including here — only that they exist and where.
Because the keys live on the deployment and not on a local machine, the way to produce a
credentialed run is the `--from` flow: hit `GET /api/backtest` while signed in on that deployment,
save the returned JSON under `docs/replay-runs/`, then run
`npm run backtest -- --from docs/replay-runs/<file>.json` locally to render and commit
`docs/REPLAY_RESULTS.md`. `/api/backtest` requires a signed-in session (`verifyAuth()`), so it
can't be curled anonymously.

## Win rate decides nothing on its own

A run reports `breakEvenWinRate` — `1 / (1 + targetR)` — beside the win rate, and every bucket
row carries an explicit above-break-even flag. This is not decoration. At the 2R default,
break-even is a 33.3% win rate; at 3R it is 25%. A 29% win rate is therefore a losing system at
one target and a winning one at the other, and quoting it without the target beside it says
nothing at all. Expectancy is the deciding metric; the win rate is context for it.

A run also states the **window** it covered, taken from the bars actually returned rather than
the lookback requested, so a result over three weeks can never be read as one over three years.

## The verdict ladder has not held up out of sample

Four runs over the same six symbols, all committed under `docs/replay-runs/`:

| Run | Window | Trades | Execute | Watch | Reject | All |
|---|---|---:|---:|---:|---:|---:|
| 15Min, 2R | 2 months | 1,033 | **+0.013R** | −0.072R | −0.081R | −0.062R |
| 15Min, 3R | 2 months | 1,033 | **+0.132R** | −0.126R | — | −0.084R |
| 1Hour, 2R | 2 years | 3,631 | **−0.230R** | +0.038R | +0.086R | +0.026R |
| 1Hour, 3R | 2 years | 3,631 | **−0.289R** | +0.057R | +0.061R | +0.030R |

On the two-month 15Min sample the ladder ordered the way the product assumes: Execute best,
Reject worst. On the two-year 1Hour sample it is **inverted at both targets** — Execute is the
worst bucket by a wide margin and Reject is among the best, on a sample twelve times larger.

This is the single most important thing the harness has said so far, and what it says is that
**the score has not been shown to select for anything.** The 15Min result was the more
comfortable one and it is also the smaller, shorter and more recent one. Read in the other
direction — a two-year sample says the setups the product tells users to trade are the ones that
lost money — it is a reason to treat every Execute verdict as unvalidated rather than as
endorsed.

### What would settle it

Two things changed between those runs, not one: the execution timeframe **and** the period, because
each timeframe carries its own lookback (`TF_LOOKBACK_DAYS` — 60 days for 15Min, 730 for 1Hour).
An inversion caused by the timeframe and an inversion caused by the regime are different problems
with different fixes, and these four runs cannot tell them apart.

`--since` exists for exactly this. It trims the execution bars to a fixed start while leaving the
daily bars that feed the score untouched, so the period can be held still while the timeframe
moves:

```
npm run backtest -- --timeframe 1Hour --since 2026-06-15 --out docs/replay-runs/1H-recent.md
```

If 1Hour over the recent two months also shows Execute on top, the inversion is a regime effect
and the 15Min baseline describes one favourable quarter. If it stays inverted, the effect belongs
to the timeframe, and a score built on daily structure is being asked to rank intraday triggers it
was never fitted to.

**Until one of those runs exists, do not re-weight anything and do not move the recommended exit.**
A weight fitted to whichever sample is in front of you is fitted to a coin whose bias has not been
established.

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

- **`lib/scoring/score.ts`** — the nine criteria, the 7/4 bucket cutoffs, the
  bare-2-2 downgrade, and the decision-lag hold.
- **`lib/scoring/proximity.ts`** — how close "near a level" is. These were fixed
  percentages of price (fan ≤1.5%, harmonic ≤1.0%, S/R ≤1.5%) and are now
  multiples of the instrument's own daily ATR, so a 7/9 means the same thing on
  a utility and on a high-beta name. See below.
- **`lib/scoring/weights.ts`** — what each criterion is worth. One point each by
  default; a weight set adopted from a proposal redistributes the same nine.
- **`lib/strat/patterns.ts`** — which setups arm at all, plus `gapRuleViolated`
  and `riskFloorViolated`.
- **`lib/strat/levels.ts`** — the trade plan, and `MAX_STOP_ATR_MULTIPLE`. As of
  2026-08-19, large-cap stocks (`lib/strat/large-cap.ts`) get a wider leeway
  and ceiling (`LARGE_CAP_LEEWAY_ATR`, `LARGE_CAP_MAX_STOP_ATR_MULTIPLE`) —
  unmeasured against replay at the time it shipped. **Re-run attribution**,
  split by large-cap vs. not, before treating it as validated rather than a
  hypothesis.
- **`targetR`** on the replay itself.

## Proximity is measured in ATR, not percent

Three criteria ask whether price is sitting on a structural level. They used to answer with a
fixed percentage of price, which does not mean the same thing twice across a mixed universe: on a
5%-ATR name, 1.5% is a third of a day's range and the point is nearly free; on a 1%-ATR name it
is more than a full day's range and the point is genuinely selective. The bias ran towards
volatile names — which the momentum criterion also rewards, so the two errors compounded rather
than cancelled.

The bands are now `0.5×` the daily ATR for the fan and historical S/R, and `0.33×` for the
harmonic level — the same ratio the old 1.0%/1.5% pair expressed, so re-basing the unit did not
quietly re-tune which criterion is strictest. A caller with no volatility read falls back to the
old fixed numbers rather than to a silently different rule.

This is the same move `lib/strat/levels.ts` already made for stops. **Re-run attribution before
and after**: this is directly measurable, and it is the kind of change whose sign is not obvious
in advance.

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

Factor rows are keyed by each criterion's **stable id** (`patternArmed`, `momentum`, …) rather
than its display text — see `lib/scoring/weights.ts`. Rewording a criterion used to split its
history into two half-sized samples; it no longer does, and the two spellings of the pattern
criterion ("Reversal"/"Continuation pattern armed") now correctly count as the one criterion they
always were.

**`patternArmed`** is constant *by construction* and always will be. The
replay only evaluates setups where a pattern was detected, and takes the trade
direction from the pattern itself, so the criterion is true on every replayed
trade in every bucket. It contributes a guaranteed +1, which means the `Execute`
cutoff of ≥7/9 is really ≥6 of the 8 criteria that can vary. It also means replay
scores sit systematically higher than live-scan scores, where a symbol can be
scanned with nothing armed and no plan priced — **do not compare a replay score
distribution against a live one.**

The decision-lag hold (`lib/data/latency.ts`) is a second reason not to. It
withdraws Execute on a live intraday scan when the feed is a whole execution bar
behind; a replay runs on settled historical bars where that lag does not exist,
so the replay's Execute bucket is the one the score produces before any
freshness question is asked.

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

## From attribution to weights

`attributeFactors` produces `deltaExpectancyR` per criterion — how much better a trade did when
the criterion passed. That is the number a weight should be set from, and for a long time nothing
consumed it.

`lib/backtest/propose-weights.ts` does. Run it from the **Proposed weights** panel on `/learning`,
or `POST /api/learning/propose-weights` (authorised with `CRON_SECRET`, or as a signed-in user).
The guardrails, in the order they bite:

1. The run is split **chronologically** — earlier trades train, later trades check. A shuffled
   split leaks the same conditions into both halves and validates nothing.
2. A criterion must be `informative` in **both** halves. Constant or thin-armed on either side
   means the sample cannot see it.
3. Both halves must **agree on the sign**. A factor that helped then hurt is noise.
4. The effect must clear `MIN_EFFECT_R` (0.1R) — below that it is inside the friction the replay
   already charges.
5. The move is sized off the **weaker** half, so the out-of-sample check constrains the step
   rather than merely permitting it.
6. Steps are capped at a third of a weight, weights are clamped to [0.5, 2], and the set is
   renormalised to nine points, so the Execute (≥7) and Watch (≥4) cutoffs keep their meaning.

A proposal is written as a **draft** `learning_models` row and changes no score. Promoting it to
`live` is a deliberate human act; `lib/scoring/active-weights.ts` picks it up from there, cached
for a minute, and falls back to one point each on any failure.

**It is not on a Vercel cron and must not be.** The Hobby plan allows two daily crons and both are
spent on `/api/market-scan` (`docs/THIRD_PARTY_LIMITS.md`), and a replay is far too slow for a
scheduled function anyway. Point an external scheduler at it — weekly is the right cadence, since
a proposal that moves faster than the held-out half can refresh is fitting noise.

## Sample-size floor

`attributeFactors` withholds a recommendation when either arm of a split has
fewer than `MIN_SAMPLES_PER_ARM` (10) trades, and reports the factor as **too
few** instead. This mirrors the floor in the Python `backtest.py` so both tools
refuse at the same place. A 3-trade arm will show a correlation of 1.0 given the
chance.
