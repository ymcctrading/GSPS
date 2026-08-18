/**
 * The card replaces a score and four price levels with two sentences, so the
 * sentences carry the whole explanation. A short is where wording goes wrong
 * quietly: "sold off into support and turning back up" describes the opposite
 * trade, and a novice reading it has no levels on screen to catch the mistake.
 */

import { describe, expect, it } from "vitest";
import type { ScanResult, TradeLevels } from "@/lib/types";
import { exitSentence, reasonLine, riskRewardSentence } from "@/lib/guided/copy";

const longLevels: TradeLevels = {
  entry: 100, stopLoss: 98, takeProfit1: 103, takeProfit2: 105, masterProfit: 105,
  riskPerShare: 2, rewardToRiskTp1: 1.5, rewardToRiskTp2: 2.5, rewardToRiskMaster: 2.5,
  masterFromStructure: true, stopPctOfPrice: 2, stopBandWarning: null,
};

function scan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    symbol: "AAPL",
    assetClass: "us_equity",
    scannedAt: new Date().toISOString(),
    currentPrice: 100,
    direction: "bullish",
    setupKind: "reversion",
    momentumElevated: true,
    trends: [],
    gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
    pattern: { name: "2-1-2", direction: "bullish", triggerPrice: 100, stopPrice: 98, description: "" },
    armedPatterns: [],
    levels: longLevels,
    decision: { score: 8, outputState: "Execute", breakdown: [] },
    ...overrides,
  };
}

describe("reasonLine", () => {
  it("describes a long reversion as a bounce off support", () => {
    const line = reasonLine(scan());
    expect(line).toMatch(/sold off/);
    expect(line).toMatch(/turning back up/);
  });

  it("describes a short reversion as a rejection at resistance, not an inverted long", () => {
    const line = reasonLine(scan({ direction: "bearish" }));
    expect(line).toMatch(/run up/);
    expect(line).toMatch(/rolling back down/);
    // The long's words must not survive into the short's sentence.
    expect(line).not.toMatch(/turning back up/);
    expect(line).not.toMatch(/stopped declines/);
  });

  it("describes a short continuation as a downtrend breaking lower", () => {
    const line = reasonLine(scan({ direction: "bearish", setupKind: "continuation" }));
    expect(line).toMatch(/trending down/);
    expect(line).not.toMatch(/trending up/);
  });
});

describe("exitSentence", () => {
  it("says a long is sold and its stop trails up", () => {
    const s = exitSentence(6, 10, "buy");
    expect(s).toMatch(/sold at the first target/);
    expect(s).toMatch(/moved up behind/);
  });

  it("says a short is bought back and its stop trails down", () => {
    const s = exitSentence(6, 10, "sell");
    expect(s).toMatch(/bought back at the first target/);
    expect(s).toMatch(/moved down behind/);
    expect(s).not.toMatch(/moved up behind/);
  });
});

describe("riskRewardSentence", () => {
  it("reads the same on either side, because both figures arrive already signed", () => {
    expect(riskRewardSentence(12, 31)).toContain("lose about $12");
    expect(riskRewardSentence(12, 31)).toContain("make about $31");
  });
});
