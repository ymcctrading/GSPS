"""
scoring.py
----------
Scores a setup that has already cleared all gates. Grouped into the six
categories from the design: Structure, Trend, Momentum, Participation,
Environment, Execution.

Key design choice: the four "is price at a level" systems (Gann fan,
Square of 9, historical S/R, Fibonacci) are NOT summed as independent
10/10/10/6-point line items. They're counted as hits against tolerance,
then mapped through a diminishing-returns curve (config.py) so four
overlapping descriptions of the same price level can't masquerade as
four independent confirmations.

TIER 1 FIXES:
- Fix A: Risk-reward sliding scale (<1.2R = 0pts, partial credit for 1.2-2.0R)
- Fix B: Volatility-adjusted stop distance (scales with ATR percentile)
- NEW: Early-stage momentum opportunity (catches divergent moves early)
"""

from schema import SetupInput, FactorResult
from config import CONFIG


def _missing(name: str, category: str, points_possible: float) -> FactorResult:
    return FactorResult(
        name=name, category=category, points_awarded=0, points_possible=points_possible,
        passed=None, rationale="Insufficient data — scored as 0, flagged for review.",
    )


# ---------------------------------------------------------------------
# Structure cluster (Gann / Sq9 / S-R / Fib) — diminishing returns
# ---------------------------------------------------------------------
def score_structure_cluster(setup: SetupInput) -> FactorResult:
    cfg = CONFIG["structure_cluster"]
    tol = cfg["tolerance_pct"]
    checks = {
        "gann_fan": setup.dist_pct_gann_fan,
        "square_of_9": setup.dist_pct_square_of_9,
        "historical_sr": setup.dist_pct_historical_sr,
        "fibonacci": setup.dist_pct_fibonacci,
    }
    fired = []
    missing = []
    for key, dist in checks.items():
        if dist is None:
            missing.append(key)
            continue
        if abs(dist) <= tol[key]:
            fired.append(key)

    hits = len(fired)
    points = cfg["diminishing_points"].get(hits, 0)
    max_points = cfg["max_points"]

    if hits == 0 and len(missing) == len(checks):
        return _missing("structure_confluence", "structure", max_points)

    rationale = (
        f"{hits}/4 level systems in confluence "
        f"({', '.join(fired) if fired else 'none'}); "
        f"{max_points - points if hits < 4 else 0} pts left on the diminishing curve. "
        + (f"[no data: {', '.join(missing)}]" if missing else "")
    )
    return FactorResult(
        name="structure_confluence", category="structure",
        points_awarded=points, points_possible=max_points,
        passed=hits > 0, rationale=rationale,
    )


# ---------------------------------------------------------------------
# Trend
# ---------------------------------------------------------------------
def score_hourly_trend_agreement(setup: SetupInput) -> FactorResult:
    pts = CONFIG["scored_factors"]["trend"]["hourly_trend_agreement"]["points"]
    if setup.hourly_trend_aligned is None:
        return _missing("hourly_trend_agreement", "trend", pts)
    awarded = pts if setup.hourly_trend_aligned else 0
    verb = "confirms" if setup.hourly_trend_aligned else "disagrees with"
    return FactorResult(
        name="hourly_trend_agreement", category="trend",
        points_awarded=awarded, points_possible=pts, passed=setup.hourly_trend_aligned,
        rationale=f"1-hour structure {verb} {setup.direction} bias.",
    )


def score_trend_strength(setup: SetupInput) -> FactorResult:
    pts = CONFIG["scored_factors"]["trend"]["trend_strength"]["points"]
    if setup.adx_entry_tf is None:
        return _missing("trend_strength", "trend", pts)
    lo, hi = CONFIG["bands"]["healthy_adx_range"]
    in_band = lo <= setup.adx_entry_tf <= hi
    return FactorResult(
        name="trend_strength", category="trend",
        points_awarded=pts if in_band else 0, points_possible=pts, passed=in_band,
        rationale=f"Entry-TF ADX {setup.adx_entry_tf:.1f} {'within' if in_band else 'outside'} healthy band ({lo}-{hi}).",
    )


