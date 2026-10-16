import { describe, expect, it } from "vitest";
import fs from "node:fs";
import type { Bar, ScanDecision } from "@/lib/types";
import { applyTimeWindowHold } from "@/lib/scoring/score";
import { readWindowTurn, timeWindowsAt, type WindowsAt } from "@/lib/gann/timeWindow";

// Q19 (owner: "Window"): A-TIME-15, W036 p.22, "when the market turns close to
// a forecast date, buy or sell", with C-STOP-03's "time alone is not enough":
// a dated window acts only together with a price turn, the swing extreme the
// plan's stop sits behind.

const DAY = 86_400_000;
function days(closes: number[], start = "2026-03-02"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}
// Down to a bottom on day 6 (2026-03-08), then up through the old top.
const closes = [110, 108, 106, 104, 102, 100, 98, 100, 102, 104, 106, 108, 110, 112];
const bars = days(closes);

describe("readWindowTurn", () => {
  it("finds the swing bottom a long's stop sits behind and the windows open on its date", () => {
    const seen: string[] = [];
    const at: WindowsAt = (_b, date, kind) => {
      seen.push(`${date}:${kind}`);
      return date === "2026-03-08" ? ["a test window"] : [];
    };
    const turn = readWindowTurn(bars, "bullish", at);
    expect(turn).toEqual({ kind: "bottom", date: "2026-03-08", price: 97.5, windows: ["a test window"] });
    expect(seen).toEqual(["2026-03-08:bottom"]);
  });

  it("reads only the bars through the turn, so nothing after it decides", () => {
    let length = 0;
    readWindowTurn(bars, "bullish", (b) => {
      length = b.length;
      return [];
    });
    expect(length).toBe(7);
  });

  it("is null when no window is open on the turn's date", () => {
    expect(readWindowTurn(bars, "bullish", () => [])).toBeNull();
  });

  it("mirrors for a short, at the swing top", () => {
    const up = days(closes.map((c) => 220 - c));
    const turn = readWindowTurn(up, "bearish", (_b, date, kind) => (kind === "top" ? [`${date}`] : []));
    expect(turn?.kind).toBe("top");
    expect(turn?.date).toBe("2026-03-08");
  });
});

describe("timeWindowsAt", () => {
  it("names the pivot windows of the turn's polarity only", () => {
    // A major low, then a bottom 90 days later: the 90-day wheel count from a low.
    const t0 = Date.parse("2025-10-01T00:00:00Z");
    const series: Bar[] = Array.from({ length: 200 }, (_, i) => {
      const c = 100 + 10 * Math.sin(i / 8) - (i === 60 ? 15 : 0);
      return { t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
    });
    const turnAt = series.slice(0, 151);
    const date = turnAt[150].t.slice(0, 10);
    const lows = timeWindowsAt(turnAt, date, "bottom");
    const highs = timeWindowsAt(turnAt, date, "top");
    expect(lows.some((w) => /low/.test(w))).toBe(true);
    expect(highs.every((w) => !/time window from a major low/.test(w))).toBe(true);
  });
});

describe("applyTimeWindowHold", () => {
  const execute: ScanDecision = { score: 8, outputState: "Execute", breakdown: [] };

  it("holds a counter-trend Execute to Watch with no turn at a dated window", () => {
    const held = applyTimeWindowHold(execute, "reversion", null);
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)?.key).toBe("timeWindowTurn");
  });

  it("lets it through when the turn came at a window", () => {
    const turn = { kind: "bottom" as const, date: "2026-03-08", price: 97.5, windows: ["a window"] };
    expect(applyTimeWindowHold(execute, "reversion", turn).outputState).toBe("Execute");
  });

  it("leaves a with-trend setup and anything short of Execute alone", () => {
    expect(applyTimeWindowHold(execute, "continuation", null)).toBe(execute);
    const watch: ScanDecision = { ...execute, outputState: "Watch" };
    expect(applyTimeWindowHold(watch, "reversion", null)).toBe(watch);
  });

  it("is applied by the live scan and the replay alike", () => {
    for (const f of ["lib/scanTicker.ts", "lib/backtest/replay.ts"]) {
      expect(fs.readFileSync(f, "utf8")).toMatch(/applyTimeWindowHold\(/);
    }
  });
});
