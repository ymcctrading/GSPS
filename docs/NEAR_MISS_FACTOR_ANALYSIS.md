# Why 7/8/9 scores are rare: a near-miss factor analysis

Answers a direct question: are 7+ (Execute) scores rare because the scoring
bar is miscalibrated, or because that's genuinely how often the market lines
up? Two independent sources, cross-checked against each other rather than
taken singly — see "Method" for both and where they disagree.

## Score distribution (production `daily_scans`, trailing 30 days)

| Score | Count | Share |
|---:|---:|---:|
| 9 | 1 | 0.3% |
| 8 | 3 | 0.9% |
| 7 | 20 | 6.0% |
| 6 | 66 | 19.6% |
| 5 | 100 | 29.8% |
| 4 | 86 | 25.6% |
| 3 | 44 | 13.1% |
| 1–2 | 16 | 4.8% |
| **Total** | **336** | |

Execute (7+) is ~7% of everything scored. Roughly half of everything (5–6)
sits one or two points short — the "near miss" tier this page is about.

## Why 7+ is rare: it's a nine-way conjunction, not one strict knob

`computeScore` (`lib/scoring/score.ts`) awards one point per criterion across
five pillars — two trend layers, two independent structural-proximity checks,
historical S/R, an armed pattern, momentum, a cyclical timing window, and a
structurally-confirmed target. Reaching 7+ needs most of nine largely
independent conditions to align at once. That distribution shape (a peak
around 4–5, thinning fast above 6) is what a conjunction of independent-ish
binary conditions produces by construction — it is not, on its own, evidence
that any single criterion is miscalibrated.

Replay evidence (`docs/REPLAY_RESULTS.md`) backs up that the current bar is
doing real work, not being arbitrarily strict: in a 1033-trade replay across
six symbols, Execute (7+) trades ran 34.1% win rate / +0.013R expectancy —
barely above the 33.3% break-even line for a 2R target — while Watch (4–6)
ran 31.2% / **-0.072R**, a clearly losing population. Loosening the cutoff
would pull in more of the losing population, not more of the barely-winning
one.

## Which criterion most often costs the 7th point

### Source 1: live replay (walk-forward, the authoritative source)

`docs/REPLAY_RESULTS_SCORE_5_6.md` — 441 near-miss (score 5–6) trades,
SPY/AAPL/AMD/TSLA/MSFT/NVDA, 15Min execution, 2026-06-29 → 2026-08-26, real
Alpaca data (`live: true`). Two different readings of the same table, because
they answer different questions:

**Which criterion is most often the missing one** (raw fail rate — `1 -
passed.n/observed` from the linked report):

| Criterion | Pass rate | **Fail rate** |
|---|---:|---:|
| **Momentum / volatility elevated** (`momentum`) | 24.0% | **76.0%** |
| **Historical support/resistance** (`historicalSR`) | 28.6% | **71.4%** |
| Support/resistance line proximity (`fanProximity`) | 40.4% | 59.6% |
| Macro trend context (`macroTrend`) | 57.1% | 42.9% |
| Key price level proximity (`harmonicProximity`) | 65.5% | 34.5% |
| 1-hour trend agreement (`hourlyTrend`) | 65.8% | 34.2% |
| Final target confirmed by a structural level (`masterStructural`) | 71.7% | 28.3% |
| Cyclical turn window active (`timeCycle`) | 88.2% | 11.8% |
| Reversal pattern armed (`patternArmed`) | 100% | 0% |

**Which criterion carries the most economic weight** (Δ E[R] — expectancy
when the criterion passed vs. failed, the reading `attributeFactors`
docstring itself calls "the lever a weight would be set from"):

| Criterion | Δ E[R] | Corr | Read |
|---|---:|---:|---|
| historicalSR | **+0.237R** | 0.08 | Strongest positive lever — rare *and* valuable when present. |
| harmonicProximity | +0.114R | 0.04 | |
| timeCycle | +0.078R | 0.02 | |
| masterStructural | +0.060R | 0.02 | Common (72% pass) but barely discriminates outcome here. |
| fanProximity | +0.018R | 0.01 | Negligible. |
| hourlyTrend | +0.005R | 0.00 | Negligible. |
| momentum | -0.011R | -0.00 | Most frequently missing, but near-zero effect on outcome. |
| macroTrend | **-0.225R** | -0.08 | Inverted — see caveat below. |

Two things do **not** point the same direction, and that's the actual
finding: `momentum` is the single most frequently missing criterion, but its
Δ E[R] is essentially zero — whether it passes barely moves the outcome in
this population. `historicalSR` is the second-most frequently missing
criterion *and* by far the strongest lever when it is present. If one
criterion deserves a closer look as underweighted, the evidence points at
`historicalSR`, not `momentum` — "most often absent" and "most valuable when
present" are different questions, and conflating them would be exactly the
kind of false precision the doctrine's evidence-before-adaptation rule exists
to prevent. `macroTrend`'s inverted sign (passing it correlates with *worse*
outcomes here) is the standout anomaly, and it comes with the tool's own
built-in caution: "marginal, not causal... a hypothesis to re-run, not a
result" — one ~2-month window on six symbols is not enough to act on this
alone.

### Source 2: production snapshot (broader universe, single point in time)

122 near-miss (score 5–6) rows from `daily_scans` over the trailing 30 days
(market-wide universe — not just six large-caps), restricted to rows scored
under the current keyed criterion schema:

