import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Bar } from "@/lib/types";
import { majorAnglePivots, readPatternAngles } from "@/lib/gann/patternAngles";
import { swingPivots, WEEKLY_SWING_CHART } from "@/lib/gann/swingChart";
import { pointForBars } from "@/lib/gann/pointScale";

const DAY = 86_400_000;
const series = (drift: number): Bar[] =>
  Array.from({ length: 160 }, (_, i) => 100 + 10 * Math.sin(i / 7) + i * drift).map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 5) + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6,
  }));
const keyOf = (p: { kind: string; index: number }) => `${p.kind}:${p.index}`;

describe("angles start from the weekly swing chart's last top and bottom, each paired with the opposite pivot just before it", () => {
  for (const [name, bars] of [["rising", series(0.1)], ["falling", series(-0.1)]] as const) {
    it(`includes both last swing pivots as origins (${name})`, () => {
      const swings = swingPivots(bars, WEEKLY_SWING_CHART);
      const lastTop = [...swings].reverse().find((p) => p.kind === "top")!;
      const lastBottom = [...swings].reverse().find((p) => p.kind === "bottom")!;
      const origins = majorAnglePivots(bars).map((x) => keyOf(x.pivot));
      expect(origins).toContain(keyOf(lastTop));
      expect(origins).toContain(keyOf(lastBottom));
    });
    it(`pairs each origin with the latest opposite pivot before it (${name})`, () => {
      const swings = swingPivots(bars, WEEKLY_SWING_CHART);
      let hi = 0, lo = 0;
      bars.forEach((b, i) => { if (b.h > bars[hi].h) hi = i; if (b.l < bars[lo].l) lo = i; });
      const pool = [...swings, { kind: "bottom", index: lo }, { kind: "top", index: hi }];
      for (const { pivot, preceding } of majorAnglePivots(bars)) {
        const before = pool.filter((q) => q.kind !== pivot.kind && q.index < pivot.index);
        const want = before.length ? Math.max(...before.map((q) => q.index)) : null;
        expect(preceding?.index ?? null).toBe(want);
      }
    });
  }
  it("the falling fixture's last swing top is not the extreme high (so the case is not vacuous)", () => {
    const bars = series(-0.1);
    const swings = swingPivots(bars, WEEKLY_SWING_CHART);
    let hi = 0;
    bars.forEach((b, i) => { if (b.h > bars[hi].h) hi = i; });
    expect([...swings].reverse().find((p) => p.kind === "top")!.index).not.toBe(hi);
  });
});

describe("the card's pattern-angle reading uses the same price-scaled point as the S/R list", () => {
  it("matches readPatternAngles on the chart's own point", async () => {
    const { readDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const bars = series(0.1);
    const price = bars[bars.length - 1].c;
    const ctx = readDisclosedRules(bars, price, { sharesOutstanding: null, inception: null }, new Date("2026-06-15T15:00:00Z"));
    expect(ctx.patternAngles).toEqual(readPatternAngles(bars, price, pointForBars(bars)));
    expect(ctx.patternAngles).not.toEqual(readPatternAngles(bars, price, 2 * pointForBars(bars)));
  });
});

describe("the portfolio manager takes no step-up when the run of wins can't be read", () => {
  it("falls back to the starting capital on paper and on live, the equity when live has none", () => {
    const pm = readFileSync("lib/automation/portfolio-manager.ts", "utf8");
    expect(pm).toMatch(/: Math\.min\(equityBasis, STARTING_CASH\);/);
    // Live reads the first verified equity as its starting capital (A-RISK-04);
    // with the run unread it takes no step-up, as paper and placement don't,
    // and with no starting capital on record (`liveStart` null) the unit is the equity.
    expect(pm).toMatch(/startingCapital: liveStart \?\? 0, \.\.\.run \}\)\.capital/);
    expect(pm).toMatch(/: Math\.min\(equityBasis, liveStart \?\? Infinity\)/);
  });
});
