import { describe, expect, it } from "vitest";
import { PAUSE_SETTLEMENT_LABEL, hasPauseLabel, labelUpdate, rowsToLabel, withPauseLabel, type LabelCandidate } from "@/lib/recovery/pauseSettlementLabel";

describe("withPauseLabel", () => {
  it("adds the label once after the reasoning", () => {
    const once = withPauseLabel("Protocol levels — stop $1,644.00, TP1 $1,720.00");
    expect(once).toBe(`Protocol levels — stop $1,644.00, TP1 $1,720.00 · ${PAUSE_SETTLEMENT_LABEL}`);
    expect(withPauseLabel(once)).toBe(once);
    expect(hasPauseLabel(once)).toBe(true);
  });

  it("stands alone on an empty reasoning", () => {
    expect(withPauseLabel("")).toBe(PAUSE_SETTLEMENT_LABEL);
    expect(withPauseLabel(null)).toBe(PAUSE_SETTLEMENT_LABEL);
  });
});

describe("rowsToLabel", () => {
  const since = new Date("2026-11-30T13:00:00Z");
  const ids = new Set(["exit-1", "exit-2"]);
  const row = (over: Partial<LabelCandidate>): LabelCandidate => ({
    id: "log",
    exit_plan_id: "exit-1",
    mode: "paper",
    exit_timestamp: "2026-11-30T13:09:00Z",
    signal_called: "Protocol levels",
    ...over,
  });

  it("labels only paper closes of a captured exit made at or after the lift", () => {
    const rows = [
      row({ id: "a" }),
      row({ id: "b", exit_plan_id: "exit-3" }),
      row({ id: "c", mode: "live" }),
      row({ id: "d", exit_timestamp: "2026-10-30T19:00:00Z" }),
      row({ id: "e", exit_timestamp: null }),
      row({ id: "f", signal_called: `x · ${PAUSE_SETTLEMENT_LABEL}` }),
      row({ id: "g", exit_plan_id: null }),
      row({ id: "h", exit_plan_id: "exit-2", exit_timestamp: "2026-11-30T13:00:00Z" }),
    ];
    expect(rowsToLabel(rows, ids, since).map((r) => r.id)).toEqual(["a", "h"]);
  });
});

describe("labelUpdate", () => {
  it("writes the reasoning text and nothing else (trade_logs has no updated_at)", () => {
    const u = labelUpdate({ signal_called: "Protocol levels" });
    expect(Object.keys(u)).toEqual(["signal_called"]);
    expect(u.signal_called).toBe(`Protocol levels · ${PAUSE_SETTLEMENT_LABEL}`);
  });
});
