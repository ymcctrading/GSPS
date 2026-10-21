import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { readFocus, rankFocus, describeFocusReason, type FocusReading } from "./focusList";

const DAY = 86_400_000;
function bar(i: number, o: number, h: number, l: number, c: number, v = 1_000_000): Bar {
  return { t: new Date(Date.UTC(2026, 5, 1) + i * DAY).toISOString(), o, h, l, c, v };
}

/** A wide market: swings of ±12% so no narrow run forms. */
function wide(n: number, base = 100): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const mid = base * (1 + 0.12 * Math.sin(i / 2));
    return bar(i, mid, mid * 1.02, mid * 0.98, mid * (i % 2 ? 1.01 : 0.99));
  });
}

describe("readFocus", () => {
  it("reads a narrow range of two weeks or more, at its edge", () => {
    const sessions = [...wide(30, 300), ...Array.from({ length: 15 }, (_, i) => bar(30 + i, 100, 101, 99.5, 100.5))];
    sessions.push(bar(45, 100.5, 101, 100.2, 100.9));
    const r = readFocus("AAA", sessions, null)!;
    const range = r.reasons.find((x) => x.kind === "narrow_range");
    expect(range).toBeDefined();
    expect(range && range.kind === "narrow_range" && range.sessions).toBeGreaterThanOrEqual(10);
    expect(range && range.kind === "narrow_range" && range.edge).toBe("top");
  });

  it("reads a wide range on heavy volume as a big day", () => {
    const sessions = wide(40);
    const prev = sessions[sessions.length - 1];
    sessions.push(bar(40, prev.c, prev.c * 1.15, prev.c * 0.995, prev.c * 1.14, 3_000_000));
    const r = readFocus("BBB", sessions, null)!;
    expect(r.reasons).toContainEqual({ kind: "big_day", signal: "wide_up" });
  });

  it("reads a plan whose entry is within a day's range, not one whose stop broke", () => {
    const sessions = wide(40);
    const close = sessions[sessions.length - 1].c;
    const near = readFocus("CCC", sessions, { direction: "up", verdict: "Execute", entry: close - 0.5, stop: close - 5, tp1: null, mtp: null })!;
    expect(near.reasons.some((x) => x.kind === "plan_near")).toBe(true);
    const broken = readFocus("CCC", sessions, { direction: "up", verdict: "Execute", entry: close + 1, stop: close + 0.5, tp1: null, mtp: null });
    expect(broken?.reasons.some((x) => x.kind === "plan_near") ?? false).toBe(false);
  });

  it("reads the close within 3 points of an old 3-Day Chart top", () => {
    const up = Array.from({ length: 30 }, (_, i) => bar(i, 80 + i, 81 + i, 79 + i, 80.5 + i));
    const down = Array.from({ length: 6 }, (_, i) => bar(30 + i, 109 - i * 2, 110 - i * 2, 107 - i * 2, 108 - i * 2));
    const back = Array.from({ length: 4 }, (_, i) => bar(36 + i, 99 + i * 2, 101 + i * 2, 98 + i * 2, 100.5 + i * 2));
    const sessions = [...up, ...down, ...back];
    const r = readFocus("DDD", sessions, null)!;
    const level = r.reasons.find((x) => x.kind === "old_level");
    expect(level).toBeDefined();
    if (level?.kind === "old_level") {
      expect(level.side).toBe("top");
      expect(level.level - sessions[sessions.length - 1].c).toBeLessThanOrEqual(gannThreePoints(level.level));
    }
  });

  it("returns null with too little history", () => {
    expect(readFocus("EEE", wide(10), null)).toBeNull();
  });
});

describe("rankFocus", () => {
  it("orders by reasons, then by dollar volume, and caps", () => {
    const r = (symbol: string, n: number, adv: number): FocusReading => ({
      symbol,
      close: 1,
      avgDollarVolume: adv,
      reasons: Array.from({ length: n }, () => ({ kind: "big_day", signal: "wide_up" }) as const),
    });
    const ranked = rankFocus([r("A", 1, 9e9), r("B", 2, 1e6), r("C", 2, 5e6)], 2);
    expect(ranked.map((x) => x.symbol)).toEqual(["C", "B"]);
  });

  it("describes each reason in plain words", () => {
    expect(describeFocusReason({ kind: "old_level", level: 101.5, side: "top" })).toBe("Within 3 points of the old top at 101.50");
  });
});
