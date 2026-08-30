# Backtesting the protocol

See `docs/VALIDATION_BACKTESTING_AUDIT_COMPLIANCE.md` for how this harness maps
onto the "Validation, Backtesting, Audit & Compliance Plan" spec pack —
required performance metrics (avg/median win and loss, max loss, profit
factor, max drawdown, slippage sensitivity), strategy versioning, and what of
that spec pack is not built (stress tests, Monte Carlo, live-scan audit
persistence, the legal/compliance workstream).

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
  hypothesis. The mechanism for that: the replay's own P&L walk uses the raw
  pattern stop by default (`ReplayTrade.stop` has never reflected the leeway
  or the large-cap widening, only the verdict shown alongside it has) — pass
  `useProductionStop: true` (`npm run backtest -- --productionStop`) to walk
  the widened stop instead, and compare the "Large-cap" row of the rendered
  report's "Large-cap vs. not" section across a run with the flag and one
  without. Requires live vendor credentials (`ALPACA_API_KEY`/`_SECRET`) —
  the harness refuses to publish a synthetic-data run, by design (see
  `scripts/replay-report.mjs`'s own header for why).
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

## Fixed: proximity criteria ignored level role

All three structural criteria — `fanProximity`, `harmonicProximity`, and `historicalSR` — asked "is
there a structural level near price", full stop. `fanProximity`/`harmonicProximity` read
`gann.fanLines[0]`/`gann.squareOf9[0]`, the single nearest level by distance; `historicalSR` took
whatever `nearestLevelMatch` returned. None checked `role`. A level only confirms confluence when
it sits on the side that helps the trade: a **support** floor underneath a long, a **resistance**
ceiling above a short. The nearest level is frequently the wrong one — a long entering right under
overhead resistance is not confluence, it is a headwind the trade has to punch through — and all
three criteria were awarding the point either way.

The backtest replay was silently exempt from the `historicalSR` half of this defect: it only ever
passed a boolean (`nearAnyLevel`) into `computeScore`, never the matched level's role, unlike the
live scan. `lib/backtest/replay.ts` now carries the matched level and its role
(`nearestLevelMatch` + `levelRole`, mirroring `lib/scanTicker.ts`), so the replay measures the same
fix the live scanner runs, not a stale approximation of it. `applyReversionConfirmation` also used
to take a separate raw `nearSupportResistance` boolean for its own "confirmed" check; it now reads
the score's own (role-aware) `historicalSR` verdict off the breakdown instead, so a bare 2-2
reversal can no longer be "confirmed" by a wrong-side level even if the caller's raw boolean says
yes.

Four committed real replay runs (`docs/replay-runs/*.json`, live Alpaca data, two different
windows and execution timeframes) showed exactly the damage this does:

| Run | harmonicProximity Δ E[R] (pass − fail) | Verdict |
|---|---:|---|
| 15Min, 2R | −0.181R | insufficient (failed arm n=5) |
| 15Min, 3R | −0.474R | insufficient (failed arm n=5) |
| 1Hour, 2R | −0.443R | informative |
| 1Hour, 3R | −0.927R | informative |

Passing correlated with a **worse** outcome than failing in all four samples — the only criterion
of nine with that property in every run — and the effect grows at the larger 3R target, consistent
with a wrong-side level capping the move before a bigger target could be reached. `fanProximity`
showed the same role-blindness in a noisier form: its sign flipped between the 15Min and 1Hour
samples, which is what a role-blind criterion mixing real confluence with a headwind looks like
when the mix ratio shifts between universes.

**The fix**: `fanProximity`/`harmonicProximity` now search each level array (already sorted
nearest-first, already carrying `role`) for the nearest entry whose role matches the trade
direction — `support` for a long, `resistance` for a short — inside the same ATR band as before,
rather than only checking whether the single nearest entry happens to match; that finds real
confluence a farther-but-still-in-band correct-side level would otherwise miss. `historicalSR`
matches the role of whichever single level `nearestLevelMatch` already returned. Callers that only
have the boolean and no matched level (older call sites, some existing tests) keep the pre-fix
behavior for `historicalSR` rather than being silently failed by a check they can't answer. See
`wantedRole` in `lib/scoring/score.ts` and the `computeScore proximity criteria respect level role`
tests in `lib/__tests__/score.test.ts`.

This is a role filter, not a re-weight, and it is a different fix from the `masterStructural`
question below: that one's sign disagreed between timeframes (the disqualifying case
`propose-weights.ts` calls `disagreed`), so it was left alone. `harmonicProximity`'s sign agreed
across all four available real samples — the strongest evidence this repo has produced for any of
the nine criteria — and the mechanism (role-blindness) is a plausible, checkable defect rather than
a market read.