| Criterion | Pass rate | **Fail rate** |
|---|---:|---:|
| Final target confirmed by a structural level (`masterStructural`) | 37.7% | **62.3%** |
| Momentum / volatility elevated (`momentum`) | 38.5% | **61.5%** |
| Key price level proximity (`harmonicProximity`) | 43.4% | 56.6% |
| Macro trend context (`macroTrend`) | 51.6% | 48.4% |
| 1-hour trend agreement (`hourlyTrend`) | 53.3% | 46.7% |
| Historical support/resistance (`historicalSR`) | 63.9% | 36.1% |
| Support/resistance line proximity (`fanProximity`) | 66.4% | 33.6% |
| Cyclical turn window active (`timeCycle`) | 82.0% | 18.0% |
| Reversal pattern armed (`patternArmed`) | 100% | 0% |

### Where the two sources agree, and where they don't

**Agree:** `momentum` ranks among the top two most-frequently-missing
criteria in both — 76.0% fail (replay) vs. 61.5% fail (snapshot). `patternArmed`
is a non-factor in both (100% pass — every near-miss already has a valid
trigger; pattern detection is never what's holding these back).

**Disagree, substantially:** `masterStructural` is the *most* commonly
missing criterion in the market-wide snapshot (62.3% fail) but one of the
*least* commonly missing in the six-symbol live replay (28.3% fail).
`historicalSR` runs the other way — mid-table in the snapshot (36.1% fail)
but the second-biggest blocker in the replay (71.4% fail), and its strongest
economic lever.

The likely explanation is population, not contradiction: the snapshot covers
the whole scan universe (roughly 70 symbols across 12 sectors, top-15-per-direction
ranked daily), while the replay walks only six large, liquid names bar-by-bar
over two months. Whether a target lands on a real Gann/harmonic structural
level, or whether a symbol sits at a clustered historical S/R level, plausibly
depends on the instrument mix in a way frequency counts alone can't separate
from this data. **Treat this disagreement itself as the finding**: there is
no single universal "weak-link" criterion — which one is the bottleneck
depends on which symbols and timeframe are being scanned, which argues
against a blanket reweighting and for population-specific tuning if this is
pursued further.

## Verdict

Rare 7+ scores still read as **mostly market, not miscalibration** — that
part holds up under both sources. The bar is a nine-way conjunction by design
(doctrine: "no certainty without conditions"), Execute stays barely
above break-even (34.1% win rate / +0.014R vs. a 33.3% break-even line) while
Watch (32.2% / -0.040R) and Reject (28.5% / -0.158R) are both clearly
negative, and `patternArmed` — the one criterion every near-miss already
clears — confirms pattern detection isn't the bottleneck either way.

What's *not* settled: which single criterion is most worth a weight change,
if any. The live replay's own economic-weight view (`historicalSR` the
strongest lever, `momentum` frequent but weightless) disagrees with the
market-wide snapshot's frequency view (`masterStructural` the top blocker).
That disagreement, plus `macroTrend`'s marginal inverted correlation, are
concrete hypotheses for `lib/backtest/propose-weights.ts` to test against a
larger, multi-window sample — not conclusions to act on from either source
alone. See `docs/MODEL_REGISTRY.md` for the draft → approved → live path any
resulting weight change would go through.

## Method

Two different evidence sources, deliberately not blended into one table:

- **`docs/REPLAY_RESULTS_SCORE_5_6.md`** — a real run of the replay harness
  (`live: true`, `source: "alpaca"`), via `GET /api/backtest?symbols=SPY,AAPL,AMD,TSLA,MSFT,NVDA&timeframe=15Min&targetR=2&scoreRange=5-6`
  on the production deployment, captured to
  `docs/replay-runs/2026-08-26-15Min-2R-score5-6.json` and rendered with
  `scripts/replay-report.mjs` — the same tool and format as
  `docs/REPLAY_RESULTS.md`. This is walk-forward evidence: it says what would
  have happened trading this population, not just what the population looks
  like. The `--scoreRange` flag that made this possible was added specifically
  for this question — see `lib/backtest/replay.ts`'s `byScoreRange` and
  `lib/backtest/run.ts`'s `attributeScoreRange`.
- **The production snapshot** below — a direct SQL read of
  `public.daily_scans.detail->'breakdown'` (every scan already stores its
  full per-criterion breakdown). Not walk-forward: it answers "what does the
  current population of near-misses look like", not "would loosening the bar
  have made money". Not pinned to a window the way the replay run is —
  re-running the query on a different day returns different rows as
  `daily_scans` accumulates. Treat the snapshot numbers as of the date this
  page was generated (2026-08-27).

The snapshot is cross-checked against, not replaced by, the replay: they
disagree on `masterStructural`, and that disagreement is informative in its
own right — see above.

Reproduce the snapshot:

```sql
with unnested as (
  select
    d.score,
    (elem->>'key') as criterion_key,
    (elem->>'criterion') as criterion_label,
    (elem->>'passed')::boolean as passed
  from public.daily_scans d,
       jsonb_array_elements(d.detail->'breakdown') as elem
  where d.score in (5, 6)
    and d.scan_date >= current_date - interval '30 days'
    and (elem->>'key') is not null
)
select
  criterion_key,
  max(criterion_label) as criterion_label,
  count(*) as observed,
  count(*) filter (where passed) as passed_count,
  round(100.0 * count(*) filter (where passed) / count(*), 1) as pass_rate_pct,
  round(100.0 * count(*) filter (where not passed) / count(*), 1) as fail_rate_pct
from unnested
group by criterion_key
order by fail_rate_pct desc;
```

The score-distribution table groups the same table by `(score, output_state)`
over the same window, with no `breakdown` unnesting needed.
