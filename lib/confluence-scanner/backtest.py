"""
backtest.py
-----------
Reads the scan log (after you've filled in outcomes via logger.update_outcome)
and reports, per factor, how well it actually predicts wins vs losses.

This is deliberately dependency-free (no numpy/pandas/sklearn required) so
it runs anywhere. It computes:
  - win rate when a factor passed vs when it failed/was missing
  - a point-biserial-style correlation between "factor passed" (1/0) and
    "trade won" (1/0)
  - a simple suggested weight multiplier per factor (relative to current
    average predictive power), which you can feed back into config.py

Only entries with `gates_passed: true` and a non-null `outcome` in
{"win", "loss"} are used — scratches/no-trades are excluded from this pass
since they muddy win-rate math (you can extend this later).

Usage:
    python backtest.py [path/to/scan_log.jsonl]
"""

import sys
import statistics
from pathlib import Path
from collections import defaultdict

from logger import load_log


def run_backtest(log_path: Path):
    entries = load_log(log_path)
    usable = [e for e in entries if e["gates_passed"] and e["outcome"] in ("win", "loss")]

    if len(usable) < 10:
        print(f"Only {len(usable)} usable logged outcomes (win/loss with gates passed). "
              f"Need a meaningfully larger sample (aim for 30+) before trusting reweighting suggestions.")
        if not usable:
            return

    # Gather per-factor pass/fail vs outcome
    factor_data = defaultdict(list)  # factor_name -> list of (passed_bool_as_int, won_bool_as_int)
    for e in usable:
        won = 1 if e["outcome"] == "win" else 0
        for f in e["factors"]:
            if f["passed"] is None:
                continue  # skip missing-data points, don't let them count as fails
            factor_data[f["name"]].append((1 if f["passed"] else 0, won))

    print(f"\nBacktest over {len(usable)} logged setups ({sum(1 for e in usable if e['outcome']=='win')} wins, "
          f"{sum(1 for e in usable if e['outcome']=='loss')} losses)\n")
    print(f"{'Factor':<35}{'N':>5}{'WinRate(pass)':>15}{'WinRate(fail)':>15}{'Correlation':>13}")
    print("-" * 83)

    correlations = {}
    for name, pairs in sorted(factor_data.items()):
        n = len(pairs)
        if n < 5:
            print(f"{name:<35}{n:>5}   -- insufficient samples --")
            continue

        passed_wins = [w for p, w in pairs if p == 1]
        failed_wins = [w for p, w in pairs if p == 0]
        wr_pass = statistics.mean(passed_wins) if passed_wins else float("nan")
        wr_fail = statistics.mean(failed_wins) if failed_wins else float("nan")

        xs = [p for p, w in pairs]
        ys = [w for p, w in pairs]
        corr = _safe_correlation(xs, ys)
        correlations[name] = corr

        wr_pass_s = f"{wr_pass*100:.0f}%" if passed_wins else "n/a"
        wr_fail_s = f"{wr_fail*100:.0f}%" if failed_wins else "n/a"
        print(f"{name:<35}{n:>5}{wr_pass_s:>15}{wr_fail_s:>15}{corr:>13.2f}")

    print("\nSuggested relative reweighting (normalized so average factor = 1.00x):")
    print("Apply these as multipliers to the 'points' values in config.py — don't")
    print("swing on a single backtest run; watch the trend over successive batches.\n")
    valid_corrs = {k: v for k, v in correlations.items() if v == v}  # drop NaNs
    if valid_corrs:
        avg_corr = statistics.mean(abs(v) for v in valid_corrs.values())
        for name, corr in sorted(valid_corrs.items(), key=lambda kv: -abs(kv[1])):
            mult = (abs(corr) / avg_corr) if avg_corr > 0 else 1.0
            direction_note = "" if corr >= 0 else "  [inverse! failing this factor predicted WINS — investigate]"
            print(f"  {name:<32}{mult:.2f}x{direction_note}")


def _safe_correlation(xs, ys):
    if len(set(xs)) < 2 or len(set(ys)) < 2:
        return float("nan")
    n = len(xs)
    mean_x, mean_y = statistics.mean(xs), statistics.mean(ys)
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / n
    std_x = statistics.pstdev(xs)
    std_y = statistics.pstdev(ys)
    if std_x == 0 or std_y == 0:
        return float("nan")
    return cov / (std_x * std_y)


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("scan_log.jsonl")
    run_backtest(path)
