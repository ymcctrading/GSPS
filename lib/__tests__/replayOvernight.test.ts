import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { replayOvernight, statsOf, summariseOvernight } from "@/lib/backtest/replayOvernight";

const DAY = 86_400_000;
function series(): Bar[] {
  // Swings of a few points on a trend that turns, so the method trades and reverses.
  const out: Bar[] = [];
  for (let i = 0; i < 240; i++) {
    const trend = i < 120 ? i * 0.15 : (240 - i) * 0.15;
    const p = 50 + trend + 0.9 * Math.sin(i / 1.5);
    out.push({ t: new Date(Date.UTC(2024, 0, 1) + i * DAY).toISOString(), o: p, h: p + 0.3, l: p - 0.3, c: p, v: 1e6 });
  }
  return out;
}

describe("replayOvernight", () => {
  it("measures each closed trade in R after friction", () => {
    const r = replayOvernight("TEST", series(), { costPerShare: 0 });
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      const risk = Math.abs(t.entry - t.initialStop);
      const gross = t.side === "long" ? t.exit - t.entry : t.entry - t.exit;
      expect(t.r).toBeCloseTo(gross / risk);
    }
  });

  it("summarises by how trades opened and by halves", () => {
    const s = summariseOvernight([replayOvernight("TEST", series(), { halfwayEntries: true })]);
    const n = s.byOpened.crossing.trades + s.byOpened.reversal.trades + s.byOpened.halfway.trades;
    expect(n).toBe(s.all.trades);
    expect(s.halves.early.trades + s.halves.late.trades).toBe(s.all.trades);
  });

  it("computes a mean and interval", () => {
    const st = statsOf([1, -1, 2, 0]);
    expect(st.expectancyR).toBeCloseTo(0.5);
    expect(st.winRate).toBeCloseTo(0.5);
    expect(st.ci95![0]).toBeLessThan(0.5);
  });
});
