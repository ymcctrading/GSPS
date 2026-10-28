import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { discoverUniverse, rankDiscoveries, readDiscovery, splitSession } from "../discovery";

const DELAY = 15 * 60_000;
const day = (i: number) => new Date(Date.UTC(2026, 8, 1 + i, 5)).toISOString(); // Sep 1 + i, 1 AM ET

/** 50 completed sessions swinging 90-100 (tops near 100), then the session on Oct 27. */
function series(sign: 1 | -1, session: { o: number; h: number; l: number; c: number; v: number }): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < 50; i++) {
    const mid = 95 + 5 * Math.sin(i / 2.2);
    const m = sign === 1 ? mid : 190 - mid;
    bars.push({ t: day(i), o: m, h: m + 1, l: m - 1, c: m + (i % 2 ? 0.3 : -0.3), v: 1_000_000 });
  }
  bars.push({ t: "2026-10-27T04:00:00Z", ...session });
  return bars;
}
const at = { evaluatedAt: new Date("2026-10-27T15:00:00Z"), observedThrough: new Date("2026-10-27T14:45:00Z"), delayMs: DELAY };

describe("discovery", () => {
  it("notices a stock crossing its old top, and mirrors it for a bottom", () => {
    const up = readDiscovery({ symbol: "aaa", bars: series(1, { o: 99, h: 115, l: 98, c: 114, v: 3_000_000 }), ...at })!;
    expect(up.examineOnly).toBe(true);
    expect(up.symbol).toBe("AAA");
    expect(up.conditions.some((c) => c.kind === "old_level_crossed" && c.side === "top")).toBe(true);
    expect(up.conditions.some((c) => c.kind === "new_13_week_extreme" && c.side === "high")).toBe(true);

    const down = readDiscovery({ symbol: "BBB", bars: series(-1, { o: 91, h: 92, l: 75, c: 76, v: 3_000_000 }), ...at })!;
    expect(down.conditions.some((c) => c.kind === "old_level_crossed" && c.side === "bottom")).toBe(true);
    expect(down.conditions.some((c) => c.kind === "new_13_week_extreme" && c.side === "low")).toBe(true);
  });

  it("carries no entry, stop or target, and records both times", () => {
    const r = readDiscovery({ symbol: "AAA", bars: series(1, { o: 99, h: 115, l: 98, c: 114, v: 3_000_000 }), ...at })!;
    const keys = JSON.stringify(r);
    expect(keys).not.toMatch(/"(entry|stop|tp1|mtp|target)"/);
    expect(r.dataAsOf).toBe("2026-10-27T14:45:00.000Z");
    expect(r.evaluatedAt).toBe("2026-10-27T15:00:00.000Z");
  });

  it("a quiet session inside its range is not a discovery", () => {
    expect(readDiscovery({ symbol: "Q", bars: series(1, { o: 95, h: 95.5, l: 94.5, c: 95, v: 100_000 }), ...at })).toBeNull();
  });

  it("respects the delay: the session bar is not a completed session until close plus the delay", () => {
    const bars = series(1, { o: 99, h: 115, l: 98, c: 114, v: 3_000_000 });
    const before = splitSession({ symbol: "A", bars, evaluatedAt: new Date("2026-10-27T20:10:00Z"), observedThrough: new Date("2026-10-27T19:55:00Z"), delayMs: DELAY });
    expect(before.session).not.toBeNull();
    const after = splitSession({ symbol: "A", bars, evaluatedAt: new Date("2026-10-27T20:20:00Z"), observedThrough: new Date("2026-10-27T20:05:00Z"), delayMs: DELAY });
    expect(after.session).toBeNull();
  });

  it("needs no prior plan: any stock in the series can be discovered", () => {
    const m = new Map<string, Bar[]>([
      ["NEW", series(1, { o: 99, h: 115, l: 98, c: 114, v: 3_000_000 })],
      ["QUIET", series(1, { o: 95, h: 95.5, l: 94.5, c: 95, v: 100_000 })],
    ]);
    expect(discoverUniverse(m, at).map((r) => r.symbol)).toEqual(["NEW"]);
  });

  it("is safe on malformed bars and short history", () => {
    const bad = series(1, { o: 99, h: 115, l: 98, c: 114, v: 3_000_000 }).map((b, i) => (i % 3 === 0 ? { ...b, h: NaN } : b));
    expect(() => readDiscovery({ symbol: "X", bars: bad, ...at })).not.toThrow();
    expect(readDiscovery({ symbol: "X", bars: series(1, { o: 99, h: 115, l: 98, c: 114, v: 1 }).slice(-10), ...at })).toBeNull();
    expect(readDiscovery({ symbol: "X", bars: [], evaluatedAt: new Date(NaN), observedThrough: new Date(), delayMs: DELAY })).toBeNull();
    const m = new Map<string, Bar[]>([["X", null as unknown as Bar[]]]);
    expect(discoverUniverse(m, at)).toEqual([]);
  });

  it("ranks by sourced conditions, then heuristic, then attention, deterministically", () => {
    const a = readDiscovery({ symbol: "A", bars: series(1, { o: 99, h: 115, l: 98, c: 114, v: 3_000_000 }), ...at })!;
    const b = { ...a, symbol: "B", conditions: a.conditions.slice(0, 1) };
    expect(rankDiscoveries([b, a]).map((r) => r.symbol)).toEqual(["A", "B"]);
    expect(rankDiscoveries([b, a])).toEqual(rankDiscoveries([a, b]));
  });

  it("reads only the last completed top: an older, higher top behind a crossed one is not the level ahead", () => {
    // Swings to 120, back to 100, up to 110 (the last top), then the close sits above 110.
    const path = [100, 105, 110, 115, 120, 116, 112, 108, 104, 100, 103, 106, 110, 107, 104, 101, 98, 101, 104, 108, 111, 113];
    const bars: Bar[] = [];
    for (let i = 0; i < 40; i++) {
      const m = path[Math.min(i, path.length - 1)];
      bars.push({ t: day(i), o: m, h: m + 0.5, l: m - 0.5, c: m, v: 1_000_000 });
    }
    // Today reaches 115: within 3 points of the old 120 top, which the old reading took as the level ahead.
    bars.push({ t: "2026-10-27T04:00:00Z", o: 113, h: 115, l: 112.6, c: 114, v: 900_000 });
    const r = readDiscovery({ symbol: "T", bars, ...at });
    const levelKinds = (r?.conditions ?? []).filter((c) => c.kind === "old_level_crossed" || c.kind === "at_old_level");
    expect(levelKinds.filter((c) => "side" in c && c.side === "top")).toEqual([]);
  });
});
