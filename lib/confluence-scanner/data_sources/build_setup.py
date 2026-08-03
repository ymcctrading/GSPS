"""
data_sources/build_setup.py
-----------------------------
FULLY AUTOMATIC: Fetches everything from Yahoo Finance and auto-detects all
structure levels, pattern state, stops, and TP multiples. No manual inputs needed.

Usage:
    from data_sources.build_setup import build_setup_from_yahoo

    setup = build_setup_from_yahoo(
        symbol="AAPL",
        direction="bear",
    )

All fields are auto-computed:
- Structure levels: S/R, Fibonacci, Gann, Sq9 (via auto-detection)
- Pattern: MACD + RSI + volume proxy
- Stops: ATR-based with vol scaling
- TP: Derived from confluence level
- RSI divergence: Heuristic detection

Optional override parameters available for testing/manual override:
- dist_pct_gann_fan, dist_pct_square_of_9, dist_pct_historical_sr, dist_pct_fibonacci
- strat_pattern_armed, stop_distance_pct, tp1_r_multiple
If provided, these override auto-detection for that field.
"""

import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # allow `from schema import ...`

from schema import SetupInput
from data_sources import yahoo_client as yc
from data_sources import indicators as ind


def _safe(fn, *args, **kwargs):
    """Run a fetch/compute step; on failure, return None instead of raising,
    so one flaky endpoint doesn't kill the whole build. The caller sees a
    None field, which the gates/scoring treat as 'insufficient data'."""
    try:
        return fn(*args, **kwargs)
    except Exception:
        return None


def _macro_trend_aligned(symbol: str, direction: str) -> Optional[bool]:
    """
    Checks 10y/5y/1y monthly closes for z-score extension against the
    setup direction. Not aligned if any window shows the price more than
    2 standard deviations stretched in the direction that would make a
    NEW position in `direction` risky (e.g. buying something already
    2+ sigma above its 10y mean).
    """
    windows = {"10y": "10y", "5y": "5y", "1y": "1y"}
    for label, range_ in windows.items():
        chart = _safe(yc.fetch_chart, symbol, range_, "1mo")
        if not chart or len(chart["close"]) < 6:
            return None  # missing data -> caller/gate will fail closed
        z = ind.macro_zscore(chart["close"])
        if z is None:
            continue
        if direction == "bull" and z > 2.0:
            return False
        if direction == "bear" and z < -2.0:
            return False
    return True


def _hourly_trend_aligned(symbol: str, direction: str) -> Optional[bool]:
    chart = _safe(yc.fetch_chart, symbol, "5d", "60m")
    if not chart or len(chart["close"]) < 21:
        return None
    ema20 = ind.ema_series(chart["close"], 20)
    last_close = chart["close"][-1]
    last_ema = ema20[-1]
    if last_ema is None:
        return None
    return last_close > last_ema if direction == "bull" else last_close < last_ema


