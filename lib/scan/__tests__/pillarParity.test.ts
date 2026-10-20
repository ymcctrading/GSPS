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
import { computeScore } from "@/lib/scoring/score";
import { EXECUTION_TIMEFRAME } from "@/lib/timeframe";

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
    expect(liveIn.marketMonthly?.length ?? 0).toBeGreaterThan(0);
    expect(liveFacts.monthlyStrength).not.toBeNull();
    expect(liveFacts.leadership).not.toBeNull();

    // The replay's context at the same moment, from the same bars.
    seen.facts.length = 0;
    const context = buildMacroContext(bars.daily, liveIn.price, liveIn.asOf, bars.monthlyLong ?? bars.monthly, {
      sharesOutstanding: 50_000_000,
      inception: null,
      marketDaily: liveIn.marketDaily,
      monthly: bars.monthly,
      monthlyLong: bars.monthlyLong ?? null,
      marketMonthly: liveIn.marketMonthly,
    });
    const replayIn = seen.facts.at(-1)!.input as FactsInput;
    expect(replayIn.daily).toEqual(liveIn.daily);
    expect(replayIn.monthly).toEqual(liveIn.monthly);
    expect(context.pillarFacts).toEqual(liveFacts);

    // The same score from either surface's facts.
    const input = liveScore!.input as ScoreInputs;
    const direction = input.direction === "bearish" ? "bearish" : "bullish";
    const fromReplay = computeScore({ ...input, pillarFacts: context.pillarFacts, windowTurn: () => context.windowTurn(direction) });
    const liveOut = liveScore!.output as ReturnType<typeof computeScore>;
    expect(fromReplay.breakdown).toEqual(liveOut.breakdown);
    expect(fromReplay.score).toBe(liveOut.score);
  }, 60_000);

  it("hands computeScore the pillar facts and the window turn on both surfaces", () => {
    const src = (f: string) => readFileSync(path.resolve(__dirname, "../../", f), "utf8");
    expect(src("scanTicker.ts")).toMatch(/marketMonthly: marketMonthly \?\? null,/);
    expect(src("scanTicker.ts")).toMatch(/\n\s+pillarFacts,\n\s+windowTurn,\n/);
    expect(src("backtest/replay.ts")).toMatch(/marketMonthly: instrument\?\.marketMonthly \?\? null, price, asOf \}\)/);
    expect(src("backtest/replay.ts")).toMatch(/pillarFacts: context\.pillarFacts,\n\s+windowTurn: \(\) => context\.windowTurn\(gannTrigger\.direction\),/);
  });
});
