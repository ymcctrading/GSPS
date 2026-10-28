import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { threePoints } from "@/lib/gann/pointScale";
import { breakawayLinesFirst, readFocus, rankFocus, describeFocusReason, type FocusReading } from "./focusList";

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
      expect(level.level - sessions[sessions.length - 1].c).toBeLessThanOrEqual(threePoints(level.level));
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
    expect(describeFocusReason({ kind: "old_level", level: 101.5, side: "top" })).toBe("Close to the old top at 101.50");
  });
});

describe("breakawayLinesFirst", () => {
  const nr = (edge: "top" | "bottom" | null, sessions: number) => [{ kind: "narrow_range", sessions, top: 0, bottom: 0, edge }];
  // The evening of 2026-10-26 (stored focus rows, rank order) and the night's
  // sweep plans: TXN ranked 42nd, at the top of a 21-session range with its
  // line at 301.86, 3.84 above the close.
  const focus = [
    { symbol: "JPM", close: 300, reasons: [{ kind: "old_level", level: 301, side: "top" }] },
    { symbol: "GM", close: 76.31, reasons: nr("bottom", 27) },
    { symbol: "BA", close: 188.14, reasons: nr("bottom", 23) },
    { symbol: "TXN", close: 298.02, reasons: nr("top", 21) },
    { symbol: "KVUE", close: 19.495, reasons: nr("top", 64) },
    { symbol: "NVDA", close: 190, reasons: nr("top", 30) },
  ];
  const plans = [
    { symbol: "GM", direction: "bearish", entry: 75.04, output_state: "Watch" },
    { symbol: "BA", direction: "bearish", entry: 181.03, output_state: "Watch" },
    { symbol: "TXN", direction: "bullish", entry: 301.86, output_state: "Watch" },
    { symbol: "KVUE", direction: "bullish", entry: 20.19, output_state: "Watch" },
    { symbol: "NVDA", direction: "bearish", entry: 185, output_state: "Watch" },
    { symbol: "JPM", direction: "bullish", entry: 302, output_state: "Execute" },
  ];

  it("puts the names at a breakaway first, nearest the line in allowances, and keeps the rest in order", () => {
    const { symbols, lines } = breakawayLinesFirst(focus, plans);
    // GM 0.30 and KVUE 0.36 and TXN 0.40 allowances off; BA's line is more than an allowance away.
    expect(lines).toEqual(["GM", "KVUE", "TXN"]);
    expect(symbols).toEqual(["GM", "KVUE", "TXN", "JPM", "BA", "NVDA"]);
  });

  it("needs the range's edge on the plan's side, the line still ahead, and a live plan", () => {
    // NVDA's range is at its top but its plan sells; JPM has no narrow range.
    expect(breakawayLinesFirst(focus, plans).lines).not.toContain("NVDA");
    expect(breakawayLinesFirst(focus, plans).lines).not.toContain("JPM");
    const retired = plans.map((p) => (p.symbol === "TXN" ? { ...p, invalidated_at: "2026-10-27T15:00:00Z" } : p));
    expect(breakawayLinesFirst(focus, retired).lines).not.toContain("TXN");
    const rejected = plans.map((p) => (p.symbol === "TXN" ? { ...p, output_state: "Reject" } : p));
    expect(breakawayLinesFirst(focus, rejected).lines).not.toContain("TXN");
    // Already past the line: a reaction, not a crossing ahead.
    const past = focus.map((f) => (f.symbol === "TXN" ? { ...f, close: 303 } : f));
    expect(breakawayLinesFirst(past, plans).lines).not.toContain("TXN");
    // Malformed rows never throw and never lead.
    expect(breakawayLinesFirst([{ symbol: "X", close: null, reasons: null }], [{ symbol: "X", direction: null, entry: "a", output_state: "Watch" }]).lines).toEqual([]);
  });
});
