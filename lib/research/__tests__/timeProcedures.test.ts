import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROCEDURE_TESTS,
  confirmedPivots,
  heldOutRun,
  marsCrossings,
  mergeWindows,
  monthEnds,
  projectionsAt,
  seriesFor,
  type Series,
} from "@/lib/research/timeProcedures";

const run = JSON.parse(readFileSync(path.resolve(__dirname, "../../..", "docs/replay-runs/2026-10-30-time-procedures.json"), "utf8"));
const log = JSON.parse(readFileSync(path.resolve(__dirname, "../..", "research/timeProcedureLog.json"), "utf8"));

describe("confirmedPivots", () => {
  it("takes the highest close of 21 sessions, ties to the earliest", () => {
    const close = Array.from({ length: 41 }, (_, i) => 100 - Math.abs(i - 20));
    close[22] = close[20]; // a tie later in the window does not move the pivot
    const s: Series = { dates: close.map((_, i) => `2020-01-${String(i + 1).padStart(2, "0")}`), open: close, close };
    const tops = confirmedPivots(s).filter((p) => p.kind === "top");
    expect(tops.map((p) => p.index)).toEqual([20]);
  });
});

describe("mergeWindows", () => {
  it("merges one direction's overlaps and keeps opposite directions apart", () => {
    const w = mergeWindows([
      { projected: "a", from: 10, to: 12, direction: "top" },
      { projected: "b", from: 12, to: 14, direction: "top" },
      { projected: "c", from: 11, to: 13, direction: "bottom" },
    ]);
    expect(w.map((x) => [x.from, x.to, x.direction])).toEqual([
      [10, 14, "top"],
      [11, 13, "bottom"],
    ]);
  });
});

describe("marsCrossings", () => {
  it("finds the day Mars passes a longitude, and none in a month it doesn't reach", () => {
    const from = marsCrossings(0, "2020-01");
    expect(from).toEqual([]);
    // Geocentric Mars entered Aries (0°) on 28 Jun 2020.
    expect(marsCrossings(0, "2020-06")).toEqual(["2020-06-28"]);
  });
});

describe("issuing", () => {
  it("projects only into the next month, from closes up to the month-end", () => {
    const s = seriesFor("DIA");
    const pivots = confirmedPivots(s);
    const e = monthEnds(s).get("2024-05")!;
    for (const rule of ["A", "A0", "B", "C"] as const) for (const p of projectionsAt(rule, s, e, pivots)) expect(p.date.startsWith("2024-06")).toBe(true);
  });

  it("the forward log is append-only and starts empty or frozen before its months", () => {
    for (const e of log.entries) for (const p of e.projections) expect(p.date.slice(0, 7) > e.issued.slice(0, 7)).toBe(true);
  });
});

describe("the committed held-out run still says what the module computes", () => {
  it("every rule, overlay and verdict", { timeout: 300_000 }, () => {
    const r = heldOutRun();
    expect(run.tests).toBe(PROCEDURE_TESTS);
    expect(r.turns.map((t) => [t.rule, t.symbol, t.windows, t.hits])).toEqual(
      run.turns.map((t: { rule: string; symbol: string; windows: number; hits: number }) => [t.rule, t.symbol, t.windows, t.hits]),
    );
    expect(r.overlays.map((o) => [o.rule, o.symbol, o.trades])).toEqual(run.overlays.map((o: { rule: string; symbol: string; trades: number }) => [o.rule, o.symbol, o.trades]));
    // The finding the docs report: no frozen rule survives its kill criterion on the held-out span.
    expect(Object.values(r.verdicts)).not.toContain("surviving");
    expect(r.verdicts).toEqual(run.verdicts);
  });
});
