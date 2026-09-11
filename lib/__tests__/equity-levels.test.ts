import { describe, expect, it } from "vitest";
import {
  computeEquityTradeLevels,
  EQUITY_FALLBACK_STOP_PCT,
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

  it("keeps the stop-placement band consistent with the exported min/max constants", () => {
    expect(EQUITY_STOP_MIN_PCT).toBeLessThan(EQUITY_STOP_MAX_PCT);
    expect(EQUITY_TP1_MIN_PCT).toBeLessThan(EQUITY_TP1_MAX_PCT);
    expect(EQUITY_TP2_MIN_PCT).toBeLessThan(EQUITY_TP2_MAX_PCT);
    expect(EQUITY_TP1_MAX_PCT).toBeLessThan(EQUITY_TP2_MAX_PCT);
  });
});
