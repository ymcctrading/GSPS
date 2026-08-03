"""
scanner.py
----------
Orchestrates gates.py + scoring.py into a single ScanResult. This is the
main entry point other code should call.

Usage:
    from scanner import run_scan
    result = run_scan(setup_input)
"""

from schema import SetupInput, ScanResult
from gates import run_gates
from scoring import run_scoring


def run_scan(setup: SetupInput) -> ScanResult:
    gates_passed, gate_results = run_gates(setup)

    result = ScanResult(
        symbol=setup.symbol,
        direction=setup.direction,
        gates_passed=gates_passed,
        gate_failures=[g for g in gate_results if not g["passed"]],
    )

    if not gates_passed:
        # Don't bother scoring a setup that's already disqualified —
        # keeps the report honest and avoids "high score, but actually
        # illiquid/pre-earnings" confusion downstream.
        return result

    factors = run_scoring(setup)
    result.factors = factors
    result.total_score = sum(f.points_awarded for f in factors)
    result.max_score = sum(f.points_possible for f in factors)
    result.score_pct = round(100 * result.total_score / result.max_score, 1) if result.max_score else 0.0
    return result


def print_report(result: ScanResult) -> None:
    print(f"\n{'='*60}\n{result.symbol} — {result.direction.upper()} setup\n{'='*60}")
    if not result.gates_passed:
        print("GATES: FAILED — setup rejected, not scored.\n")
        for g in result.gate_failures:
            print(f"  ✗ {g['name']}: {g['rationale']}")
        return

    print("GATES: all passed.\n")
    print(f"SCORE: {result.total_score:.1f} / {result.max_score:.1f}  ({result.score_pct}%)\n")

    by_category = {}
    for f in result.factors:
        by_category.setdefault(f.category, []).append(f)

    for category, factors in by_category.items():
        cat_total = sum(f.points_awarded for f in factors)
        cat_max = sum(f.points_possible for f in factors)
        print(f"-- {category.upper()} ({cat_total:.1f}/{cat_max:.1f}) --")
        for f in factors:
            flag = "?" if f.passed is None else ("✓" if f.passed else "✗")
            print(f"  {flag} {f.name}: {f.points_awarded:.1f}/{f.points_possible:.1f} — {f.rationale}")
        print()
