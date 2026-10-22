import { describe, expect, it } from "vitest";
import { firstTradeChart, newYorkOpen, scoreHoldOut, selectAspects, transitEvents } from "@/lib/research/firstTradeChart";

const DAY = 86_400_000;
const dayOf = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);

describe("C-ASTRO-09: the first-trade chart with its aspects chosen on a hold-out (Bucholtz, W013)", () => {
  it("casts the chart at 9:30 am New York time, daylight time included", () => {
    expect(newYorkOpen("2020-01-15").toISOString()).toBe("2020-01-15T14:30:00.000Z");
    expect(newYorkOpen("2020-07-15").toISOString()).toBe("2020-07-15T13:30:00.000Z");
    // The NYSE's own date, May 17, 1792: the Sun is in Taurus (30-60°).
    const sun = firstTradeChart("1792-05-17").Sun;
    expect(sun).toBeGreaterThan(30);
    expect(sun).toBeLessThan(60);
  });

  it("chooses the aspects on the training swings and scores them only on swings it never saw", () => {
    const chart = firstTradeChart("2000-01-03");
    const from = Date.parse("2001-01-01T00:00:00Z");
    const to = Date.parse("2008-12-31T00:00:00Z");
    const events = transitEvents(chart, from, to);
    expect(events.size).toBeGreaterThan(10);
    // Pivots every 50 days: no relation to the sky, so the hold-out should
    // score near the base rate whatever the training picked.
    const pivots: number[] = [];
    for (let d = dayOf("2001-01-10"); d <= dayOf("2008-12-31"); d += 50) pivots.push(d);
    const split = dayOf("2004-12-31");
    const kept = selectAspects(events, pivots.filter((p) => p <= split), split);
    expect(kept.length).toBeGreaterThan(0);
    const score = scoreHoldOut(events, kept, pivots.filter((p) => p > split), split, dayOf("2008-12-31"));
    expect(score.baseRate).toBeCloseTo(7 / 50, 1);
    if (score.events > 0) expect(score.hits / score.events).toBeLessThan(0.5);
  });
});
