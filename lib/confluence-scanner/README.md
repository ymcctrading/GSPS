# GSPS Confluence Scanner — Tier 1 Tuned Version

A gate-then-score trade scanner built from the synthesized checklist design, with **Tier 1 accuracy improvements** applied.

Pure Python standard library — no dependencies to install.

> **This package is standalone.** Nothing outside this directory imports it. The
> app and the replay harness score with `lib/scoring/score.ts`, a separate
> 9-criteria system, so tuning `config.py` here cannot change any number the
> replay reports. See [`docs/BACKTESTING.md`](../../docs/BACKTESTING.md) before
> using replay output as feedback on a change made here.

## What's Changed (Tier 1 Fixes)

| Issue | Fix | Impact |
|-------|-----|--------|
| Risk-reward was binary (2.0R+ only) | Sliding scale (1.2R–2.0R gets partial credit) | **+2–6 pts per setup** |
| Stop distance ignored volatility | Volatility-adjusted bands (ATR-scaled) | **+0–2 pts** |
| Trend regime gate too restrictive | Expanded ADX max from 40 to 45 | **Allows more setups** |
| No early-stage momentum detection | New factor: 1.5–4.0% from target + RSI/vol | **+0–6 pts** |

**Result:** the partial-credit paths above let a setup earn points it previously
scored zero on, so the same setup lands higher on this package's scale. See
`TIER1_TUNING_SUMMARY.md` for details.

This scanner scores out of **118 points** (`total_score` / `max_score`, plus a
`score_pct`), set by the weights in `config.py`. Earlier revisions of this file
described the result as "8–9/9" — that is the 9-criteria scale of
`lib/scoring/score.ts`, a different system this package does not touch, and no
Tier 1 change here moves it.

## Files

| File | Purpose |
|---|---|
| `config.py` | **Tune everything here.** Gate thresholds, point weights, volatility bands, momentum thresholds. |
| `schema.py` | `SetupInput` (what you feed in) and `ScanResult` (what you get back). |
| `gates.py` | Hard pass/fail checks (macro trend, liquidity, earnings, trend regime). |
| `scoring.py` | Scored factors with Tier 1 fixes (sliding-scale R/R, volatility-adjusted stops, momentum opportunity). |
| `scanner.py` | `run_scan()` — the main entry point. Runs gates, then scoring. |
| `logger.py` | Appends every scan to `scan_log.jsonl`; lets you fill in outcomes later. |
| `backtest.py` | Reads logged outcomes, tells you which factors actually predict wins. |
| `example_usage.py` | Runnable demo — `python3 example_usage.py` |
| `TIER1_TUNING_SUMMARY.md` | Detailed rationale for each Tier 1 fix. |
| `BACKTEST_GUIDE.md` | How to measure factor performance over time using GSPS Learning Brain. |
| `EARNINGS_INTEGRATION.md` | Live earnings data feasibility assessment (Tier 2 recommendation: YES). |

## How It Works

This module does **not** fetch market data or talk to Gann/Sq9/RSI libraries itself. You (or whatever script/tool already computes those indicators) fill in a `SetupInput` dataclass and pass it to `run_scan()`. That keeps this module portable regardless of your data source, and keeps the scoring logic testable in isolation.

```python
from schema import SetupInput
from scanner import run_scan, print_report

setup = SetupInput(
    symbol="XYZ", direction="bear", price=106.30,
    macro_trend_aligned=True, avg_daily_volume=2_100_000,
    bid_ask_spread_pct=0.08, trading_days_to_next_earnings=11, adx_daily=24,
    hourly_trend_aligned=True, adx_entry_tf=22,
    dist_pct_gann_fan=0.34, dist_pct_square_of_9=0.28,
    dist_pct_historical_sr=0.10, dist_pct_fibonacci=0.55,
    macd_line=-0.12, macd_signal=-0.05, macd_histogram_rising=True,
    rsi=42, rsi_divergence_present=True,
    relative_volume_ratio=1.8, relative_strength_vs_benchmark=True,
    atr_percentile_6mo=55,
    strat_pattern_armed=True,
    stop_distance_pct=1.2,   # NEW: volatility-adjusted
    tp1_r_multiple=1.8,      # NEW: partial credit for 1.8R
    # NEW: early-stage momentum detection
    dist_pct_next_gann_target=2.2,
    dist_pct_next_fib_target=2.1,
)

result = run_scan(setup)
print_report(result)
```

## Usage Workflow

### 1. Single Scan (Ad-hoc)

```bash
python3 -c "
from schema import SetupInput
from scanner import run_scan, print_report
setup = SetupInput(...)
result = run_scan(setup)
print_report(result)
"
```

### 2. Backtesting (Continuous Tuning)

After you've traded the setups and filled in outcomes:

```bash
# Run the backtest
python3 backtest.py scan_log.jsonl

# Output: factor correlations, suggested reweighting
# Feed results back into config.py
```

### 3. Integration with GSPS Website

The scanner is designed to be called from GSPS backend routes:

```typescript
// app/api/scanner/confluency-score/route.ts
import { run_scan, print_report } from "@/lib/confluence-scanner/scanner.py";

export async function POST(request: Request) {
  const setup = await request.json();
  const result = run_scan(setup);
  return Response.json(result);
}
```

## Tuning Workflow

