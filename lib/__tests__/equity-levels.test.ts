import { describe, expect, it } from "vitest";
import {
  computeEquityTradeLevels,
  EQUITY_FALLBACK_STOP_PCT,
  EQUITY_LARGE_CAP_FALLBACK_STOP_PCT,
  EQUITY_LARGE_CAP_STOP_MAX_PCT,
  EQUITY_STOP_BUFFER_PCT,
  EQUITY_STOP_MAX_PCT,
  EQUITY_STOP_MIN_PCT,
  EQUITY_TP1_MAX_PCT,
  EQUITY_TP1_MIN_PCT,
  EQUITY_TP2_MAX_PCT,
  EQUITY_TP2_MIN_PCT,
} from "@/lib/strat/levels";

describe("computeEquityTradeLevels", () => {
  it("anchors the stop to the nearest support level within band, on a long", () => {
    const entry = 100;
    // 5% below entry — inside [3%, 15%].
    const result = computeEquityTradeLevels({
      direction: "bullish",
      entry,
      structuralLevels: [95, 70, 130],
    });
    expect(result.stopFromStructure).toBe(true);
    // Stop sits the buffer beyond the level, not on it.
    const expectedStop = 95 * (1 - EQUITY_STOP_BUFFER_PCT / 100);
    expect(result.stopLoss).toBeCloseTo(expectedStop, 1);
    expect(result.stopLoss).toBeLessThan(95);
  });

  it("anchors the stop to the nearest resistance level within band, on a short", () => {
    const entry = 100;
    const result = computeEquityTradeLevels({
      direction: "bearish",
      entry,
      structuralLevels: [105, 130, 90],
    });
    expect(result.stopFromStructure).toBe(true);
    expect(result.stopLoss).toBeGreaterThan(105);
  });

  it("falls back to the fixed percentage when no level lands inside the band", () => {
    const entry = 100;
    const result = computeEquityTradeLevels({
      direction: "bullish",
      entry,
      // 1% away (too tight) and 25% away (too far) — neither qualifies.
      structuralLevels: [99, 75],
    });
    expect(result.stopFromStructure).toBe(false);
    const expectedStop = entry * (1 - EQUITY_FALLBACK_STOP_PCT / 100);
    expect(result.stopLoss).toBeCloseTo(expectedStop, 5);
  });

  it("falls back to the fixed percentage when there are no levels at all", () => {
    const entry = 100;
    const result = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels: [] });
    expect(result.stopFromStructure).toBe(false);
    expect(result.stopLoss).toBeCloseTo(entry * (1 - EQUITY_FALLBACK_STOP_PCT / 100), 5);
  });

  it("ignores a level on the wrong side of entry for the trade direction", () => {
    const entry = 100;
    // 95 is below entry (a resistance candidate, not support) for a bullish trade's stop.
    const result = computeEquityTradeLevels({
      direction: "bullish",
      entry,
      structuralLevels: [105], // above entry — not a valid long stop anchor
    });
    expect(result.stopFromStructure).toBe(false);
  });

  it("clamps the ATR-scaled TP1/TP2 percentages to their floors and ceilings", () => {
    const entry = 100;
    // Extremely low ATR% should clamp up to the minimum, not collapse toward 0.
    const low = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels: [], atrPct: 0.01 });
    expect(low.takeProfit1).toBeCloseTo(entry * (1 + EQUITY_TP1_MIN_PCT / 100), 5);

    // Extremely high ATR% should clamp down to the ceiling, not run away.
    const high = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels: [], atrPct: 50 });
    expect(high.takeProfit1).toBeCloseTo(entry * (1 + EQUITY_TP1_MAX_PCT / 100), 5);
    expect(high.takeProfit2).toBeCloseTo(entry * (1 + EQUITY_TP2_MAX_PCT / 100), 5);
  });

  it("scales TP1/TP2 with a mid-range ATR% between the floor and ceiling", () => {
    const entry = 100;
    const atrPct = 3; // 2.0x -> 6% (inside [3,15]); 3.5x -> 10.5% (inside [6,25])
    const result = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels: [], atrPct });
    expect(result.takeProfit1).toBeCloseTo(entry * 1.06, 5);
    expect(result.takeProfit2).toBeCloseTo(entry * 1.105, 5);
  });

  it("extends the runner to a real structural level beyond TP2 but inside the cap", () => {
    const entry = 100;
    const atrPct = 3; // TP2 raw target lands at 110.5
    const structuralLevels = [95, 115]; // 115 is beyond TP2, inside the 30% cap (130)
    const result = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels, atrPct });
    expect(result.masterFromStructure).toBe(true);
    expect(result.takeProfit2).toBe(115);
  });

  it("does not extend the runner to a level beyond the master cap", () => {
    const entry = 100;
    const atrPct = 3;
    const structuralLevels = [95, 200]; // 200 is far beyond the 30% cap (130)
    const result = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels, atrPct });
    expect(result.masterFromStructure).toBe(false);
    expect(result.takeProfit2).toBeCloseTo(entry * 1.105, 5);
  });

  it("mirrors every computation correctly for a bearish (short) trade", () => {
    const entry = 100;
    const atrPct = 3;
    const result = computeEquityTradeLevels({ direction: "bearish", entry, structuralLevels: [110], atrPct });
    expect(result.takeProfit1).toBeLessThan(entry);
    expect(result.takeProfit2).toBeLessThan(result.takeProfit1);
    expect(result.stopLoss).toBeGreaterThan(entry);
  });

  // 2026-09-15: stopRoom's us_equity branch measured 98-99.5% saturated on
  // every real unconditioned run (lib/validation/criteria-registry.ts's
  // `stopRoom` entry) because nearestStructuralStop was searching Gann
  // targets pooled in with S/R. structuralLevels now feeds the stop alone;
  // extensionLevels (defaulting to structuralLevels) feeds the runner.
  it("does not anchor the stop to a level that is only in extensionLevels", () => {
    const entry = 100;
    // 95 is 5% away (inside the stop band) but only offered via extensionLevels.
    const result = computeEquityTradeLevels({
      direction: "bullish",
      entry,
      structuralLevels: [],
      extensionLevels: [95],
    });
    expect(result.stopFromStructure).toBe(false);
  });

  it("still extends the runner to a level offered only via extensionLevels", () => {
    const entry = 100;
    const atrPct = 3; // TP2 raw target lands at 110.5
    const result = computeEquityTradeLevels({
      direction: "bullish",
      entry,
      structuralLevels: [], // no S/R for the stop
      extensionLevels: [115], // Gann-only target beyond TP2, inside the 30% cap
      atrPct,
    });
    expect(result.stopFromStructure).toBe(false);
    expect(result.masterFromStructure).toBe(true);
    expect(result.takeProfit2).toBe(115);
  });

  it("defaults extensionLevels to structuralLevels when omitted, unchanged from before the split", () => {
    const entry = 100;
    const atrPct = 3;
    const structuralLevels = [95, 115];
    const result = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels, atrPct });
    expect(result.stopFromStructure).toBe(true);
    expect(result.masterFromStructure).toBe(true);
    expect(result.takeProfit2).toBe(115);
  });

  it("keeps the stop-placement band consistent with the exported min/max constants", () => {
    expect(EQUITY_STOP_MIN_PCT).toBeLessThan(EQUITY_STOP_MAX_PCT);
    expect(EQUITY_TP1_MIN_PCT).toBeLessThan(EQUITY_TP1_MAX_PCT);
    expect(EQUITY_TP2_MIN_PCT).toBeLessThan(EQUITY_TP2_MAX_PCT);
    expect(EQUITY_TP1_MAX_PCT).toBeLessThan(EQUITY_TP2_MAX_PCT);
  });

  // 2026-09-11: the percent model's own equivalent of the R-based large-cap
  // widening (LARGE_CAP_LEEWAY_ATR/LARGE_CAP_MAX_STOP_ATR_MULTIPLE), which
  // became dead code the moment `us_equity` started routing here — see
  // EQUITY_LARGE_CAP_STOP_MAX_PCT's own comment for why the same underlying
  // reasoning ("a stop this tight on a mega-cap gets clipped by ordinary
  // noise") still needed a home.
  describe("large-cap widening", () => {
    it("accepts a structural level for a large-cap stock that an ordinary stock would reject", () => {
      const entry = 100;
      // 18% away: inside the large-cap ceiling (20%), outside the ordinary one (15%).
      const structuralLevels = [82];
      const ordinary = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels });
      const largeCap = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels, largeCap: true });
      expect(ordinary.stopFromStructure).toBe(false);
      expect(largeCap.stopFromStructure).toBe(true);
    });

    it("widens the fallback stop for a large-cap stock with no structural level in range", () => {
      const entry = 100;
      const ordinary = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels: [] });
      const largeCap = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels: [], largeCap: true });
      expect(ordinary.stopLoss).toBeCloseTo(entry * (1 - EQUITY_FALLBACK_STOP_PCT / 100), 5);
      expect(largeCap.stopLoss).toBeCloseTo(entry * (1 - EQUITY_LARGE_CAP_FALLBACK_STOP_PCT / 100), 5);
      expect(largeCap.stopLoss).toBeLessThan(ordinary.stopLoss);
    });

    it("does not widen the floor — a level too close is rejected the same way for both", () => {
      const entry = 100;
      const structuralLevels = [99]; // 1% away — under even the ordinary 3% floor
      const ordinary = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels });
      const largeCap = computeEquityTradeLevels({ direction: "bullish", entry, structuralLevels, largeCap: true });
      expect(ordinary.stopFromStructure).toBe(false);
      expect(largeCap.stopFromStructure).toBe(false);
    });

    it("keeps the large-cap band wider than the ordinary one", () => {
      expect(EQUITY_LARGE_CAP_STOP_MAX_PCT).toBeGreaterThan(EQUITY_STOP_MAX_PCT);
      expect(EQUITY_LARGE_CAP_FALLBACK_STOP_PCT).toBeGreaterThan(EQUITY_FALLBACK_STOP_PCT);
    });
  });
});
