"""
data_sources/indicators.py
----------------------------
Standard technical indicator math on plain lists of floats. No numpy/pandas
— this is intentionally simple and auditable so you can verify it against
any reference implementation. All functions take/return plain Python
lists or floats.

Convention: input series are in chronological order (oldest first, most
recent last), matching what yahoo_client.fetch_chart returns.
"""

import statistics
from typing import Optional


def sma(values: list, period: int) -> Optional[float]:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def ema_series(values: list, period: int) -> list:
    """Full EMA series (same length as input, first `period-1` values are None)."""
    if len(values) < period:
        return [None] * len(values)
    k = 2 / (period + 1)
    out = [None] * (period - 1)
    seed = sum(values[:period]) / period
    out.append(seed)
    prev = seed
    for v in values[period:]:
        cur = v * k + prev * (1 - k)
        out.append(cur)
        prev = cur
    return out


def rsi(closes: list, period: int = 14) -> Optional[float]:
    """Wilder's RSI. Returns the latest value."""
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        change = closes[i] - closes[i - 1]
        gains.append(max(change, 0))
        losses.append(max(-change, 0))
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def macd(closes: list, fast: int = 12, slow: int = 26, signal: int = 9) -> dict:
    """
    Returns {'macd_line': float, 'signal_line': float,
             'histogram_prev': float, 'histogram_curr': float}
    or all-None dict if insufficient data.
    """
    if len(closes) < slow + signal:
        return {"macd_line": None, "signal_line": None, "histogram_prev": None, "histogram_curr": None}

    ema_fast = ema_series(closes, fast)
    ema_slow = ema_series(closes, slow)
    macd_vals = []
    for f, s in zip(ema_fast, ema_slow):
        if f is None or s is None:
            macd_vals.append(None)
        else:
            macd_vals.append(f - s)

    valid_macd = [v for v in macd_vals if v is not None]
    signal_vals = ema_series(valid_macd, signal)
    # pad signal_vals back to align with macd_vals length
    pad = len(macd_vals) - len(valid_macd)
    signal_full = [None] * pad + signal_vals

    histogram = []
    for m, s in zip(macd_vals, signal_full):
        histogram.append(None if (m is None or s is None) else m - s)

    valid_hist = [h for h in histogram if h is not None]
    if len(valid_hist) < 2:
        return {"macd_line": macd_vals[-1], "signal_line": signal_full[-1],
                "histogram_prev": None, "histogram_curr": None}

    return {
        "macd_line": macd_vals[-1],
        "signal_line": signal_full[-1],
        "histogram_prev": valid_hist[-2],
        "histogram_curr": valid_hist[-1],
    }


def true_range_series(highs: list, lows: list, closes: list) -> list:
    tr = [highs[0] - lows[0]]
    for i in range(1, len(closes)):
        tr.append(max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        ))
    return tr


def atr_series(highs: list, lows: list, closes: list, period: int = 14) -> list:
    """Wilder-smoothed ATR series, same length as input (leading Nones)."""
    tr = true_range_series(highs, lows, closes)
    if len(tr) < period:
        return [None] * len(tr)
    out = [None] * (period - 1)
    seed = sum(tr[:period]) / period
    out.append(seed)
    prev = seed
    for v in tr[period:]:
        cur = (prev * (period - 1) + v) / period
        out.append(cur)
        prev = cur
    return out


def atr_percentile(highs: list, lows: list, closes: list, period: int = 14,
                    lookback: int = 126) -> Optional[float]:
    """
    Current ATR's percentile rank (0-100) within its own trailing
    `lookback` bars (~6 months of daily data by default).
    """
    series = atr_series(highs, lows, closes, period)
    valid = [v for v in series if v is not None]
    if len(valid) < 20:
        return None
    window = valid[-lookback:] if len(valid) >= lookback else valid
    current = valid[-1]
    rank = sum(1 for v in window if v <= current) / len(window) * 100
    return rank


def adx(highs: list, lows: list, closes: list, period: int = 14) -> Optional[float]:
    """Wilder's ADX. Returns the latest value, or None if insufficient data."""
    n = len(closes)
    if n < period * 2:
        return None

    plus_dm, minus_dm = [], []
    for i in range(1, n):
        up_move = highs[i] - highs[i - 1]
        down_move = lows[i - 1] - lows[i]
        plus_dm.append(up_move if (up_move > down_move and up_move > 0) else 0)
        minus_dm.append(down_move if (down_move > up_move and down_move > 0) else 0)

    tr = true_range_series(highs, lows, closes)[1:]  # align with dm arrays (drop first bar)

    def wilder_smooth(vals, period):
        out = []
        seed = sum(vals[:period])
        out.append(seed)
        prev = seed
        for v in vals[period:]:
            cur = prev - (prev / period) + v
            out.append(cur)
            prev = cur
        return out

    smoothed_tr = wilder_smooth(tr, period)
    smoothed_plus_dm = wilder_smooth(plus_dm, period)
    smoothed_minus_dm = wilder_smooth(minus_dm, period)

    dx_vals = []
    for tr_v, pdm, mdm in zip(smoothed_tr, smoothed_plus_dm, smoothed_minus_dm):
        if tr_v == 0:
            dx_vals.append(0)
            continue
        plus_di = 100 * pdm / tr_v
        minus_di = 100 * mdm / tr_v
        di_sum = plus_di + minus_di
        dx = 100 * abs(plus_di - minus_di) / di_sum if di_sum != 0 else 0
        dx_vals.append(dx)

    if len(dx_vals) < period:
        return None
    adx_val = sum(dx_vals[:period]) / period
    for v in dx_vals[period:]:
        adx_val = (adx_val * (period - 1) + v) / period
    return adx_val


def relative_volume(volumes: list, lookback: int = 20) -> Optional[float]:
    """Latest bar's volume vs the trailing `lookback`-bar average (excluding the latest bar)."""
    if len(volumes) < lookback + 1:
        return None
    baseline = volumes[-(lookback + 1):-1]
    avg = sum(baseline) / len(baseline)
    if avg == 0:
        return None
    return volumes[-1] / avg


def relative_strength_outperforming(symbol_closes: list, benchmark_closes: list,
                                     lookback: int = 20) -> Optional[bool]:
    """
    True if the symbol's return over `lookback` bars beat the benchmark's
    return over the same window — a simple relative-strength check.
    """
    if len(symbol_closes) < lookback + 1 or len(benchmark_closes) < lookback + 1:
        return None
    sym_ret = symbol_closes[-1] / symbol_closes[-(lookback + 1)] - 1
    bench_ret = benchmark_closes[-1] / benchmark_closes[-(lookback + 1)] - 1
    return sym_ret > bench_ret


def macro_zscore(closes: list) -> Optional[float]:
    """
    Z-score of the latest close vs the mean/stdev of the full series
    provided. Used to flag "extended" long-term readings — feed this a
    monthly series over 10y/5y/1y windows from the caller.
    """
    if len(closes) < 12:
        return None
    mean = statistics.mean(closes)
    stdev = statistics.pstdev(closes)
    if stdev == 0:
        return None
    return (closes[-1] - mean) / stdev
