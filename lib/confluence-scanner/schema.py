"""
schema.py
---------
Defines the input contract for the scanner (SetupInput) and the output
report shape (ScanResult). Keeping this explicit means whatever upstream
system computes your indicators (Gann/Sq9 tool, RSI/MACD library, volume
feed, etc.) just needs to fill in this dataclass — the scanner itself
never fetches data or talks to a broker/API.

All fields are Optional so the scanner can flag "missing data" distinctly
from "condition not met" — this distinction matters most on gates.

CHANGES:
- Added dist_pct_next_gann_target and dist_pct_next_fib_target for momentum detection
"""

from dataclasses import dataclass, field
from typing import Optional, Literal

Direction = Literal["bull", "bear"]


@dataclass
class SetupInput:
    symbol: str
    direction: Direction
    price: float

    # --- Gate inputs ---
    macro_trend_aligned: Optional[bool] = None          # 10y/5y/1y not extended vs direction
    avg_daily_volume: Optional[float] = None
    bid_ask_spread_pct: Optional[float] = None
    trading_days_to_next_earnings: Optional[int] = None  # None = data unavailable
    adx_daily: Optional[float] = None                    # for trend-regime gate

    # --- Trend ---
    hourly_trend_aligned: Optional[bool] = None
    adx_entry_tf: Optional[float] = None                 # ADX on operative/entry timeframe

    # --- Structure cluster (distances as % from price to each level) ---
    dist_pct_gann_fan: Optional[float] = None
    dist_pct_square_of_9: Optional[float] = None
    dist_pct_historical_sr: Optional[float] = None
    dist_pct_fibonacci: Optional[float] = None

    # --- NEW: Momentum opportunity detection ---
    dist_pct_next_gann_target: Optional[float] = None   # % distance to NEXT Gann level (not current)
    dist_pct_next_fib_target: Optional[float] = None    # % distance to NEXT Fibonacci level

    # --- Momentum ---
    macd_line: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_histogram_prev: Optional[float] = None    # histogram value one bar back
    macd_histogram_curr: Optional[float] = None    # histogram value on the current/trigger bar
    # NOTE: histogram direction is computed FROM these two raw values inside
    # scoring.py, direction-aware (bull wants histogram rising toward/past
    # zero, bear wants it falling toward/past zero). Don't pre-orient a
    # boolean yourself — that was a footgun in the previous version.
    rsi: Optional[float] = None
    rsi_divergence_present: Optional[bool] = None  # True if price/RSI diverge in favor of setup

    # --- Participation ---
    relative_volume_ratio: Optional[float] = None  # trigger volume / 20d avg volume
    relative_strength_vs_benchmark: Optional[bool] = None  # outperforming/underperforming appropriately

    # --- Environment ---
    atr_percentile_6mo: Optional[float] = None  # 0-100

    # --- Execution ---
    strat_pattern_armed: Optional[bool] = None
    stop_distance_pct: Optional[float] = None
    tp1_r_multiple: Optional[float] = None

    # free-text notes captured at scan time, useful in the backtest log
    notes: str = ""


@dataclass
class FactorResult:
    name: str
    category: str
    points_awarded: float
    points_possible: float
    passed: Optional[bool]     # None = insufficient data
    rationale: str


@dataclass
class ScanResult:
    symbol: str
    direction: Direction
    gates_passed: bool
    gate_failures: list = field(default_factory=list)
    factors: list = field(default_factory=list)   # list[FactorResult]
    total_score: float = 0.0
    max_score: float = 0.0
    score_pct: float = 0.0
