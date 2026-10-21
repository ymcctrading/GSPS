/**
 * The nine pillars read the same facts on the live scan and the replay
 * (review-final fix 4). The live scan is run on the synthetic feed with its
 * bars handed in; the replay's context is then built from those same bars at
 * the same moment, and the two surfaces' pillar facts, and the score each set
 * produces, must be identical. A drift in how either surface builds the facts
 * (a missing input, a different chart, a different date) fails here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PillarFacts } from "@/lib/scoring/pillars";
import type { ScoreInputs } from "@/lib/scoring/score";

type FactsInput = Parameters<typeof import("@/lib/scoring/pillars").readPillarFacts>[0];
const seen = vi.hoisted(() => ({
  facts: [] as Array<{ input: unknown; output: unknown }>,
  scores: [] as Array<{ input: unknown; output: unknown }>,
}));

vi.mock("@/lib/scoring/pillars", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scoring/pillars")>("@/lib/scoring/pillars");
  return {
    ...actual,
    readPillarFacts: (input: Parameters<typeof actual.readPillarFacts>[0]) => {
      const output = actual.readPillarFacts(input);
      seen.facts.push({ input, output });
      return output;
    },
  };
});
vi.mock("@/lib/scoring/score", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scoring/score")>("@/lib/scoring/score");
  return {
    ...actual,
    computeScore: (input: Parameters<typeof actual.computeScore>[0]) => {
      const output = actual.computeScore(input);
      seen.scores.push({ input, output });
      return output;
    },
  };
});
// A stored share count, so the capital-stock reading is exercised on both surfaces.
vi.mock("@/lib/data/instrumentReference", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/instrumentReference")>("@/lib/data/instrumentReference");
  return {
    ...actual,
    getInstrumentReference: async (symbol: string) => ({ symbol, sharesOutstanding: 50_000_000, sharesAsOf: null, inception: null }),
  };
});

import { scanTicker } from "@/lib/scanTicker";
import { buildMacroContext } from "@/lib/backtest/replay";
import { fetchAllTimeframes } from "@/lib/data/provider";
import { computeScore, srMatchForSide } from "@/lib/scoring/score";
import { EXECUTION_TIMEFRAME } from "@/lib/timeframe";
import { etDateKey } from "@/lib/market/session";
import { yearCycleConvergence } from "@/lib/gann/timeCycles";
import { yearCycleMonths } from "@/lib/scan/levelCharts";
import { getMarketMonthlyBars } from "@/lib/data/marketBenchmark";

describe("the nine pillars on the live scan and the replay", () => {
  const original = process.env.MARKET_DATA_PROVIDER;
  beforeAll(() => {
    process.env.MARKET_DATA_PROVIDER = "synthetic";
  });
  afterAll(() => {
    process.env.MARKET_DATA_PROVIDER = original;
  });

  it("builds the same pillar facts and the same breakdown from the same bars", async () => {
    const bars = await fetchAllTimeframes("AAPL", "us_equity", EXECUTION_TIMEFRAME);
    seen.facts.length = 0;
    seen.scores.length = 0;
    await scanTicker("AAPL", undefined, undefined, bars);

    const live = seen.facts.at(-1);
    expect(live).toBeDefined();
    const liveIn = live!.input as FactsInput;
    const liveFacts = live!.output as PillarFacts;
    const liveScore = seen.scores.find((s) => (s.input as ScoreInputs).pillarFacts === liveFacts);
    expect(liveScore).toBeDefined();
    // The fixture reads the market comparisons, so the parity is not vacuous.
    expect(liveIn.marketDaily?.length ?? 0).toBeGreaterThan(0);
    // The universe's months are read and the stock is ranked among them (S6).
    expect(liveIn.universe?.strength?.size ?? 0).toBeGreaterThan(0);
    expect(liveFacts.universeRank).not.toBeNull();
    expect(liveFacts.leadership).not.toBeNull();

    // The replay's context at the same moment, from the same bars.
    seen.facts.length = 0;
    const context = buildMacroContext(bars.daily, liveIn.price, liveIn.asOf, bars.monthlyLong ?? bars.monthly, {
      sharesOutstanding: 50_000_000,
      inception: null,
      marketDaily: liveIn.marketDaily,
      monthly: bars.monthly,
      monthlyLong: bars.monthlyLong ?? null,
      marketMonthly: await getMarketMonthlyBars(),
      universe: liveIn.universe,
    }, bars.weekly);
    const replayIn = seen.facts.at(-1)!.input as FactsInput;
    expect(replayIn.daily).toEqual(liveIn.daily);
    expect(replayIn.monthly).toEqual(liveIn.monthly);
    // The weekly and monthly trends, read off the same charts (2026-10-20).
    const liveScoreIn = liveScore!.input as ScoreInputs;
    expect(context.macroTrends).toEqual(liveScoreIn.macroTrends.slice(0, 3));
    expect(context.ruleOfThreeWeekly).toEqual(liveScoreIn.ruleOfThreeWeekly);
    expect(context.ruleOfThreeMonthly).toEqual(liveScoreIn.ruleOfThreeMonthly);
    expect(context.pillarFacts).toEqual(liveFacts);

    // The same score from either surface's facts.
    const input = liveScore!.input as ScoreInputs;
    const fromReplay = computeScore({ ...input, pillarFacts: context.pillarFacts });
    const liveOut = liveScore!.output as ReturnType<typeof computeScore>;
    expect(fromReplay.breakdown).toEqual(liveOut.breakdown);
    expect(fromReplay.score).toBe(liveOut.score);
  }, 60_000);

  it("scores completed sessions only, so an unclosed session bar changes nothing the replay would not see", async () => {
    const bars = await fetchAllTimeframes("AAPL", "us_equity", EXECUTION_TIMEFRAME);
    const today = etDateKey(new Date());
    const sessions = bars.daily.filter((b) => b.t.slice(0, 10) < today);
    const last = sessions[sessions.length - 1];
    // Today's session, still trading: a wide range on heavy volume, the kind
    // of bar that moves a swing chart, an angle anchor, a climax and the ATR.
    const unclosed = {
      t: `${today}T04:00:00.000Z`,
      o: last.c,
      h: last.c * 1.25,
      l: last.c * 0.75,
      c: last.c * 1.2,
      v: last.v * 40,
    };
    const live = { ...bars, daily: [...sessions, unclosed] };
    seen.facts.length = 0;
    seen.scores.length = 0;
    await scanTicker("AAPL", undefined, undefined, live);
    const liveFacts = seen.facts.at(-1)!;
    const liveIn = liveFacts.input as FactsInput;
    const liveScore = seen.scores.find((s) => (s.input as ScoreInputs).pillarFacts === liveFacts.output);
    expect(liveScore).toBeDefined();
    const input = liveScore!.input as ScoreInputs;

    // The replay at that session: the completed sessions before it, read at noon.
    const context = buildMacroContext(sessions, liveIn.price, new Date(`${today}T12:00:00Z`), bars.monthlyLong ?? bars.monthly, {
      sharesOutstanding: 50_000_000,
      inception: null,
      marketDaily: liveIn.marketDaily,
      monthly: bars.monthly,
      monthlyLong: bars.monthlyLong ?? null,
      marketMonthly: await getMarketMonthlyBars(),
      universe: liveIn.universe,
    }, bars.weekly);

    // Each daily read the score takes, one by one, so a failure names it.
    expect(input.swingChart).toEqual(context.swingChart);
    expect(input.campaignLeg).toEqual(context.campaignLeg);
    expect(input.ruleOfThree).toEqual(context.ruleOfThree);
    expect(input.timePriceSquare).toEqual(context.timePriceSquare);
    expect(input.volumeClimax).toEqual(context.volumeClimax);
    expect(input.boilingPoint).toEqual(context.boilingPoint);
    // The yearly cycles are read off the closed months at the session's noon,
    // as the replay tags its trades (`yearCycleHitsAt`), not off the provider's
    // month in progress at the wall clock.
    const noon = new Date(`${today}T12:00:00Z`);
    const yearCycles = yearCycleConvergence(yearCycleMonths(bars.monthlyLong ?? bars.monthly, today), noon);
    expect(input.gann.yearCycleBullishHits).toBe(yearCycles.bullishHits);
    expect(input.gann.yearCycleBearishHits).toBe(yearCycles.bearishHits);
    expect({ ...input.gann, yearCycleBullishHits: undefined, yearCycleBearishHits: undefined }).toEqual(context.gann);
    expect(input.momentumElevated).toBe(context.momentumElevated);
    expect(input.atrPct).toBe(context.atrPct);
    expect(input.nearSupportResistance).toBe(context.nearSupportResistance);
    // The S/R level of the score's own role, picked the same way (2026-10-21).
    expect(input.srMatch).toEqual(srMatchForSide(context.srMatches, input.direction));    // The monthly, weekly and daily trends are read off the same level charts
    // on both: the provider's closed months and weeks, with the bar in
    // progress built from completed sessions (2026-10-20). Before this the
    // replay rolled its weeks up from daily bars and read a different chart.
    expect(input.macroTrends[0]).toEqual(context.macroTrends[0]);
    expect(input.macroTrends[1]).toEqual(context.macroTrends[1]);
    expect(input.macroTrends[2]).toEqual(context.macroTrends[2]);
    expect(input.ruleOfThreeWeekly).toEqual(context.ruleOfThreeWeekly);
    expect(input.ruleOfThreeMonthly).toEqual(context.ruleOfThreeMonthly);

    // And the breakdown the replay's reads produce is the live one.
    const fromReplay = computeScore({
      ...input,
      swingChart: context.swingChart,
      campaignLeg: context.campaignLeg,
      ruleOfThree: context.ruleOfThree,
      ruleOfThreeWeekly: context.ruleOfThreeWeekly,
      ruleOfThreeMonthly: context.ruleOfThreeMonthly,
      timePriceSquare: context.timePriceSquare,
      volumeClimax: context.volumeClimax,
      boilingPoint: context.boilingPoint,
      gann: context.gann,
      nearSupportResistance: context.nearSupportResistance,
      srMatch: srMatchForSide(context.srMatches, input.direction),
      momentumElevated: context.momentumElevated,
      atrPct: context.atrPct,
      pillarFacts: context.pillarFacts,
    });
    const liveOut = liveScore!.output as ReturnType<typeof computeScore>;
    expect(fromReplay.breakdown).toEqual(liveOut.breakdown);
    expect(fromReplay.score).toBe(liveOut.score);
  }, 60_000);

  it("counts the yearly cycles on closed months reaching ten years back, the month in progress left out", () => {
    const month = (t: string) => ({ t: `${t}-01T05:00:00.000Z`, o: 1, h: 1, l: 1, c: 1, v: 1 });
    const months = ["2016-09", "2016-10", "2020-01", "2026-09", "2026-10"].map(month);
    expect(yearCycleMonths(months, "2026-10-20").map((b) => b.t.slice(0, 7))).toEqual(["2016-10", "2020-01", "2026-09"]);
  });

  it("hands the replay the provider's weekly bars on both replay paths", () => {
    const src = (f: string) => readFileSync(path.resolve(__dirname, "../../", f), "utf8");
    expect(src("backtest/run.ts")).toMatch(/weeklyBars: series\.weekly,/);
    expect(src("backtest/replay.ts")).toMatch(/buildMacroContext\(priorSessions, price, new Date\(`\$\{date\}T12:00:00Z`\), priorMonthly, facts, priorWeekly\)/);
  });

  it("hands computeScore the pillar facts, and the window turn only to the time-window hold, on both surfaces", () => {
    const src = (f: string) => readFileSync(path.resolve(__dirname, "../../", f), "utf8");
    expect(src("scanTicker.ts")).toMatch(/universe: assetClass === "us_equity" \? \{ symbol, strength: universeStrength \} : null,/);
    expect(src("scanTicker.ts")).toMatch(/\n\s+pillarFacts,\n\s+\}\), breakaway\)/);
    expect(src("scanTicker.ts")).toMatch(/\n\s+setupKind,\n\s+windowTurn,\n/);
    expect(src("backtest/replay.ts")).toMatch(/universe: instrument\?\.universe \?\? null, price, asOf \}\)/);
    expect(src("backtest/replay.ts")).toMatch(/universe: universeStrength && assetClass === "us_equity" \? \{ symbol, strength: universeStrength \} : null,/);
    // Both replay paths hand the replay the universe's months (S6).
    expect(src("backtest/run.ts")).toMatch(/replaySeriesOptions\(series, market, universeStrength\)/);
    expect(src("../scripts/backtest-universe.mjs")).toMatch(/run\.replaySeriesOptions\(series, market, universeStrength\)/);
    expect(src("backtest/replay.ts")).toMatch(/pillarFacts: context\.pillarFacts,\n\s+\.\.\.\(weights/);
    expect(src("backtest/replay.ts")).toMatch(/setupKind, \(\) => context\.windowTurn\(gannTrigger\.direction\)\)/);
  });

  it("puts gannMasterLevels (the 144 square, planetary, angles, Jensen, nine-square crosses) into the S/R list on both surfaces", () => {
    // The Square of Nine's cross numbers (C-LEVELS-15, 2026-10-21) are added
    // inside gannMasterLevels, so one call on each surface carries them.
    const live = readFileSync(path.resolve(__dirname, "../../", "scanTicker.ts"), "utf8");
    const replay = readFileSync(path.resolve(__dirname, "../../", "backtest/replay.ts"), "utf8");
    expect(live).toMatch(/\.\.\.gannMasterLevels\(\[\.\.\.charts\.monthly, \.\.\.charts\.daily\], charts\.daily, currentPrice, sessionNoon\)/);
    expect(replay).toMatch(/\.\.\.gannMasterLevels\(\[\.\.\.monthly, \.\.\.charts\.daily\], charts\.daily, price, asOf\)/);
    const master = readFileSync(path.resolve(__dirname, "../../", "gann/masterLevels.ts"), "utf8");
    expect(master).toMatch(/squareOfNinePriceLevels\(price, unit\)/);
  });

  it("reads every dated read at the session's noon UTC on the live scan, as the replay does (F-03)", () => {
    // After 8 PM New York time the wall clock's UTC date is tomorrow, and on a
    // month's last evening it reads the month in progress as closed.
    const src = readFileSync(path.resolve(__dirname, "../../", "scanTicker.ts"), "utf8");
    expect(src).toMatch(/const sessionNoon = new Date\(`\$\{sessionDay\}T12:00:00Z`\);/);
    expect(src).not.toMatch(/asOf: new Date\(scannedAt\)/);
    expect(src).toMatch(/readDisclosedRules\(charts\.daily, currentPrice, instrumentFacts, sessionNoon, new Date\(\)\)/);
    for (const read of ["readCampaignBottoms", "gannMasterLevels", "readDistributionStanding"]) {
      const call = src.slice(src.indexOf(`${read}(`), src.indexOf(`${read}(`) + 160);
      expect(call).toMatch(/sessionNoon\)/);
    }
  });
});
