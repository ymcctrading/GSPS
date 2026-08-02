"""
earnings_live.py
----------------
TIER 2: Live earnings data integration (Yahoo Finance backend).

This module provides a contract for fetching live earnings dates. The actual
Yahoo Finance fetching and Supabase caching is implemented in TypeScript
(lib/macro/earnings-live.ts) and exposed via API route.

This Python module is a placeholder that shows how gates.py can check live
earnings data when available, with automatic fallback to upstream data.

Usage in gates.py:
    days_to_earnings = get_trading_days_to_earnings(symbol)
    if days_to_earnings is None:
        return False, "Earnings data unavailable — failing closed."
"""

from datetime import datetime, timedelta
from typing import Optional


def get_earnings_from_cache(symbol: str) -> Optional[str]:
    """
    Fetch earnings date from cache (populated by TypeScript/Supabase).

    In production, this would:
    1. Call GSPS backend API: GET /api/learning/earnings-cache?symbol=XYZ
    2. Return: "2026-08-15" if cached, None if not found

    For now, this is a stub. Real implementation in lib/macro/earnings-live.ts
    and app/api/macro/earnings/route.ts.

    Returns: earnings date as YYYY-MM-DD string, or None if unavailable
    """
    # TODO: Implement HTTP call to /api/learning/earnings-cache
    # Example:
    # response = requests.get(f"http://localhost:3000/api/learning/earnings-cache?symbol={symbol}")
    # if response.status_code == 200:
    #     data = response.json()
    #     return data.get("date")  # "2026-08-15"
    # return None

    return None  # Placeholder


def calculate_trading_days_to_earnings(earnings_date_str: str) -> int:
    """
    Calculate trading days (M-F) from today to earnings date.

    Args:
        earnings_date_str: "YYYY-MM-DD" format

    Returns:
        Number of trading days until earnings (negative if in the past)
    """
    today = datetime.now().date()
    earnings_date = datetime.fromisoformat(earnings_date_str).date()

    trading_days = 0
    current = today
    direction = 1 if earnings_date > today else -1

    while current != earnings_date:
        current += timedelta(days=direction)
        # Count only weekdays (M-F, not Sat/Sun)
        if current.weekday() < 5:
            trading_days += direction

    return trading_days


def get_trading_days_to_earnings(symbol: str) -> Optional[int]:
    """
    Unified interface: fetch live earnings date, calculate trading days.

    Returns:
        Number of trading days to earnings, or None if data unavailable
    """
    # Try live cache first (Tier 2)
    live_date = get_earnings_from_cache(symbol)
    if live_date:
        return calculate_trading_days_to_earnings(live_date)

    # Fallback: return None (upstream gates.py will use fail-closed logic)
    return None
