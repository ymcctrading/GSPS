import { describe, expect, it } from "vitest";
import type { ScannedAsset } from "../engine/scanner/types";
import {
  ATR_EXPANSION_FACTOR,
  buildOptionPlay,
  computeLevels,
  decide,
  isAtrExpanding,
  MarketSnapshot,
  MASTER_TARGET_ATR_MULTIPLE,
  scanTicker,
  scoreChecklist,
  simulatedProvider,
  STOP_ATR_MULTIPLE,
  TARGET1_ATR_MULTIPLE,
} from "./scanTicker";

function scannedAsset(overrides: Partial<ScannedAsset> = {}): ScannedAsset {
  return {
    symbol: "TEST",
    score: 9,
    passesStratBarrier: true,
    direction: "bullish",
    relativeVolume: 1.0,
    atrExpansion: false,
    ...overrides,
  };
}

function snapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    symbol: "TEST",
    price: 100,
    previousClose: 100,
    relativeVolume: 1.0,
    atr: 2,
    previousAtr: 2,
    direction: "bullish",
    structuralAgreement: true,
    checklist: Array.from({ length: 9 }, () => true),
    ...overrides,
  };
}

describe("scoreChecklist", () => {
  it("counts confirmed rules", () => {
    expect(scoreChecklist([true, false, true, true])).toBe(3);
  });
  it("clamps to a maximum of 9", () => {
    expect(scoreChecklist(Array.from({ length: 12 }, () => true))).toBe(9);
  });
  it("is 0 for an all-false checklist", () => {
    expect(scoreChecklist([false, false])).toBe(0);
  });
});

describe("isAtrExpanding", () => {
  it("is true only past the expansion factor", () => {
    expect(isAtrExpanding(2 * ATR_EXPANSION_FACTOR, 2)).toBe(true);
    expect(isAtrExpanding(2 * ATR_EXPANSION_FACTOR - 0.001, 2)).toBe(false);
  });
  it("is false when the prior ATR is non-positive", () => {
    expect(isAtrExpanding(5, 0)).toBe(false);
  });
});

describe("computeLevels", () => {
  it("puts stop below and targets above for a bullish reversion", () => {
    const l = computeLevels(100, 2, "bullish");
    expect(l.entry).toBe(100);
    expect(l.stopLoss).toBeCloseTo(100 - STOP_ATR_MULTIPLE * 2);
    expect(l.takeProfit1).toBeCloseTo(100 + TARGET1_ATR_MULTIPLE * 2);
    expect(l.masterProfit).toBeCloseTo(100 + MASTER_TARGET_ATR_MULTIPLE * 2);
  });
  it("mirrors the levels for a bearish reversion", () => {
    const l = computeLevels(100, 2, "bearish");
    expect(l.stopLoss).toBeCloseTo(100 + STOP_ATR_MULTIPLE * 2);
    expect(l.takeProfit1).toBeCloseTo(100 - TARGET1_ATR_MULTIPLE * 2);
    expect(l.masterProfit).toBeCloseTo(100 - MASTER_TARGET_ATR_MULTIPLE * 2);
  });
});

describe("decide", () => {
  it("rejects anything that fails the Strat barrier, regardless of score", () => {
    const d = decide(scannedAsset({ score: 9, passesStratBarrier: false }));
    expect(d.outputState).toBe("Reject");
    expect(d.setupTier).toBeNull();
  });
  it("executes pristine 8/9 setups", () => {
    expect(decide(scannedAsset({ score: 8 })).outputState).toBe("Execute");
    expect(decide(scannedAsset({ score: 9 })).setupTier).toBe("PRISTINE");
  });
  it("watches a score-7 setup only with massive velocity", () => {
    expect(
      decide(scannedAsset({ score: 7, relativeVolume: 2.0 })).outputState,
    ).toBe("Watch");
    expect(
      decide(scannedAsset({ score: 7, atrExpansion: true })).setupTier,
    ).toBe("VELOCITY");
  });
  it("rejects a score-7 setup without velocity", () => {
    expect(
      decide(scannedAsset({ score: 7, relativeVolume: 1.0, atrExpansion: false }))
        .outputState,
    ).toBe("Reject");
  });
  it("rejects sub-7 scores", () => {
    expect(decide(scannedAsset({ score: 6 })).outputState).toBe("Reject");
  });
});

describe("buildOptionPlay", () => {
  it("routes a bullish reversion to a CALL with an upside breakeven", () => {
    const p = buildOptionPlay(100, "bullish", 1.85);
    expect(p.side).toBe("CALL");
    expect(p.breakevenPrice).toBeCloseTo(101.85);
    expect(p.maxRiskPerContract).toBeCloseTo(185);
  });
  it("routes a bearish reversion to a PUT with a downside breakeven", () => {
    const p = buildOptionPlay(100, "bearish", 1.85);
    expect(p.side).toBe("PUT");
    expect(p.breakevenPrice).toBeCloseTo(98.15);
  });
});

describe("scanTicker", () => {
  it("produces an Execute verdict for a pristine, Strat-qualified snapshot", async () => {
    const r = await scanTicker("AAA", undefined, () => snapshot());
    expect(r.score).toBe(9);
    expect(r.passesStratBarrier).toBe(true);
    expect(r.decision.outputState).toBe("Execute");
    expect(r.symbol).toBe("TEST");
  });

  it("attaches an option leg only when a premium is supplied", async () => {
    const withOpt = await scanTicker("AAA", 2.0, () => snapshot());
    expect(withOpt.option?.side).toBe("CALL");
    const without = await scanTicker("AAA", undefined, () => snapshot());
    expect(without.option).toBeUndefined();
  });

  it("uppercases the symbol and carries execution levels through", async () => {
    const r = await scanTicker("aaa", undefined, () =>
      snapshot({ price: 100, atr: 2, direction: "bullish" }),
    );
    expect(r.entry).toBe(100);
    expect(r.stopLoss).toBeCloseTo(97);
  });

  it("awaits an async provider", async () => {
    const r = await scanTicker("AAA", undefined, async () =>
      snapshot({ structuralAgreement: false }),
    );
    expect(r.decision.outputState).toBe("Reject");
  });

  it("simulated provider is deterministic for a given symbol", () => {
    expect(simulatedProvider("NVDA")).toEqual(simulatedProvider("nvda"));
  });
});
