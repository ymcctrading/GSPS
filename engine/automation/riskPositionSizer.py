"""
Leverage & position-sizing engine for futures / commodities (Python port).

    contracts = floor((equity * risk_pct) / (ATR * point_value))

bounded to [1, 5] as an institutional circuit-breaker on any single automated
path. risk_pct is driven by the user's risk_profile dial.
"""

import math
from enum import Enum
from typing import Dict


class RiskProfile(str, Enum):
    PASSIVE = "PASSIVE"
    MODERATE = "MODERATE"
    AGGRESSIVE = "AGGRESSIVE"


CONTRACT_MULTIPLIERS: Dict[str, float] = {
    "ES": 50.0,    # S&P 500 E-mini: $50 / point
    "NQ": 20.0,    # Nasdaq 100 E-mini: $20 / point
    "GC": 100.0,   # Gold: $100 / point
    "CL": 1000.0,  # Crude Oil: $1000 / point
}

RISK_ALLOCATIONS: Dict[RiskProfile, float] = {
    RiskProfile.PASSIVE: 0.01,
    RiskProfile.MODERATE: 0.02,
    RiskProfile.AGGRESSIVE: 0.04,
}

MAX_CONTRACTS = 5


def calculate_futures_lot_size(
    account_equity: float,
    risk_profile: RiskProfile,
    ticker: str,
    current_atr: float,
) -> int:
    """Dynamically bound contract size to protect account equity."""
    risk_pct = RISK_ALLOCATIONS.get(risk_profile, 0.02)
    multiplier = CONTRACT_MULTIPLIERS.get(ticker.upper(), 1.0)

    dollar_at_risk = account_equity * risk_pct
    risk_per_contract = current_atr * multiplier

    if risk_per_contract <= 0:
        return 0

    target = math.floor(dollar_at_risk / risk_per_contract)
    return min(max(target, 1), MAX_CONTRACTS)