# ---------------------------------------------------------------------
# Momentum
# ---------------------------------------------------------------------
def score_macd_alignment(setup: SetupInput) -> FactorResult:
    pts = CONFIG["scored_factors"]["momentum"]["macd_alignment"]["points"]
    if setup.macd_line is None or setup.macd_signal is None or setup.macd_histogram_rising is None:
        return _missing("macd_alignment", "momentum", pts)
    side_ok = (setup.macd_line > setup.macd_signal) if setup.direction == "bull" else (setup.macd_line < setup.macd_signal)
    aligned = side_ok and setup.macd_histogram_rising
    return FactorResult(
        name="macd_alignment", category="momentum",
        points_awarded=pts if aligned else 0, points_possible=pts, passed=aligned,
        rationale=f"MACD {'above' if setup.macd_line > setup.macd_signal else 'below'} signal, "
                  f"histogram {'improving' if setup.macd_histogram_rising else 'weakening'} "
                  f"({'aligned' if aligned else 'not aligned'} with {setup.direction} bias).",
    )


def score_rsi_regime(setup: SetupInput) -> FactorResult:
    pts = CONFIG["scored_factors"]["momentum"]["rsi_regime"]["points"]
    if setup.rsi is None:
        return _missing("rsi_regime", "momentum", pts)
    b = CONFIG["bands"]
    if setup.direction == "bull":
        passed = setup.rsi > b["rsi_bull_min"]
    else:
        passed = setup.rsi < b["rsi_bear_max"]
    extra = ""
    if setup.rsi >= b["rsi_overbought"] or setup.rsi <= b["rsi_oversold"]:
        extra = " (extreme reading — treat with extra caution / context-dependent)"
    return FactorResult(
        name="rsi_regime", category="momentum",
        points_awarded=pts if passed else 0, points_possible=pts, passed=passed,
        rationale=f"RSI {setup.rsi:.1f} {'supports' if passed else 'does not support'} {setup.direction} bias.{extra}",
    )


def score_rsi_divergence(setup: SetupInput) -> FactorResult:
    """
    NEW factor vs both source checklists. Divergence between price and
    RSI right at the level being tested is often a stronger reversal
    tell than proximity to the level itself.
    """
    pts = CONFIG["scored_factors"]["momentum"]["rsi_divergence"]["points"]
    if setup.rsi_divergence_present is None:
        return _missing("rsi_divergence", "momentum", pts)
    return FactorResult(
        name="rsi_divergence", category="momentum",
        points_awarded=pts if setup.rsi_divergence_present else 0, points_possible=pts,
        passed=setup.rsi_divergence_present,
        rationale=f"{'Divergence present' if setup.rsi_divergence_present else 'No divergence'} "
                  f"between price and RSI at the level in favor of {setup.direction} bias.",
    )


# ---------------------------------------------------------------------
# Participation
# ---------------------------------------------------------------------
def score_volume_impulse(setup: SetupInput) -> FactorResult:
    pts = CONFIG["scored_factors"]["participation"]["volume_impulse"]["points"]
    if setup.relative_volume_ratio is None:
        return _missing("volume_impulse", "participation", pts)
    min_ratio = CONFIG["bands"]["volume_impulse_min_ratio"]
    passed = setup.relative_volume_ratio >= min_ratio
    return FactorResult(
        name="volume_impulse", category="participation",
        points_awarded=pts if passed else 0, points_possible=pts, passed=passed,
        rationale=f"Trigger volume at {setup.relative_volume_ratio:.2f}x 20d avg "
                  f"({'meets' if passed else 'below'} {min_ratio}x threshold).",
    )


def score_relative_strength(setup: SetupInput) -> FactorResult:
    """NEW factor: is this move idiosyncratic or just beta vs the benchmark."""
    pts = CONFIG["scored_factors"]["participation"]["relative_strength_vs_benchmark"]["points"]
    if setup.relative_strength_vs_benchmark is None:
        return _missing("relative_strength_vs_benchmark", "participation", pts)
    return FactorResult(
        name="relative_strength_vs_benchmark", category="participation",
        points_awarded=pts if setup.relative_strength_vs_benchmark else 0, points_possible=pts,
        passed=setup.relative_strength_vs_benchmark,
        rationale=f"{'Outperforming' if setup.direction == 'bull' else 'Underperforming'} benchmark as expected "
                  f"for {setup.direction} bias: {setup.relative_strength_vs_benchmark}.",
    )