### Confirmed against live data (2026-08-27)

`GET /api/backtest?symbols=SPY,AAPL,AMD,TSLA,MSFT,NVDA&timeframe=15Min&targetR=2&within=Execute`,
run against the deployment (`live: true`, `source: alpaca`), same universe/timeframe/target as the
pre-fix `docs/replay-runs/2026-08-12-15Min-2R.json` baseline. Payload captured to
`docs/replay-runs/2026-08-27-15Min-2R-postfix.json` and rendered into `docs/REPLAY_RESULTS.md`:

| | Pre-fix (2026-08-12) | Post-fix (2026-08-27) |
|---|---:|---:|
| Execute trades | 126 | 31 |
| Execute win rate | 34.1% | 38.7% |
| Execute expectancy | +0.013R | **+0.151R** |
| Watch expectancy | −0.072R | −0.009R |
| Reject expectancy | −0.081R (64 trades) | −0.184R (365 trades) |
| Overall (all buckets) | −0.062R | −0.065R |

Execute's expectancy moved from a barely-positive reading indistinguishable from noise to a solidly
positive one — over five times larger, on a win rate that cleared break-even (33.3% at 2R) by a
wider margin. The mechanism matches what the fix predicts: overall expectancy across all buckets
combined is unchanged (the trades themselves didn't change, only which bucket each landed in), and
Reject absorbed most of what Execute and Watch shed — 365 trades at −0.184R versus 64 at −0.081R
pre-fix. Setups that used to score high on a wrong-side "confluence" point now correctly fall
through to Reject instead of inflating Execute or Watch.

Two honest caveats before treating this as closed: **the Execute sample is now thin** (31 trades,
down from 126 — the stricter role check is more selective, which is the point, but also means a
wider confidence interval), so per-criterion factor attribution on this run is mostly `insufficient`
verdict and shouldn't be read further. And **the window shifted forward two weeks** (trailing
lookback, not a fixed period — see "Win rate decides nothing on its own" above), so this is not a
perfectly matched before/after on identical bars. Worth a second confirmation run once more Execute
trades have accumulated, but the direction and magnitude here are what the fix was built to produce.

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

## Open question: is `masterStructural` inverted?

A manual walkthrough on 2026-08-21 (`GET /learning`, live Alpaca data, default 2R target, the
Execute bucket, 88 trades) found this criterion reading the wrong way:

| Criterion | Passed | E[R] pass | E[R] fail | Δ E[R] |
|---|---:|---:|---:|---:|
| Master target confirmed by structure | 73/88 | −0.225R | +0.782R | −1.007R |

Every other criterion in that table had the expected sign — passing correlated with a better
outcome. This one did not, and the swing is the largest of the nine.

**This has not been acted on**, for the same reason the section above gives for the 15Min/1Hour
inversion: 88 trades is a single bucket on a two-month window, and this project's standing rule is
not to re-weight anything until an effect clears an out-of-sample check
(`lib/backtest/propose-weights.ts`, summarised under "From attribution to weights" below) — a
90/71 in-sample split on one run is exactly the shape of result that check exists to catch before
it reaches the score. `masterStructural` is already one of the nine `CRITERION_KEYS`, so running
**Proposed weights** from `/learning` (or `POST /api/learning/propose-weights`) over a longer,
multi-symbol window already puts this criterion through that check with no code change required.

What that run should decide:

- **Both halves agree the sign is negative and clear `MIN_EFFECT_R`** → the criterion is genuinely
  costing expectancy. `proposeWeights` will already move its weight toward `MIN_WEIGHT` (0.5); if
  it holds up on a second, independent window too, that is the point to consider dropping the
  criterion or inverting `cleanRR` in `lib/scoring/score.ts` outright, not merely down-weighting it.
- **The halves disagree, or the effect doesn't clear the floor** → this 88-trade reading was noise
  wearing a result's clothes, matching the pattern the timeframe/regime section above already
  documents. Leave scoring as-is.

Nobody has run that check yet — this repo has no local Alpaca credentials (see "Where the Alpaca
keys live" above), so producing it requires the `--from` flow against a signed-in deployment.
Until it exists, `cleanRR`'s polarity in `lib/scoring/score.ts` stays as it is.

## Sample-size floor

`attributeFactors` withholds a recommendation when either arm of a split has
fewer than `MIN_SAMPLES_PER_ARM` (10) trades, and reports the factor as **too
few** instead. This mirrors the floor in the Python `backtest.py` so both tools
refuse at the same place. A 3-trade arm will show a correlation of 1.0 given the
chance.
