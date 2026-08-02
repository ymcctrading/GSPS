"""
example_usage.py
-----------------
Demonstrates a full scan using values loosely modeled on the original
checklist example (price ~106, Gann 1x4 fan at 106.66, Sq9 0° at 106.00,
2-2 bearish trigger at 106.14).

Includes example of early-stage momentum opportunity detection (new in Tier 1 fixes).

Run: python example_usage.py
"""

from schema import SetupInput
from scanner import run_scan, print_report
from logger import log_scan, update_outcome

# --- Example 1: a bearish setup with volatility-adjusted stops, sliding-scale R/R ---
setup = SetupInput(
    symbol="EXAMPLE",
    direction="bear",
    price=106.30,

    # Gates
    macro_trend_aligned=True,
    avg_daily_volume=2_100_000,
    bid_ask_spread_pct=0.08,
    trading_days_to_next_earnings=11,
    adx_daily=24,

    # Trend
    hourly_trend_aligned=True,
    adx_entry_tf=22,

    # Structure cluster — distances as % from price
    dist_pct_gann_fan=0.34,       # within 0.40% tolerance -> hit
    dist_pct_square_of_9=0.28,    # outside 0.25% tolerance -> miss
    dist_pct_historical_sr=0.10,  # within 0.50% -> hit
    dist_pct_fibonacci=0.55,      # outside 0.30% -> miss

    # Momentum
    macd_line=-0.12,
    macd_signal=-0.05,
    macd_histogram_rising=True,    # NOTE: this field means "improving in the TRADE's favor",
                                    # not literally rising — for a bear setup, True = histogram
                                    # pushing further negative (momentum building downward)
    rsi=42,
    rsi_divergence_present=True,

    # Participation
    relative_volume_ratio=1.8,
    relative_strength_vs_benchmark=True,

    # Environment
    atr_percentile_6mo=55,

    # Execution (TIER 1 FIX: volatility-scaled stops + sliding-scale R/R)
    strat_pattern_armed=True,
    stop_distance_pct=1.2,         # normal vol = 1.0-1.8% band, so this passes
    tp1_r_multiple=1.8,            # 1.8R = "strong" tier (6/8 pts instead of old binary 0pts)
)

result = run_scan(setup)
print_report(result)

entry_id = log_scan(result)
print(f"Logged as {entry_id}")

# Later, once the trade resolves, you'd call:
# update_outcome(entry_id, outcome="win", r_multiple=2.1, notes="Clean break, hit TP1 same session.")


# --- Example 2: Early-stage momentum opportunity detection ---
print("\n\n### Example 2: Early-stage momentum opportunity ###")
setup2 = SetupInput(
    symbol="MOMENTUM",
    direction="bull",
    price=150.00,

    # Gates
    macro_trend_aligned=True,
    avg_daily_volume=3_200_000,
    bid_ask_spread_pct=0.05,
    trading_days_to_next_earnings=15,
    adx_daily=22,

    # Trend
    hourly_trend_aligned=True,
    adx_entry_tf=20,

    # Structure cluster
    dist_pct_gann_fan=0.08,
    dist_pct_square_of_9=0.12,
    dist_pct_historical_sr=0.06,
    dist_pct_fibonacci=0.09,

    # NEW: Early-stage momentum detection
    # Price is 2.5% away from next Gann target, 2.3% from next Fib
    # This should trigger "early_stage_momentum_opportunity" factor
    dist_pct_next_gann_target=2.5,
    dist_pct_next_fib_target=2.3,

    # Momentum
    macd_line=0.08,
    macd_signal=0.05,
    macd_histogram_rising=True,
    rsi=58,                       # not extreme (< 70), so still in early stages
    rsi_divergence_present=False,

    # Participation
    relative_volume_ratio=2.1,
    relative_strength_vs_benchmark=True,

    # Environment
    atr_percentile_6mo=65,         # solid volatility (>= 40th percentile required)

    # Execution
    strat_pattern_armed=True,
    stop_distance_pct=0.8,         # high-vol regime, so 1.5-2.2% band... this fails
    tp1_r_multiple=1.6,            # marginal tier (2/8 pts)
)

result2 = run_scan(setup2)
print_report(result2)
log_scan(result2)


# --- Example 3: Setup that fails a gate (illustrates fail-closed earnings + trend regime) ---
print("\n\n### Example 3: Missing earnings data -> fails closed ###")
setup3 = SetupInput(
    symbol="EXAMPLE3",
    direction="bull",
    price=54.10,
    macro_trend_aligned=True,
    avg_daily_volume=900_000,
    bid_ask_spread_pct=0.10,
    trading_days_to_next_earnings=None,  # unavailable -> gate fails closed
    adx_daily=20,
)
result3 = run_scan(setup3)
print_report(result3)
log_scan(result3)


# --- Example 4: ADX at new gate boundary (45) - should pass, not score high ---
print("\n\n### Example 4: Strong trend (ADX 44) passes gate but doesn't score high ###")
setup4 = SetupInput(
    symbol="STRONG_TREND",
    direction="bear",
    price=200.00,

    # Gates
    macro_trend_aligned=True,
    avg_daily_volume=5_000_000,
    bid_ask_spread_pct=0.03,
    trading_days_to_next_earnings=12,
    adx_daily=44,                 # TIER 1 FIX: this now passes gate (was 40 limit before)

    # Trend
    hourly_trend_aligned=True,
    adx_entry_tf=35,              # but scoring "healthy" range is 18-32, so gets 0 trend_strength pts

    # Structure cluster
    dist_pct_gann_fan=0.15,
    dist_pct_square_of_9=0.18,
    dist_pct_historical_sr=0.22,
    dist_pct_fibonacci=0.19,

    # Momentum
    macd_line=-0.22,
    macd_signal=-0.10,
    macd_histogram_rising=True,
    rsi=35,
    rsi_divergence_present=False,

    # Participation
    relative_volume_ratio=2.8,
    relative_strength_vs_benchmark=True,

    # Environment
    atr_percentile_6mo=78,         # high vol regime

    # Execution
    strat_pattern_armed=True,
    stop_distance_pct=1.9,         # high-vol band is 1.5-2.2, so this passes
    tp1_r_multiple=2.2,            # excellent tier (8/8 pts)
)

result4 = run_scan(setup4)
print_report(result4)
log_scan(result4)