# ---------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------
def score_volatility_regime(setup: SetupInput) -> FactorResult:
    pts = CONFIG["scored_factors"]["environment"]["volatility_regime"]["points"]
    if setup.atr_percentile_6mo is None:
        return _missing("volatility_regime", "environment", pts)
    lo, hi = CONFIG["bands"]["atr_percentile_target"]
    passed = lo <= setup.atr_percentile_6mo <= hi
    return FactorResult(
        name="volatility_regime", category="environment",
        points_awarded=pts if passed else 0, points_possible=pts, passed=passed,
        rationale=f"6mo ATR percentile {setup.atr_percentile_6mo:.0f} "
                  f"{'within' if passed else 'outside'} target band ({lo}-{hi}).",
    )


# ---------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------
def score_strat_pattern_armed(setup: SetupInput) -> FactorResult:
    pts = CONFIG["scored_factors"]["execution"]["strat_pattern_armed"]["points"]
    if setup.strat_pattern_armed is None:
        return _missing("strat_pattern_armed", "execution", pts)
    return FactorResult(
        name="strat_pattern_armed", category="execution",
        points_awarded=pts if setup.strat_pattern_armed else 0, points_possible=pts,
        passed=setup.strat_pattern_armed,
        rationale=f"Strat trigger {'armed' if setup.strat_pattern_armed else 'not armed'} in {setup.direction} direction.",
    )


def score_invalidation_distance(setup: SetupInput) -> FactorResult:
    """
    TIER 1 FIX B: Volatility-adjusted stop distance scoring.
    Previous: fixed 0.5-2.0% band regardless of market conditions
    Now: scales stop band with ATR percentile to match real trading constraints
    """
    pts = CONFIG["scored_factors"]["execution"]["clean_invalidation_distance"]["points"]
    if setup.stop_distance_pct is None or setup.atr_percentile_6mo is None:
        return _missing("clean_invalidation_distance", "execution", pts)

    atr_pct = setup.atr_percentile_6mo
    stop = setup.stop_distance_pct
    bands = CONFIG["bands"]["invalidation_bands_by_volatility"]

    # Select band based on volatility regime
    if atr_pct >= 70:
        lo, hi = bands["high"]["min"], bands["high"]["max"]
        volatility_label = "high"
    elif atr_pct >= 30:
        lo, hi = bands["mid"]["min"], bands["mid"]["max"]
        volatility_label = "mid"
    else:
        lo, hi = bands["low"]["min"], bands["low"]["max"]
        volatility_label = "low"

    passed = lo <= stop <= hi
    return FactorResult(
        name="clean_invalidation_distance", category="execution",
        points_awarded=pts if passed else 0, points_possible=pts, passed=passed,
        rationale=f"Stop {stop:.2f}% ({'clean' if passed else 'outside'} band {lo}-{hi}% for {volatility_label}-vol regime, ATR {atr_pct:.0f}th percentile).",
    )


def score_risk_reward(setup: SetupInput) -> FactorResult:
    """
    TIER 1 FIX A: Risk-reward sliding scale.
    Previous: binary (2.0R+ = 8pts, else 0)
    Now: partial credit for setups with viable R-multiples (1.2R+ scores)

    Rationale: Trading data shows 1.5R+ setups are consistently profitable.
    Requiring 2.0R+ excludes good setups just because the current context
    doesn't offer max efficiency. This sliding scale rewards best execution
    but doesn't brick setups that are still viable.
    """
    pts = CONFIG["scored_factors"]["execution"]["risk_reward"]["points"]
    if setup.tp1_r_multiple is None:
        return _missing("risk_reward", "execution", pts)

    r = setup.tp1_r_multiple
    thresholds = CONFIG["bands"]["risk_reward_thresholds"]

    # Find the appropriate tier
    if r >= thresholds["excellent"]["min_r"]:
        awarded = thresholds["excellent"]["points"]
        tier_label = "excellent"
    elif r >= thresholds["strong"]["min_r"]:
        awarded = thresholds["strong"]["points"]
        tier_label = "strong"
    elif r >= thresholds["acceptable"]["min_r"]:
        awarded = thresholds["acceptable"]["points"]
        tier_label = "acceptable"
    elif r >= thresholds["marginal"]["min_r"]:
        awarded = thresholds["marginal"]["points"]
        tier_label = "marginal"
    else:
        awarded = 0.0
        tier_label = "below floor"

    passed = awarded > 0

    return FactorResult(
        name="risk_reward", category="execution",
        points_awarded=awarded, points_possible=pts, passed=passed,
        rationale=f"TP1 at {r:.2f}R — {tier_label} tier ({awarded:.0f}/{pts:.0f} pts). "
                  f"Floor is 1.2R, excellent at 2.0R+.",
    )