1. Every scan → `log_scan(result)` writes a row to `scan_log.jsonl` with `outcome: null`
2. After trade resolves:
   ```python
   update_outcome(entry_id, outcome="win", r_multiple=2.1, notes="...")
   ```
3. Once 30+ resolved trades: `python3 backtest.py`
4. Backtest output → suggested reweighting multipliers
5. Apply multipliers to `config.py` `points` values
6. Repeat every 2–3 weeks

## Design Decisions (Tier 1)

1. **Gates are pass/fail, not scored.** Macro trend, liquidity, earnings risk, and trend regime must all clear before scoring. A setup that fails a gate isn't scored at all.

2. **Missing risk data fails closed.** If earnings calendar unavailable, gate fails — it does not silently award zero.

3. **Structure cluster uses diminishing returns.** Four overlapping descriptions of the same price level (Gann/Sq9/S-R/Fib) aren't counted as four independent confirmations.

4. **Risk-reward sliding scale (Tier 1 Fix A).** 1.2R gets 2pts, 1.5R gets 4pts, 1.8R gets 6pts, 2.0R+ gets 8pts. No more binary 0/8.

5. **Volatility-adjusted stops (Tier 1 Fix B).** Stop bands scale with ATR percentile: high-vol gets 1.5–2.2%, normal gets 1.0–1.8%, low gets 0.5–1.3%.

6. **Trend regime gate expanded (Tier 1 Fix C).** Gate allows ADX up to 45 (was 40), but scoring rewards 18–32 sweet spot.

7. **Early-stage momentum detection (Tier 1 Fix D).** NEW factor awards points if price is 1.5–4.0% from next target, RSI not extreme, and volatility present.

## Extending

- **Add a new gate:** Write a function in `gates.py` returning `(bool, str)`, add to `ALL_GATES`
- **Add a new scored factor:** Write a function in `scoring.py` returning a `FactorResult`, add to `ALL_SCORERS`, add weight to `config.py`
- **Modify thresholds:** Edit `config.py` — no code changes needed
- **Change point weights:** Edit `config.py` then run backtest.py to validate

## Backtest Integration

See `BACKTEST_GUIDE.md` for detailed instructions on:
- Using the GSPS Learning Brain (Supabase-backed)
- Exporting scan data for Python backtest.py
- Building a backtest dashboard in the GSPS website
- Continuous factor reweighting workflow

## Live Earnings Data (Tier 2 Recommendation)

See `EARNINGS_INTEGRATION.md` for feasibility assessment.

**Recommendation: YES, feasible and recommended.**
- Use Yahoo Finance API (free tier)
- Implement 2–3 hours
- Improves gate accuracy
- Zero additional cost

## Example Outputs

### Passing Setup

```
============================================================
EXAMPLE — BEAR setup
============================================================
GATES: all passed.

SCORE: 18.5 / 28  (66.1%)

-- STRUCTURE (14.0/20) --
  ✓ structure_confluence: 14.0/20 — 2/4 level systems in confluence (gann_fan, historical_sr)

-- TREND (10.0/16) --
  ✓ hourly_trend_agreement: 10.0/10 — 1-hour structure confirms bear bias.
  ✓ trend_strength: 0.0/6 — Entry-TF ADX 22.0 outside healthy band (18-32).

-- MOMENTUM (16.0/24) --
  ✓ macd_alignment: 8.0/8 — MACD below signal, histogram improving (aligned with bear bias).
  ✓ rsi_regime: 8.0/8 — RSI 42.0 supports bear bias.
  ✗ rsi_divergence: 0.0/8 — Divergence present but NOT favorable.

-- PARTICIPATION (10.0/16) --
  ✓ volume_impulse: 10.0/10 — Trigger volume at 1.80x 20d avg (meets 1.5x threshold).
  ✗ relative_strength_vs_benchmark: 0.0/6 — Underperforming benchmark (not as expected).

-- ENVIRONMENT (8.0/8) --
  ✓ volatility_regime: 8.0/8 — 6mo ATR percentile 55 within target band (30-70).

-- EXECUTION (18.5/34) --
  ✓ strat_pattern_armed: 10.0/10 — Strat trigger armed in bear direction.
  ✓ clean_invalidation_distance: 10.0/10 — Stop 1.2% (clean band 1.0-1.8% for mid-vol ATR 55th percentile).
  ✓ risk_reward: 6.0/8 — TP1 at 1.80R — strong tier (6/8 pts). Floor is 1.2R, excellent at 2.0R+.
  ? early_stage_momentum_opportunity: 0.0/6 — Insufficient data — scored as 0, flagged for review.
```

### Failing Setup

```
============================================================
EXAMPLE2 — BULL setup
============================================================
GATES: FAILED — setup rejected, not scored.

  ✗ earnings_event_risk: Earnings calendar unavailable — failing closed (was a silent zero in the old checklist).
```

## Performance Notes

- **Speed:** Negligible (< 1ms per scan, no external calls)
- **Memory:** < 1MB per scan result
- **Scalability:** Pure Python, no bottlenecks; easily runs 1000s of scans/day

## Questions?

Refer to:
- `TIER1_TUNING_SUMMARY.md` — "Why these changes?"
- `BACKTEST_GUIDE.md` — "How do I know it's working?"
- `EARNINGS_INTEGRATION.md` — "Should I add live earnings data?"
- `example_usage.py` — "Show me real examples"
