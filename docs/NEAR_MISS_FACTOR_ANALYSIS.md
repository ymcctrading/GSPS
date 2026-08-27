# Why 7/8/9 scores are rare: a near-miss factor analysis

Answers a direct question: are 7+ (Execute) scores rare because the scoring
bar is miscalibrated, or because that's genuinely how often the market lines
up? Snapshot from production `daily_scans`, not the replay harness — see
"Method" below for why, and for how to refresh this.

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

122 near-miss (score 5–6) scans over the trailing 30 days, restricted to
rows scored under the current keyed criterion schema (`lib/scoring/score.ts`'s
`ScoreBreakdownItem.key`) — 44 older rows that predate that field were
excluded rather than mixed with a different scoring-rule vintage.

| Criterion | Pass rate | **Fail rate** |
|---|---:|---:|
| **Final target confirmed by a structural level** (`masterStructural`) | 37.7% | **62.3%** |
| **Momentum / volatility elevated** (`momentum`) | 38.5% | **61.5%** |
| Key price level proximity (`harmonicProximity`) | 43.4% | 56.6% |
| Macro trend context (`macroTrend`) | 51.6% | 48.4% |
| 1-hour trend agreement (`hourlyTrend`) | 53.3% | 46.7% |
| Historical support/resistance (`historicalSR`) | 63.9% | 36.1% |
| Support/resistance line proximity (`fanProximity`) | 66.4% | 33.6% |
| Cyclical turn window active (`timeCycle`) | 82.0% | 18.0% |
| Reversal pattern armed (`patternArmed`) | 100% | 0% |

`masterStructural` and `momentum` are the two most common single blockers —
each fails on roughly 6 of 10 near-misses. By contrast every near-miss
already has an armed pattern (100%) and mostly clears the cyclical-timing
check (82%): pattern detection and timing are not what's holding these back,
structural target confirmation and volatility are.

This is consistent with, not contradictory to, the replay's own factor
attribution *inside* the Execute bucket, where `masterStructural` passes 86%
of the time (`docs/REPLAY_RESULTS.md`, "Factors inside Execute"). Read
together: `masterStructural` is a real discriminating gate — it separates
"structurally confirmed" from "merely projected" setups, it is disproportionately
the one a near-miss is missing, and it is disproportionately present once a
setup actually reaches Execute. That is the gate working as designed, not
noise.

## Verdict

Rare 7+ scores read as **mostly market, not miscalibration**. The bar is a
nine-way conjunction by design (doctrine: "no certainty without conditions"),
and the two criteria most often missing at the 5–6 tier — structural target
confirmation and momentum — are exactly the ones the replay shows carrying
real signal in the Execute bucket. Loosening either would trade a barely-positive
population for a clearly negative one.

## Method

This is a direct SQL snapshot of `public.daily_scans.detail->'breakdown'`
(every scan already stores its full per-criterion breakdown), not a replay
harness run. Two consequences:

- **It reflects whatever the live universe happened to produce**, not an
  out-of-sample replay — unlike `docs/REPLAY_RESULTS.md`, this is not
  walk-forward evidence and should not be read as one. It answers "what does
  the current population of near-misses look like", not "would loosening the
  bar have made money historically".
- **It is not pinned to a commit or a data window the way a replay run is.**
  Re-running the query below on a different day will return different rows
  as `daily_scans` accumulates. Treat the numbers above as of the date this
  page was generated (2026-08-26).

An attempt to get the equivalent data from the actual replay harness
(`npm run backtest -- --scoreRange 5-6`, added specifically for this
question — see `lib/backtest/replay.ts`'s `byScoreRange` and
`lib/backtest/run.ts`'s `attributeScoreRange`) was blocked by this session's
sandboxed network egress policy (`data.alpaca.markets` / `paper-api.alpaca.markets`
not allowlisted), not by missing credentials or missing tooling. That
capability is real and shipped; running it just needs an environment that
can reach Alpaca. Its numbers, when someone runs it, are the walk-forward
version of this page's snapshot and would be worth comparing against it.

Reproduce this snapshot:

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