def score_early_stage_momentum_opportunity(setup: SetupInput) -> FactorResult:
    """
    NEW FACTOR: Detect when price is diverging from confluence levels
    early in the move, offering a momentum trade opportunity.

    Rationale: If a setup has strong structure confluence (Gann fan,
    Fibonacci, etc.) but price is 1.5-4.0% away from the next target,
    that's an opportunity to catch the move in its early stage before
    the full impulse completes. This is especially valuable if RSI hasn't
    yet reached extremes and ATR suggests volatility.

    Only awards points if:
    1. Next Gann/Fib target distance is in the 1.5-4.0% range
    2. RSI is not yet extreme (not late in the move)
    3. Volatility is present (ATR >= 40th percentile)
    """
    pts = CONFIG["scored_factors"]["execution"]["early_stage_momentum_opportunity"]["points"]

    # Need both distance metrics
    if setup.dist_pct_next_gann_target is None or setup.dist_pct_next_fib_target is None:
        return _missing("early_stage_momentum_opportunity", "execution", pts)

    # Need RSI and ATR to confirm early-stage conditions
    if setup.rsi is None or setup.atr_percentile_6mo is None:
        return _missing("early_stage_momentum_opportunity", "execution", pts)

    bands = CONFIG["bands"]
    dist_min, dist_max = bands["momentum_distance_min"], bands["momentum_distance_max"]
    atr_min = bands["momentum_atr_percentile_min"]

    # Average distance to next targets
    avg_dist = (abs(setup.dist_pct_next_gann_target) + abs(setup.dist_pct_next_fib_target)) / 2

    # RSI extremes (too late in the move)
    rsi_min_ext = bands["momentum_rsi_min_extreme"]  # ~25
    rsi_max_ext = bands["momentum_rsi_max_extreme"]  # ~75
    rsi_not_extreme = rsi_min_ext < setup.rsi < rsi_max_ext if setup.direction == "bear" else rsi_min_ext < setup.rsi < rsi_max_ext

    # Volatility present
    vol_adequate = setup.atr_percentile_6mo >= atr_min

    # Award if all conditions met
    distance_ok = dist_min <= avg_dist <= dist_max
    passed = distance_ok and rsi_not_extreme and vol_adequate

    if passed:
        rationale = (
            f"Early-stage momentum: {avg_dist:.2f}% from next target (ideal {dist_min}-{dist_max}%), "
            f"RSI {setup.rsi:.0f} not extreme, volatility {setup.atr_percentile_6mo:.0f}th percentile (>{atr_min}). "
            f"Opportunity to catch move in infancy."
        )
    else:
        reasons = []
        if not distance_ok:
            reasons.append(f"distance {avg_dist:.2f}% outside {dist_min}-{dist_max}% range")
        if not rsi_not_extreme:
            reasons.append(f"RSI {setup.rsi:.0f} may be too extreme (move likely advanced)")
        if not vol_adequate:
            reasons.append(f"volatility {setup.atr_percentile_6mo:.0f}th percentile below {atr_min}%")
        rationale = f"Momentum opportunity criteria not met: {'; '.join(reasons)}"

    return FactorResult(
        name="early_stage_momentum_opportunity", category="execution",
        points_awarded=pts if passed else 0, points_possible=pts, passed=passed,
        rationale=rationale,
    )


ALL_SCORERS = [
    score_structure_cluster,
    score_hourly_trend_agreement,
    score_trend_strength,
    score_macd_alignment,
    score_rsi_regime,
    score_rsi_divergence,
    score_volume_impulse,
    score_relative_strength,
    score_volatility_regime,
    score_strat_pattern_armed,
    score_invalidation_distance,
    score_risk_reward,
    score_early_stage_momentum_opportunity,
]


def run_scoring(setup: SetupInput) -> list[FactorResult]:
    return [fn(setup) for fn in ALL_SCORERS]
