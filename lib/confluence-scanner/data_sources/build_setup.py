"""
data_sources/build_setup.py
-----------------------------
Fetches everything Yahoo Finance can tell us and computes every
indicator-derived field the scanner needs, returning a mostly-filled
SetupInput. Fields this module CANNOT know — your Gann fan / Square of 9
/ Fibonacci distances, Strat pattern state, and stop/TP levels — are
passed in as parameters, since those come from your own proprietary
method, not from a public data feed.

Usage:
    from data_sources.build_setup import build_setup_from_yahoo

    setup = build_setup_from_yahoo(
        symbol="AAPL",
        direction="bear",
        dist_pct_gann_fan=0.34,
        dist_pct_square_of_9=0.28,
        dist_pct_historical_sr=0.10,
        dist_pct_fibonacci=0.55,
        strat_pattern_armed=True,
        stop_distance_pct=0.9,
        tp1_r_multiple=2.0,
    )

Any field you don't pass in stays None and will show up in the report as
"insufficient data" rather than silently defaulting to pass/fail — same
fail-closed philosophy as the rest of this package.
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
    # --- proprietary inputs you must supply, this module can't compute these ---
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
        trading_days_to_next_earnings = round((earnings_dt - now).days * 5 / 7)  # rough trading-day approx

    adx_daily = _safe(ind.adx, daily["high"], daily["low"], daily["close"]) if daily else None

    # --- trend ---
    hourly_trend_aligned = _hourly_trend_aligned(symbol, direction)
    adx_entry_tf = adx_daily  # using daily as the entry timeframe proxy; swap for your actual entry TF if different

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
            relative_strength = not relative_strength  # bear setups want UNDERperformance

    # --- environment ---
    atr_pct = ind.atr_percentile(daily["high"], daily["low"], daily["close"]) if daily else None

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
        rsi_divergence_present=None,  # not auto-computed; divergence detection is subjective enough
                                       # that it's left for manual review or a future dedicated function

        relative_volume_ratio=relative_volume_ratio,
        relative_strength_vs_benchmark=relative_strength,

        atr_percentile_6mo=atr_pct,

        strat_pattern_armed=strat_pattern_armed,
        stop_distance_pct=stop_distance_pct,
        tp1_r_multiple=tp1_r_multiple,

        notes=notes,
    )
