"""
gates.py
--------
Hard pass/fail gates. If any gate fails, the setup is rejected before
scoring runs at all — no partial credit for a great-looking setup on an
illiquid name about to report earnings.

Rule of thumb baked in here: missing data on a *risk* gate (earnings,
liquidity, regime) FAILS the gate. Missing data does not mean "safe."
This directly fixes the original checklist's silent bug where an
unavailable earnings calendar awarded zero points but didn't block the
trade.

TIER 1 FIX: Trend regime gate expanded to 15-45 (was 15-40) to allow
more setups with strong but not-yet-unsustainable momentum to be scored.
Scoring rewards the sweet spot (18-32), but gate allows wider band.

TIER 2 FIX: Earnings blackout expanded to 5 days (was 3) to account for
IV expansion and earnings-week volatility effects.
"""

from datetime import datetime
from schema import SetupInput
from config import CONFIG

# Tier 2: Try to import live earnings fetcher from Yahoo Finance (optional)
try:
    from data_sources.yahoo_client import fetch_earnings_date
    LIVE_EARNINGS_AVAILABLE = True
except ImportError:
    LIVE_EARNINGS_AVAILABLE = False
    fetch_earnings_date = None


def _trading_days_to_earnings_timestamp(earnings_unix: int) -> int:
    """Convert earnings unix timestamp to trading days from now (rough 5/7 approximation)."""
    if earnings_unix is None:
        return None
    earnings_dt = datetime.fromtimestamp(earnings_unix)
    now = datetime.now()
    calendar_days = (earnings_dt - now).days
    if calendar_days < 0:
        return 0
    return round(calendar_days * 5 / 7)


def check_macro_trend_gate(setup: SetupInput) -> tuple[bool, str]:
    if setup.macro_trend_aligned is None:
        return False, "Macro trend data unavailable — fail closed."
    if setup.macro_trend_aligned:
        return True, "Macro timeframes (10y/5y/1y) not extended against setup direction."
    return False, "Macro trend is extended against the setup direction."


def check_liquidity_gate(setup: SetupInput) -> tuple[bool, str]:
    g = CONFIG["gates"]
    if setup.avg_daily_volume is None or setup.bid_ask_spread_pct is None:
        return False, "Liquidity data unavailable — fail closed."
    vol_ok = setup.avg_daily_volume >= g["min_avg_daily_volume"]
    spread_ok = setup.bid_ask_spread_pct <= g["max_bid_ask_spread_pct"]
    if vol_ok and spread_ok:
        return True, f"ADV {setup.avg_daily_volume:,.0f} and spread {setup.bid_ask_spread_pct:.2f}% both within tolerance."
    reasons = []
    if not vol_ok:
        reasons.append(f"ADV {setup.avg_daily_volume:,.0f} below minimum {g['min_avg_daily_volume']:,}")
    if not spread_ok:
        reasons.append(f"spread {setup.bid_ask_spread_pct:.2f}% exceeds max {g['max_bid_ask_spread_pct']}%")
    return False, "; ".join(reasons)


def check_earnings_gate(setup: SetupInput) -> tuple[bool, str]:
    g = CONFIG["gates"]

    # TIER 2: Try live earnings data first (from Yahoo Finance)
    days_to_earnings = None
    live_source = False
    if LIVE_EARNINGS_AVAILABLE and fetch_earnings_date:
        try:
            earnings_data = fetch_earnings_date(setup.symbol)
            if earnings_data and earnings_data.get("earnings_timestamp"):
                days_to_earnings = _trading_days_to_earnings_timestamp(earnings_data["earnings_timestamp"])
                live_source = True
        except Exception:
            pass  # Fall back to upstream data

    # Fall back to upstream data if live unavailable
    if days_to_earnings is None:
        days_to_earnings = setup.trading_days_to_next_earnings

    if days_to_earnings is None:
        if g["fail_closed_on_missing_earnings_data"]:
            return False, "Earnings calendar unavailable — failing closed (was a silent zero in the old checklist)."
        return True, "Earnings calendar unavailable — configured to pass open (not recommended)."

    if abs(days_to_earnings) <= g["earnings_blackout_days"]:
        source_label = " (live from Yahoo)" if live_source else ""
        return False, f"Inside earnings blackout window ({days_to_earnings} trading days out{source_label})."
    return True, f"{days_to_earnings} trading days to next earnings — outside blackout window."


def check_trend_regime_gate(setup: SetupInput) -> tuple[bool, str]:
    """
    TIER 1 FIX: Expanded ADX max to 45 (from 40).

    Protects the whole system: everything downstream assumes you're
    fading/playing a level in a rotational regime, not standing in front
    of a freight-train trend. Too-low ADX (dead chop) is also excluded
    since there's no real energy behind any move.

    Gate band: 15-45 (allow slightly stronger trends)
    Scoring sweet spot: 18-32 (rewards optimal ADX range)
    """
    g = CONFIG["gates"]
    if setup.adx_daily is None:
        return False, "Daily ADX unavailable — fail closed."
    lo, hi = g["trend_regime_adx_min"], g["trend_regime_adx_max"]
    if lo <= setup.adx_daily <= hi:
        return True, f"Daily ADX {setup.adx_daily:.1f} within tradeable regime band ({lo}-{hi})."
    if setup.adx_daily > hi:
        return False, f"Daily ADX {setup.adx_daily:.1f} too strongly trending to fade (>{hi})."
    return False, f"Daily ADX {setup.adx_daily:.1f} too low — dead chop, no energy behind the level (<{lo})."


ALL_GATES = [
    ("macro_trend_alignment", check_macro_trend_gate),
    ("liquidity", check_liquidity_gate),
    ("earnings_event_risk", check_earnings_gate),
    ("trend_regime", check_trend_regime_gate),
]


def run_gates(setup: SetupInput) -> tuple[bool, list[dict]]:
    """Runs all gates. Returns (all_passed, list of {name, passed, rationale})."""
    results = []
    all_passed = True
    for name, fn in ALL_GATES:
        passed, rationale = fn(setup)
        results.append({"name": name, "passed": passed, "rationale": rationale})
        if not passed:
            all_passed = False
    return all_passed, results
