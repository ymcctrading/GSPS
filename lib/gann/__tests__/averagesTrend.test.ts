/**
 * The averages' trend and the market-trend hold (2026-10-29; 45 Years in Wall
 * Street, 1949, Rule 1: "determine the averages' trend with the 3-Day Chart
 * and the swing chart; trade stocks that conform").
 */
import { describe, expect, it } from "vitest";
import type { Bar, ScanDecision } from "@/lib/types";
import { averagesAgainst, readAveragesTrend } from "@/lib/gann/averagesTrend";
import { applyMarketTrendHold } from "@/lib/scoring/score";
import { readPillarFacts, marketCyclePillar } from "@/lib/scoring/pillars";
import { tradeHold, AGAINST_MARKET_TREND } from "@/lib/scanner/intradayDisplay";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";

const exec = (score = 8): ScanDecision => ({ score, outputState: "Execute", breakdown: [] });

/** Daily bars walking straight between the given closes, `sessions` per leg, weekends skipped. */
function path(points: [number, number][]): Bar[] {
  const out: Bar[] = [];
  let d = Date.parse("2024-01-01T00:00:00Z");
  let price = points[0][0];
  for (const [target, sessions] of points.slice(1)) {
    const step = (target - price) / sessions;
    for (let k = 0; k < sessions; k++) {
      while ([0, 6].includes(new Date(d).getUTCDay())) d += 86_400_000;
      const o = price;
      const c = price + step;
      out.push({ t: new Date(d).toISOString(), o, h: Math.max(o, c) + 0.2, l: Math.min(o, c) - 0.2, c, v: 1e6 });
      price = c;
      d += 86_400_000;
    }
  }
  return out;
}

// A falling market: lower tops and lower bottoms, weeks apart, still falling.
const FALLING = path([[400, 0], [440, 30], [400, 20], [420, 12], [370, 20], [385, 10], [340, 20]]);
// A rising market with a reaction under way: the weekly chart up, the 3-Day chart down.
const REACTING = path([[300, 0], [340, 25], [325, 12], [355, 12], [347, 4], [372, 10], [344, 6]]);
const RISING = path([[300, 0], [340, 25], [325, 12], [370, 25]]);

describe("readAveragesTrend", () => {
  it("reads both charts down in a falling market", () => {
    expect(readAveragesTrend(FALLING)).toEqual({ threeDay: "bearish", weekly: "bearish" });
    expect(averagesAgainst(readAveragesTrend(FALLING), "bullish")).toBe(true);
    expect(averagesAgainst(readAveragesTrend(FALLING), "bearish")).toBe(false);
  });

  it("reads a reaction in a rising market as mixed, so neither side is against it", () => {
    const a = readAveragesTrend(REACTING);
    expect(a?.weekly).toBe("bullish");
    expect(a?.threeDay).toBe("bearish");
    expect(averagesAgainst(a, "bullish")).toBe(false);
    expect(averagesAgainst(a, "bearish")).toBe(false);
  });

  it("reads the same year whatever history precedes it, so every surface agrees", () => {
    // A long sideways prefix before the falling market: the live scan holds
    // about 400 days of SPY, a replay its whole run.
    const prefix = path([[400, 0], [380, 200], [420, 200], [400, 200]]).map((b) => ({
      ...b,
      t: new Date(Date.parse(b.t) - 1000 * 86_400_000).toISOString(),
    }));
    expect(readAveragesTrend([...prefix, ...FALLING])).toEqual(readAveragesTrend(FALLING));
  });

  it("reads nothing on too little history, and holds nothing for it", () => {
    expect(readAveragesTrend(FALLING.slice(0, 5))).toBeNull();
    expect(averagesAgainst(null, "bullish")).toBe(false);
  });
});

describe("applyMarketTrendHold", () => {
  const down = readAveragesTrend(FALLING);
  const up = readAveragesTrend(RISING);

  it("holds a buy to Watch when both of the averages' charts read down", () => {
    const held = applyMarketTrendHold(exec(), down, "bullish");
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)?.key).toBe("marketTrend");
  });

  it("mirrors it for a sale in a market both charts read up", () => {
    expect(up).toEqual({ threeDay: "bullish", weekly: "bullish" });
    expect(applyMarketTrendHold(exec(), up, "bearish").outputState).toBe("Watch");
    expect(applyMarketTrendHold(exec(), up, "bullish").outputState).toBe("Execute");
  });

  it("leaves a mixed market, a Watch, no direction and no reading alone", () => {
    expect(applyMarketTrendHold(exec(), readAveragesTrend(REACTING), "bullish").outputState).toBe("Execute");
    const watch: ScanDecision = { score: 6, outputState: "Watch", breakdown: [] };
    expect(applyMarketTrendHold(watch, down, "bullish")).toBe(watch);
    expect(applyMarketTrendHold(exec(), down, "none").outputState).toBe("Execute");
    expect(applyMarketTrendHold(exec(), null, "bullish").outputState).toBe("Execute");
  });

  it("names the hold in plain words on the public summary", () => {
    const summary = toPublicScoreSummary(applyMarketTrendHold(exec(), down, "bullish"));
    expect(JSON.stringify(summary)).toContain("the overall market is trending against the trade");
  });
});

describe("P1's market leg", () => {
  it("reads the averages' weekly chart, the main trend, through a reaction", () => {
    const stock = REACTING;
    const facts = readPillarFacts({
      rules: {} as never,
      daily: stock,
      monthly: [],
      marketDaily: REACTING,
      universe: null,
      oldLevels: [],
      price: stock[stock.length - 1].c,
      asOf: new Date(`${stock[stock.length - 1].t.slice(0, 10)}T12:00:00Z`),
    });
    expect(facts.marketTrend).toBe("bullish");
    expect(facts.averages?.threeDay).toBe("bearish");
    expect(marketCyclePillar(facts, "bullish").note).toContain("Market trend with the setup: yes");
  });

  it("reads no market for crypto (no averages)", () => {
    const facts = readPillarFacts({
      rules: {} as never,
      daily: RISING,
      monthly: [],
      marketDaily: null,
      universe: null,
      oldLevels: [],
      price: RISING[RISING.length - 1].c,
      asOf: new Date(`${RISING[RISING.length - 1].t.slice(0, 10)}T12:00:00Z`),
    });
    expect(facts.marketTrend).toBeNull();
    expect(facts.averages).toBeNull();
  });
});

describe("intraday alerts against the market's trend", () => {
  it("are shown for study, never offered as a trade", () => {
    expect(tradeHold({ type: "old_level_cross", againstMarketTrend: true })).toBe(AGAINST_MARKET_TREND);
    expect(tradeHold({ type: "old_level_cross" })).toBeNull();
  });
});
