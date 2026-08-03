"""
example_usage.py
-----------------
Demonstrates both manual setup (for testing) and automatic data fetching from Yahoo Finance.

Option 1: Manual values (all fields provided, no network calls)
Option 2: Automatic from Yahoo Finance (you provide Gann/Fib/pattern, everything else fetched)

Run: python example_usage.py
"""

from schema import SetupInput
from scanner import run_scan, print_report
from logger import log_scan
from data_sources.build_setup import build_setup_from_yahoo


# --- Example 1: Manual setup (all fields provided) with new MACD schema ---
print("### Example 1: Manual setup with new MACD schema ###")
print("(macd_histogram_prev and macd_histogram_curr instead of boolean)\n")

setup1 = SetupInput(
    symbol="EXAMPLE1",
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

    # Momentum (NEW: raw histogram values, not boolean)
    macd_line=-0.12,
    macd_signal=-0.05,
    macd_histogram_prev=-0.08,     # histogram value one bar back
    macd_histogram_curr=-0.10,     # histogram value on trigger bar (more negative = falling for bear)
    rsi=68,                        # TIER 2: Bear fade target is RSI > 65 (overbought)
    rsi_divergence_present=True,

    # Participation
    relative_volume_ratio=1.8,
    relative_strength_vs_benchmark=True,

    # Environment
    atr_percentile_6mo=55,

    # Execution (TIER 1: volatility-scaled stops + sliding-scale R/R)
    strat_pattern_armed=True,
    stop_distance_pct=1.2,         # normal vol = 1.0-1.8% band, so this passes
    tp1_r_multiple=1.8,            # 1.8R = "strong" tier (6/8 pts instead of old binary 0pts)
)

result1 = run_scan(setup1)
print_report(result1)
entry_id = log_scan(result1)
print(f"Logged as {entry_id}\n")


# --- Example 2: Automatic from Yahoo Finance (minimal manual input) ---
print("\n### Example 2: Automatic data from Yahoo Finance ###")
print("(Only you provide Gann/Fib/pattern; everything else fetched)\n")

try:
    # Yahoo fetches: macro_trend, volume, spread, earnings, ADX, hourly trend, MACD, RSI, ATR percentile
    # You supply: Gann, Sq9, S/R, Fib distances + pattern + stops/TP
    setup2 = build_setup_from_yahoo(
        symbol="AAPL",
        direction="bear",
        # Your proprietary levels (from your tools):
        dist_pct_gann_fan=0.25,
        dist_pct_square_of_9=0.15,
        dist_pct_historical_sr=0.10,
        dist_pct_fibonacci=0.30,
        strat_pattern_armed=True,
        stop_distance_pct=1.2,
        tp1_r_multiple=2.0,
        # RSI divergence: leave as None if unsure; you review the chart
        rsi_divergence_present=None,
    )

    result2 = run_scan(setup2)
    print(f"AAPL bear setup (auto-fetched from Yahoo):")
    print_report(result2)
    log_scan(result2)

except Exception as e:
    print(f"Could not fetch from Yahoo Finance: {e}")
    print("(This is expected if network access to query1/2.finance.yahoo.com is not available)")
    print("In production, this would catch transient failures gracefully.\n")


# --- Example 3: Early-stage momentum opportunity detection ---
print("\n### Example 3: Early-stage momentum opportunity ###")
print("(Catch moves before they hit the confluence level)\n")

setup3 = SetupInput(
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

    # Structure cluster (AT the level)
    dist_pct_gann_fan=0.08,
    dist_pct_square_of_9=0.12,
    dist_pct_historical_sr=0.06,
    dist_pct_fibonacci=0.09,

    # NEW: Early-stage momentum detection
    # Price is 2.5% away from next Gann target, 2.3% from next Fib
    # This should trigger "early_stage_momentum_opportunity" factor (6 points)
    dist_pct_next_gann_target=2.5,
    dist_pct_next_fib_target=2.3,

    # Momentum
    macd_line=0.08,
    macd_signal=0.05,
    macd_histogram_prev=0.02,      # histogram rising (2bp to 4bp)
    macd_histogram_curr=0.04,
    rsi=58,                        # not extreme (< 70), still in early stages
    rsi_divergence_present=False,

    # Participation
    relative_volume_ratio=2.1,
    relative_strength_vs_benchmark=True,

    # Environment
    atr_percentile_6mo=65,         # solid volatility (>= 40th percentile required)

    # Execution
    strat_pattern_armed=True,
    stop_distance_pct=0.8,         # TIER 1 FIX: high-vol regime (ATR 65th) = 1.5-2.2% band, so this fails
    tp1_r_multiple=1.6,            # marginal tier (2/8 pts)
)

result3 = run_scan(setup3)
print_report(result3)
log_scan(result3)


# --- Example 4: Setup that fails a gate ---
print("\n### Example 4: Missing earnings data -> fails closed ###")
setup4 = SetupInput(
    symbol="EXAMPLE4",
    direction="bull",
    price=54.10,
    macro_trend_aligned=True,
    avg_daily_volume=900_000,
    bid_ask_spread_pct=0.10,
    trading_days_to_next_earnings=None,  # unavailable -> gate fails closed
    adx_daily=20,
)
result4 = run_scan(setup4)
print_report(result4)
log_scan(result4)


# --- Example 5: ADX at new gate boundary (45) - should pass, not score high ---
print("\n### Example 5: Strong trend (ADX 44) passes gate but doesn't score high ###")
setup5 = SetupInput(
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
    macd_histogram_prev=-0.15,
    macd_histogram_curr=-0.20,     # falling further negative
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

result5 = run_scan(setup5)
print_report(result5)
log_scan(result5)
