"""
config.py
---------
Single source of truth for gate thresholds and scoring weights *of this Python
package*. Tune everything here. Nothing else in the package should hardcode a
number.

SCOPE — READ FIRST
------------------
Nothing outside this directory imports this file. It does not feed the app, the
live scan, or the replay harness in lib/backtest/replay.ts. The app scores with
lib/scoring/score.ts, which is a separate 9-criteria system that knows nothing
about the weights below.

So: changing a number in this file cannot move win rate or expectancy as the
replay reports them. Measure a change here with this package's own backtest.py
(which needs a hand-labelled scan_log.jsonl), or port the idea into
lib/scoring/score.ts where the replay can see it. See docs/BACKTESTING.md for
why the two systems diverged and which levers actually move replay numbers.

This is deliberately a plain dict-of-dicts (not a class) so it can be
dumped to / loaded from JSON easily for backtesting sweeps (see backtest.py).

TUNING CHANGELOG:
- 2026-08-02: Tier 1 fixes applied
  * Risk-reward sliding scale: <1.2R now scores 0 (was binary 2.0R+)
  * Volatility-adjusted stop bands: scale with ATR percentile
  * Trend regime gate expanded to 15-45 (was 15-40)
  * Early-stage momentum factor added to catch divergent moves
"""

CONFIG = {
    # ------------------------------------------------------------------
    # GATES — pass/fail. If ANY gate fails, the setup is rejected before
    # scoring even runs. No partial credit, no points.
    # ------------------------------------------------------------------
    "gates": {
        "min_avg_daily_volume": 500_000,       # shares/contracts
        "max_bid_ask_spread_pct": 0.30,        # percent of price
        "earnings_blackout_days": 5,           # TIER 2: expanded from 3 (accounts for IV expansion week-of)
        "trend_regime_adx_min": 15,            # below this = no real trend, chop
        "trend_regime_adx_max": 45,            # above this = unmeltable trend (expanded from 40)
        # If True, missing earnings-calendar data FAILS the gate instead of
        # silently passing. This was the biggest silent bug in the original
        # checklist — never let missing risk data default to "safe."
        "fail_closed_on_missing_earnings_data": True,
    },

    # ------------------------------------------------------------------
    # STRUCTURE CLUSTER — Gann fan, Square of 9, historical S/R, Fibonacci.
    # These are four different math systems asking the same question
    # ("is price at a meaningful level?"), so they are NOT summed raw.
    # Instead: count how many independently fire, then map through a
    # diminishing-returns curve. Tune the curve here.
    # ------------------------------------------------------------------
    "structure_cluster": {
        "tolerance_pct": {
            "gann_fan": 0.40,     # % distance from fan line to count as "near"
            "square_of_9": 0.25,
            "historical_sr": 0.50,
            "fibonacci": 0.30,
        },
        # hits -> points awarded (0 hits = 0 pts always)
        "diminishing_points": {
            1: 8,
            2: 14,
            3: 18,
            4: 20,
        },
        "max_points": 20,
    },

    # ------------------------------------------------------------------
    # SCORED FACTORS — grouped by category. "points" is the max awardable
    # for that factor. Binary factors award all-or-nothing; a few (marked)
    # support partial credit via a 0.0-1.0 multiplier passed in by the caller.
    # ------------------------------------------------------------------
    "scored_factors": {
        "trend": {
            "hourly_trend_agreement": {"points": 10},
            "trend_strength": {"points": 6},   # ADX in the "healthy" band, not gate-band
        },
        "momentum": {
            "macd_alignment": {"points": 8},
            "rsi_regime": {"points": 8},
            "rsi_divergence": {"points": 8},   # NEW vs both source checklists
        },
        "participation": {
            "volume_impulse": {"points": 10},
            "relative_strength_vs_benchmark": {"points": 6},  # NEW
        },
        "environment": {
            "volatility_regime": {"points": 8},  # ATR percentile in target band
        },
        "execution": {
            "strat_pattern_armed": {"points": 10},
            "clean_invalidation_distance": {"points": 10},  # volatility-adjusted
            "risk_reward": {"points": 8},  # sliding scale: <1.2R = 0, 1.2-1.5R = 4, 1.5-1.8R = 6, 2.0R+ = 8
            "early_stage_momentum_opportunity": {"points": 6},  # NEW: catch divergent moves early
        },
    },

    # ------------------------------------------------------------------
    # Volatility / trend-strength bands used by the "environment" and
    # "trend" scored factors (separate from the gate-level ADX band above,
    # which just filters out unfadeable trend regimes).
    # ------------------------------------------------------------------
    "bands": {
        "atr_percentile_target": (30, 70),   # 6-month ATR percentile range
        "healthy_adx_range": (18, 32),       # sweet spot for reversals
        "rsi_bull_min": 35,                  # TIER 2: fade below 35 (oversold, was 50)
        "rsi_bear_max": 65,                  # TIER 2: fade above 65 (overbought, was 50)
        "rsi_overbought": 70,
        "rsi_oversold": 30,
        "volume_impulse_min_ratio": 2.0,     # TIER 2: tightened from 1.5x (true impulse signal)

        # TIER 1 FIX: Volatility-adjusted stop distance bands
        # Previous: fixed 0.5-2.0% regardless of volatility
        # Now: scales with ATR percentile to match execution realities
        "invalidation_bands_by_volatility": {
            "high": {"min": 1.5, "max": 2.2},   # ATR >= 70th percentile
            "mid": {"min": 1.0, "max": 1.8},    # 30-70th percentile (normal)
            "low": {"min": 0.5, "max": 1.3},    # ATR < 30th percentile
        },

        # TIER 1 FIX: Risk-reward sliding scale
        # Previous: binary (2.0R+ = 8pts, else 0)
        # Now: partial credit for 1.2-2.0R range
        "risk_reward_thresholds": {
            "excellent": {"min_r": 2.0, "points": 8.0},   # 2.0R+ = full 8pts
            "strong": {"min_r": 1.8, "points": 6.0},      # 1.8-2.0R = 6pts
            "acceptable": {"min_r": 1.5, "points": 4.0},  # 1.5-1.8R = 4pts
            "marginal": {"min_r": 1.2, "points": 2.0},    # 1.2-1.5R = 2pts (trading setup data suggests viability)
            "floor": {"min_r": 0.0, "points": 0.0},       # <1.2R = 0pts
        },

        # Early-stage momentum: distance from next Gann/Fib level (%)
        "momentum_distance_min": 1.5,  # Must be > 1.5% away from confluence
        "momentum_distance_max": 4.0,  # But < 4.0% (after that it's just a random move)
        "momentum_rsi_max_extreme": 75,  # Bear: RSI < 25 or > 75 = too late
        "momentum_rsi_min_extreme": 25,  # Bull: RSI < 25 or > 75 = too late
        "momentum_atr_percentile_min": 40,  # Need some volatility for momentum to matter
    },
}