def build_setup_from_yahoo(
    symbol: str,
    direction: str,
    benchmark: str = "SPY",
    *,
    # --- optional overrides (auto-detection used if not provided) ---
    dist_pct_gann_fan: Optional[float] = None,
    dist_pct_square_of_9: Optional[float] = None,
    dist_pct_historical_sr: Optional[float] = None,
    dist_pct_fibonacci: Optional[float] = None,
    strat_pattern_armed: Optional[bool] = None,
    stop_distance_pct: Optional[float] = None,
    tp1_r_multiple: Optional[float] = None,
    notes: str = "",
) -> SetupInput:

    daily = _safe(yc.fetch_chart, symbol, "1y", "1d")
    quote = _safe(yc.fetch_quote, symbol)
    earnings = _safe(yc.fetch_earnings_date, symbol)
    bench_daily = _safe(yc.fetch_chart, benchmark, "6mo", "1d")

    price = daily["close"][-1] if daily else (quote.get("regularMarketPrice") if quote else None)

    # --- gates ---
    macro_trend_aligned = _macro_trend_aligned(symbol, direction)

    avg_daily_volume = None
    bid_ask_spread_pct = None
    if quote:
        avg_daily_volume = quote.get("averageDailyVolume10Day") or quote.get("averageDailyVolume3Month")
        bid, ask = quote.get("bid"), quote.get("ask")
        if bid and ask and bid > 0:
            bid_ask_spread_pct = (ask - bid) / bid * 100

    trading_days_to_next_earnings = None
    if earnings and earnings.get("earnings_timestamp"):
        earnings_dt = datetime.fromtimestamp(earnings["earnings_timestamp"], tz=timezone.utc)
        now = datetime.now(timezone.utc)
        trading_days_to_next_earnings = round((earnings_dt - now).days * 5 / 7)

    adx_daily = _safe(ind.adx, daily["high"], daily["low"], daily["close"]) if daily else None

    # --- trend ---
    hourly_trend_aligned = _hourly_trend_aligned(symbol, direction)
    adx_entry_tf = adx_daily

    # --- momentum ---
    macd_result = ind.macd(daily["close"]) if daily else {"macd_line": None, "signal_line": None,
                                                            "histogram_prev": None, "histogram_curr": None}
    rsi_val = ind.rsi(daily["close"]) if daily else None

    # --- participation ---
    relative_volume_ratio = ind.relative_volume(daily["volume"]) if daily else None
    relative_strength = None
    if daily and bench_daily:
        relative_strength = ind.relative_strength_outperforming(daily["close"], bench_daily["close"])
        if relative_strength is not None and direction == "bear":
            relative_strength = not relative_strength

    # --- environment ---
    atr_pct = ind.atr_percentile(daily["high"], daily["low"], daily["close"]) if daily else None

    # --- AUTO-DETECTION: Structure levels ---
    auto_sr = _safe(ind.detect_support_resistance, daily["high"], daily["low"], daily["close"]) if daily else None
    auto_fib = _safe(ind.detect_fibonacci, daily["high"], daily["low"]) if daily else None
    auto_gann = _safe(ind.detect_gann_levels, price) if price else None
    auto_sq9 = _safe(ind.detect_sq9_levels, price) if price else None

    # Find nearest confluence distance for each system
    if dist_pct_gann_fan is None and auto_gann:
        gann_prices = [lvl[1] for lvl in auto_gann]
        dist_pct_gann_fan = min(abs(price - lvl) / price * 100 for lvl in gann_prices) if gann_prices else None

    if dist_pct_square_of_9 is None and auto_sq9:
        sq9_prices = [lvl[1] for lvl in auto_sq9]
        dist_pct_square_of_9 = min(abs(price - lvl) / price * 100 for lvl in sq9_prices) if sq9_prices else None

    if dist_pct_historical_sr is None and auto_sr:
        sr_prices = [lvl[0] for lvl in auto_sr]  # (price, touch_count, is_support)
        dist_pct_historical_sr = min(abs(price - lvl) / price * 100 for lvl in sr_prices) if sr_prices else None

    if dist_pct_fibonacci is None and auto_fib:
        fib_prices = [lvl[1] for lvl in auto_fib]
        dist_pct_fibonacci = min(abs(price - lvl) / price * 100 for lvl in fib_prices) if fib_prices else None

    # --- AUTO-DETECTION: Pattern ---
    if strat_pattern_armed is None:
        strat_pattern_armed = _safe(ind.detect_pattern_armed, macd_result["macd_line"],
                                     macd_result["signal_line"], rsi_val, relative_volume_ratio, direction)

    # --- AUTO-DETECTION: Stops ---
    if stop_distance_pct is None:
        stop_distance_pct = _safe(ind.detect_stops_atr_based, daily["high"], daily["low"],
                                   daily["close"], atr_pct, direction) if daily else None

    # --- AUTO-DETECTION: RSI Divergence ---
    rsi_divergence = _safe(ind.detect_rsi_divergence, daily["high"], daily["low"],
                            daily["close"], direction) if daily else None

    # --- AUTO-DERIVATION: TP1 R-multiple (default to 2.0 if stops available) ---
    if tp1_r_multiple is None and stop_distance_pct is not None:
        tp1_r_multiple = 2.0  # Default: conservative but achievable

    return SetupInput(
        symbol=symbol,
        direction=direction,
        price=price if price is not None else 0.0,

        macro_trend_aligned=macro_trend_aligned,
        avg_daily_volume=avg_daily_volume,
        bid_ask_spread_pct=bid_ask_spread_pct,
        trading_days_to_next_earnings=trading_days_to_next_earnings,
        adx_daily=adx_daily,

        hourly_trend_aligned=hourly_trend_aligned,
        adx_entry_tf=adx_entry_tf,

        dist_pct_gann_fan=dist_pct_gann_fan,
        dist_pct_square_of_9=dist_pct_square_of_9,
        dist_pct_historical_sr=dist_pct_historical_sr,
        dist_pct_fibonacci=dist_pct_fibonacci,

        macd_line=macd_result["macd_line"],
        macd_signal=macd_result["signal_line"],
        macd_histogram_prev=macd_result["histogram_prev"],
        macd_histogram_curr=macd_result["histogram_curr"],
        rsi=rsi_val,
        rsi_divergence_present=rsi_divergence,

        relative_volume_ratio=relative_volume_ratio,
        relative_strength_vs_benchmark=relative_strength,

        atr_percentile_6mo=atr_pct,

        strat_pattern_armed=strat_pattern_armed,
        stop_distance_pct=stop_distance_pct,
        tp1_r_multiple=tp1_r_multiple,

        notes=notes,
    )
