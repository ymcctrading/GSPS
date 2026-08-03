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


# --- AUTO-DETECTION FUNCTIONS (full automation) ---

def detect_support_resistance(highs: list, lows: list, closes: list,
                              tolerance_pct: float = 0.5) -> Optional[list]:
    """
    Scan 1y daily data for support/resistance levels. Returns list of
    (level, touch_count, is_support) tuples, sorted by significance.
    Touches on larger timeframes weighted more (intra-month vs intra-week).
    """
    if len(closes) < 20:
        return None

    # Find local minima and maxima
    levels = {}  # price_level -> (touch_count, is_support_bool)
    for i in range(1, len(closes) - 1):
        # Local low (support)
        if lows[i] < lows[i-1] and lows[i] < lows[i+1]:
            level = round(lows[i], 2)
            key = level
            if key not in levels:
                levels[key] = {"touches": 0, "is_support": True}
            levels[key]["touches"] += 1
        # Local high (resistance)
        if highs[i] > highs[i-1] and highs[i] > highs[i+1]:
            level = round(highs[i], 2)
            key = level
            if key not in levels:
                levels[key] = {"touches": 0, "is_support": False}
            levels[key]["touches"] += 1

    # Filter by touches (>= 2 touches = significant), sort by touch count
    significant = [(lvl, data["touches"], data["is_support"])
                   for lvl, data in levels.items() if data["touches"] >= 2]
    significant.sort(key=lambda x: x[1], reverse=True)
    return significant[:5] if significant else None


def detect_fibonacci(highs: list, lows: list, lookback: int = 63) -> Optional[list]:
    """
    Auto-Fibonacci from recent swing high/low (~3 months of daily data).
    Returns list of (fib_level, price) tuples.
    """
    if len(highs) < lookback:
        return None

    window = highs[-lookback:], lows[-lookback:]
    swing_high = max(window[0])
    swing_low = min(window[1])

    if swing_high == swing_low:
        return None

    levels = []
    ratios = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
    for ratio in ratios:
        level = swing_low + (swing_high - swing_low) * ratio
        levels.append((ratio, round(level, 2)))

    return levels


def detect_gann_levels(price: float) -> Optional[list]:
    """
    Gann approximation: square root grid (√price ± increments, squared back).
    Returns list of (label, level) tuples around current price.
    """
    import math
    if price <= 0:
        return None

    sqrt_price = math.sqrt(price)
    levels = []

    for i in range(-3, 4):
        adjusted_sqrt = sqrt_price + i * 0.25  # 0.25 = angle increment approximation
        gann_level = adjusted_sqrt ** 2
        if gann_level > 0:
            levels.append((f"Gann({i:+d})", round(gann_level, 2)))

    return levels


def detect_sq9_levels(price: float) -> Optional[list]:
    """
    Square of 9: standard algorithm. Calculate odd/even number grid.
    Returns list of (label, level) tuples.
    """
    import math
    if price <= 0:
        return None

    sqrt_price = math.sqrt(price)
    levels = []

    # Nearby odd numbers
    for i in range(-3, 4):
        # Find nearest odd number, then add offset
        odd = int(sqrt_price) + i * 2
        sq9_level = odd ** 2
        if sq9_level > 0:
            levels.append((f"Sq9({i:+d})", round(sq9_level, 2)))

    return levels


def detect_pattern_armed(macd_line: Optional[float], macd_signal: Optional[float],
                         rsi_val: Optional[float], relative_vol: Optional[float],
                         direction: str) -> Optional[bool]:
    """
    Pattern proxy: MACD aligned + RSI in reversal zone + volume impulse.
    Returns True if pattern "armed," None if insufficient data.
    """
    if macd_line is None or macd_signal is None or rsi_val is None or relative_vol is None:
        return None

    # MACD alignment with direction
    macd_aligned = (macd_line > macd_signal) if direction == "bull" else (macd_line < macd_signal)

    # RSI in reversal zone (< 35 for bull, > 65 for bear)
    rsi_aligned = (rsi_val < 35) if direction == "bull" else (rsi_val > 65)

    # Volume impulse (>= 1.5x)
    vol_strong = relative_vol >= 1.5

    return macd_aligned and rsi_aligned and vol_strong


def detect_stops_atr_based(highs: list, lows: list, closes: list,
                           atr_pct: Optional[float], direction: str) -> Optional[float]:
    """
    ATR-based stop distance. For bull: 1 ATR below recent low.
    For bear: 1 ATR above recent high. Returns distance as % of price.
    """
    if len(closes) < 20 or atr_pct is None:
        return None

    current_price = closes[-1]
    atr_val = atr_series(highs, lows, closes)[-1]
    if atr_val is None:
        return None

    recent_low = min(lows[-20:])
    recent_high = max(highs[-20:])

    if direction == "bull":
        stop_price = recent_low - atr_val
    else:
        stop_price = recent_high + atr_val

    if direction == "bull":
        if stop_price < current_price:
            return ((current_price - stop_price) / current_price) * 100
    else:
        if stop_price > current_price:
            return ((stop_price - current_price) / current_price) * 100

    return None


def detect_rsi_divergence(highs: list, lows: list, closes: list,
                          direction: str, bars_back: int = 5) -> Optional[bool]:
    """
    Simple heuristic: price makes new high/low (last N bars) but RSI doesn't confirm.
    Returns True if divergence detected, False if no divergence, None if insufficient data.
    """
    if len(closes) < bars_back + 1:
        return None

    rsi_val = rsi(closes)
    if rsi_val is None:
        return None

    recent_closes = closes[-bars_back:]
    recent_highs = highs[-bars_back:]
    recent_lows = lows[-bars_back:]

    if direction == "bull":
        # Price new high but RSI not new high
        price_new_high = max(recent_highs) > max(closes[-(bars_back+10):-bars_back])
        rsi_new_high = rsi_val > 70  # overbought would normally confirm
        return price_new_high and not rsi_new_high
    else:
        # Price new low but RSI not new low
        price_new_low = min(recent_lows) < min(closes[-(bars_back+10):-bars_back])
        rsi_new_low = rsi_val < 30  # oversold would normally confirm
        return price_new_low and not rsi_new_low


def find_nearest_confluence(price: float, levels: dict) -> tuple[Optional[float], Optional[float]]:
    """
    From auto-detected levels (S/R, Fib, Gann, Sq9), find nearest confluence zone.
    Returns (distance_pct, nearest_level) or (None, None) if no levels provided.
    """
    all_levels = []
    for level_type, level_list in levels.items():
        if level_list:
            all_levels.extend(level_list if isinstance(level_list[0], (int, float)) else [l[1] for l in level_list])

    if not all_levels:
        return None, None

    nearest = min(all_levels, key=lambda x: abs(x - price))
    dist_pct = abs(nearest - price) / price * 100
    return dist_pct, nearest
