/**
 * Gann's crossing rule as an entry (W006 pp.20, 46-47; PLAN.md item 4): an old
 * top L is crossed when a close clears it by 3 points; buy the reaction at
 * L + 1 point (down to just under L), stop 3 points under L. Never risk more
 * than 5 points. Points are price-scaled (lib/gann/pointScale.ts). Shorts
 * mirror it.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeGannEntryTrigger, type GannEntryTrigger } from "@/lib/gann/entryTrigger";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { preferredEntryDirection } from "@/lib/scan/entrySelection";
import { buildMacroContext, replay } from "@/lib/backtest/replay";

const DAY = "2026-06-15";
function dayBar(date: string, c: number): Bar {
  return { t: `${date}T00:00:00Z`, o: c, h: c + 1, l: c - 1, c, v: 1000 };
}
function dailyHistory(count: number, before: string): Bar[] {
  const out: Bar[] = [];
  const end = new Date(`${before}T00:00:00Z`).getTime();
  for (let i = count; i >= 1; i--) {
    const d = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const phase = (count - i) % 8;
    const step = phase < 4 ? phase : 7 - phase;
    out.push(dayBar(d, 96 + step * 2));
  }
  return out;
}
const DAILY = dailyHistory(300, DAY);
const T: GannEntryTrigger = computeGannEntryTrigger(DAILY, preferredEntryDirection(buildMacroContext(DAILY, 100).macroTrends))!;
const S = T.direction === "bullish" ? 1 : -1;
const L = T.pivot.price;
const P = gannThreePoints(L);

function intraday(bars: Array<Omit<Bar, "t" | "v">>): Bar[] {
  return bars.map((b, i) => {
    const m = i * 15;
    return { ...b, t: `${DAY}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00Z`, v: 1000 };
  });
}
/** A bar around `c`, in trade direction terms (c is an offset from L in points-of-3). */
const at = (c: number, half = 0.2) => ({ o: c, h: c + half, l: c - half, c });
/** Warm-up just inside the level, between L and the stop. */
function session(tail: Array<Omit<Bar, "t" | "v">>): Bar[] {
  const head = Array.from({ length: 44 }, (_, i) => at(L - S * (P / 2) + (i % 2 ? 0.1 : -0.1)));
  return intraday([...head, ...tail]);
}
const opts = { targetR: 2, dailyBars: DAILY, entryRule: "reaction" as const };

describe("computeGannEntryTrigger: Gann's crossing levels", () => {
  it("carries the level, a buy 1 point past it and a stop 3 points the other side", () => {
    expect(T.level).toBe(L);
    expect(T.triggerPrice).toBeCloseTo(L + S * P, 8);
    expect(T.reactionEntry).toBeCloseTo(L + (S * P) / 3, 8);
    expect(T.reactionStop).toBeCloseTo(L - S * P, 8);
    // Never more than 5 points of risk: the reaction buy risks 4.
    expect(Math.abs(T.reactionEntry - T.reactionStop)).toBeCloseTo((4 * P) / 3, 8);
  });
});

describe("replay entryRule: reaction", () => {
  it("buys the reaction to 1 point past the level after a close 3 points beyond it", () => {
    const r = replay("TEST", session([at(L + S * (P + 0.5)), at(L + S * (P + 0.3)), at(L + (S * P) / 3 + S * 0.1, 0.4), at(L + S * P)]), opts);
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.entry).toBeCloseTo(T.reactionEntry, 8);
    expect(t.stop).toBeCloseTo(T.reactionStop, 8);
  });

  it("does not buy when price never closed 3 points beyond the level", () => {
    const r = replay("TEST", session([at(L + S * (P - 0.5)), at(L + (S * P) / 3, 0.4), at(L)]), opts);
    expect(r.trades).toHaveLength(0);
  });

  it("refuses a gap through the stop line rather than buying it", () => {
    const gap = at(L - S * (P + 0.5));
    const r = replay("TEST", session([at(L + S * (P + 0.5)), gap, at(L)]), opts);
    expect(r.trades).toHaveLength(0);
    expect(r.refusedFills).toBe(1);
  });

  it("measures R on the 4 points between the reaction buy and the stop", () => {
    const win = at(L + S * (P / 3 + 2 * ((4 * P) / 3) + 1), 0.1);
    const r = replay("TEST", session([at(L + S * (P + 0.5)), at(L + S * (P + 0.3)), at(L + (S * P) / 3 + S * 0.1, 0.4), win, at(L)]), opts);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].outcome).toBe("win");
    expect(r.trades[0].target).toBeCloseTo(T.reactionEntry + S * 2 * Math.abs(T.reactionEntry - T.reactionStop), 8);
  });
});
