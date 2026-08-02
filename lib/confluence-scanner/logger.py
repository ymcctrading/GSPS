"""
logger.py
---------
Appends every scan (pass or fail) to a JSONL log with a placeholder
`outcome` field. This is the data you need to actually tune the checklist
over time instead of guessing at weights forever.

Workflow:
  1. Every scan gets logged automatically via log_scan().
  2. After a trade plays out (win/loss/no-trade), fill in the outcome
     using update_outcome() — keyed by the log entry's `id`.
  3. Run backtest.py periodically to see which factors actually correlate
     with wins, and get suggested reweighting.
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from schema import ScanResult

DEFAULT_LOG_PATH = Path("scan_log.jsonl")


def log_scan(result: ScanResult, log_path: Path = DEFAULT_LOG_PATH) -> str:
    """Writes one scan result as a JSON line. Returns the entry id."""
    entry_id = str(uuid.uuid4())
    entry = {
        "id": entry_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "symbol": result.symbol,
        "direction": result.direction,
        "gates_passed": result.gates_passed,
        "gate_failures": [g["name"] for g in result.gate_failures] if not result.gates_passed else [],
        "total_score": result.total_score,
        "max_score": result.max_score,
        "score_pct": result.score_pct,
        "factors": [
            {
                "name": f.name,
                "category": f.category,
                "points_awarded": f.points_awarded,
                "points_possible": f.points_possible,
                "passed": f.passed,
            }
            for f in result.factors
        ],
        # Fill this in later: "win" / "loss" / "scratch" / "no_trade" / None
        "outcome": None,
        "outcome_r_multiple": None,
        "outcome_notes": "",
    }
    with open(log_path, "a") as f:
        f.write(json.dumps(entry) + "\n")
    return entry_id


def update_outcome(entry_id: str, outcome: str, r_multiple: float = None,
                    notes: str = "", log_path: Path = DEFAULT_LOG_PATH) -> bool:
    """
    Rewrites the log with the outcome filled in for a given entry id.
    JSONL files aren't natively editable in place, so this reads/rewrites
    the whole file — fine at scan-log scale (thousands of rows), not
    meant for high-frequency use.
    """
    if not log_path.exists():
        return False
    lines = log_path.read_text().splitlines()
    updated = False
    new_lines = []
    for line in lines:
        entry = json.loads(line)
        if entry["id"] == entry_id:
            entry["outcome"] = outcome
            entry["outcome_r_multiple"] = r_multiple
            entry["outcome_notes"] = notes
            updated = True
        new_lines.append(json.dumps(entry))
    if updated:
        log_path.write_text("\n".join(new_lines) + "\n")
    return updated


def load_log(log_path: Path = DEFAULT_LOG_PATH) -> list[dict]:
    if not log_path.exists():
        return []
    return [json.loads(line) for line in log_path.read_text().splitlines() if line.strip()]
