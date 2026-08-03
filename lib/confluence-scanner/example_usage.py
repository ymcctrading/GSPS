"""
example_usage.py
-----------------
FULLY AUTOMATED: Fetches everything from Yahoo Finance and auto-detects all levels.
No manual inputs needed — just symbol + direction.

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


# --- Example 2: Fully AUTOMATIC from Yahoo Finance ---
print("\n### Example 2: FULLY AUTOMATIC (zero manual inputs) ###\n")

try:
    setup2 = build_setup_from_yahoo(
        symbol="AAPL",
        direction="bear",
    )

    result2 = run_scan(setup2)
    print(f"AAPL bear setup (100% auto-detected):")
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


# --- Example 3b: SPY bull (fully auto) ---
print("\n### Example 2b: SPY bull (fully auto) ###\n")

try:
    setup2b = build_setup_from_yahoo(
        symbol="SPY",
        direction="bull",
    )

    result2b = run_scan(setup2b)
    print(f"SPY bull setup (100% auto-detected):")
    print_report(result2b)
    log_scan(result2b)

except Exception as e:
    print(f"SPY auto-scan failed: {e}\n")
