import { describe, expect, it } from "vitest";
import {
  isRestingExecuteRow,
  readResting,
  restingDistanceLabel,
  restingNote,
  splitResting,
  restingInputOfRow,
} from "@/lib/setups/resting";
import { buildDailyCardModel } from "@/lib/setups/card";
import { bestQualifiedSetup } from "@/lib/dashboard/bestPlan";
import { withDailyScanRange } from "@/lib/dashboard/trackedExecute";

// The owner's case, 2026-10-21: AMD at $547.91, a buy entry of $480.46 at a
// crossed old top, every level below price. The day's range is illustrative.
const AMD = {
  symbol: "AMD",
  score: 7,
  outputState: "Execute",
  direction: "bullish",
  entry: 480.46,
  stopLoss: 467.86,
  takeProfit1: 498.39,
  masterProfit: 516.23,
  currentPrice: 547.91,
  dayRange: 18,
};

describe("readResting", () => {
  it("calls a plan resting when price is more than a day's range from the entry", () => {
    const read = readResting({ side: "buy", price: 547.91, entry: 480.46, dayRange: 18, tp1: 498.39, mtp: 516.23 });
    expect(read).not.toBeNull();
    expect(read!.distance).toBeCloseTo(67.45, 2);
    expect(read!.pct).toBeCloseTo(12.31, 2);
    expect(read!.entryIs).toBe("below");
    expect(read!.reaction).toBe(true);
    expect(read!.targetsBehindPrice).toEqual(["TP1", "MTP"]);
    expect(restingDistanceLabel(read!)).toBe("$67.45 (12.3%) below price");
  });

  it("is not resting within a day's range, at exactly a day's range, or with nothing to read", () => {
    expect(readResting({ side: "buy", price: 105, entry: 100, dayRange: 6 })).toBeNull();
    expect(readResting({ side: "buy", price: 106, entry: 100, dayRange: 6 })).toBeNull();
    expect(readResting({ side: "buy", price: 106.01, entry: 100, dayRange: 6 })).not.toBeNull();
    expect(readResting({ side: "buy", price: 200, entry: 100, dayRange: null })).toBeNull();
    expect(readResting({ side: "buy", price: 200, entry: 100, dayRange: 0 })).toBeNull();
    expect(readResting({ side: "buy", price: null, entry: 100, dayRange: 5 })).toBeNull();
    expect(readResting({ side: "buy", price: 200, entry: null, dayRange: 5 })).toBeNull();
  });

  it("mirrors for a sell: an entry above price waits on the rally back", () => {
    const read = readResting({ side: "sell", price: 80, entry: 100, dayRange: 5, tp1: 90, mtp: 70 });
    expect(read!.entryIs).toBe("above");
    expect(read!.reaction).toBe(true);
    // A sell's target is behind price when it sits above it.
    expect(read!.targetsBehindPrice).toEqual(["TP1"]);
  });

  it("an entry beyond price on the trade's own side waits for price to reach it", () => {
    const read = readResting({ side: "buy", price: 100, entry: 120, dayRange: 5, tp1: 130 });
    expect(read!.reaction).toBe(false);
    expect(read!.targetsBehindPrice).toEqual([]);
    expect(restingNote(read!, 120)).toContain("waits for price to reach $120.00, 20.0% above price");
  });

  it("says plainly the plan waits, and that targets below price count only once the entry fills", () => {
    const read = readResting({ side: "buy", price: 547.91, entry: 480.46, dayRange: 18, tp1: 498.39, mtp: 516.23 })!;
    const note = restingNote(read, 480.46);
    expect(note).toContain("waits for a reaction back to $480.46, 12.3% below price");
    expect(note).toContain("not a trade to take today");
    expect(note).toContain("Its TP1 and MTP sit below today's price too");
  });
});

describe("splitResting", () => {
  it("moves only rows scoring at the Execute cutoff whose entry is more than a day's range away, keeping order", () => {
    const near = { ...AMD, symbol: "NEAR", currentPrice: 485 };
    // A Watch below the cutoff stays put; at the cutoff it is the scan's own
    // ready-now hold (2026-10-27), covered below.
    const watchFar = { ...AMD, symbol: "WATCH", outputState: "Watch", score: 6 };
    const noRange = { ...AMD, symbol: "NORANGE", dayRange: null };
    const other = { ...AMD, symbol: "OTHER", currentPrice: 600 };
    const { now, resting } = splitResting([AMD, near, watchFar, noRange, other], (r) => restingInputOfRow(r));
    expect(resting.map((r) => r.symbol)).toEqual(["AMD", "OTHER"]);
    expect(now.map((r) => r.symbol)).toEqual(["NEAR", "WATCH", "NORANGE"]);
    expect(isRestingExecuteRow(AMD)).toBe(true);
    expect(isRestingExecuteRow(near)).toBe(false);
  });
});

describe("the setup card on a resting plan", () => {
  it("replaces the plan sentence's 'not taken here' with the resting note and carries the read", () => {
    const model = buildDailyCardModel(AMD, { scoreText: "7", scoreMax: 9 });
    expect(model.resting).not.toBeNull();
    expect(model.synopsis).toContain("Resting order: it waits for a reaction back to $480.46, 12.3% below price");
    expect(model.synopsis).not.toContain("is not taken here");
  });

  it("keeps the old reaction-buy sentence when price is above the entry but within a day's range", () => {
    const model = buildDailyCardModel({ ...AMD, currentPrice: 490 }, { scoreText: "7", scoreMax: 9 });
    expect(model.resting).toBeNull();
    expect(model.synopsis).toContain("is not taken here");
  });
});

describe("withDailyScanRange", () => {
  it("joins today's price and day's range onto tracked rows by symbol and side only", () => {
    const tracked = {
      symbol: "AMD",
      direction: "bullish",
      patternName: null,
      score: 7,
      outputState: "Execute",
      executeScore: null,
      executeOutputState: null,
      entry: 480.46,
      stopLoss: 467.86,
      takeProfit1: 498.39,
      masterProfit: 516.23,
    };
    const [joined, unmatched] = withDailyScanRange(
      [tracked, { ...tracked, symbol: "MSFT" }],
      [
        { symbol: "AMD", direction: "bullish", currentPrice: 547.91, dayRange: 18 },
        { symbol: "MSFT", direction: "bearish", currentPrice: 400, dayRange: 9 },
      ],
    );
    expect(joined.currentPrice).toBe(547.91);
    expect(joined.dayRange).toBe(18);
    expect(unmatched.dayRange).toBeUndefined();
    expect(isRestingExecuteRow(joined)).toBe(true);
    expect(isRestingExecuteRow(unmatched)).toBe(false);
  });
});

describe("Today's plan on the Novice home", () => {
  it("ranks a resting Execute behind an Execute price is near, alongside Watch", () => {
    const near = { ...AMD, symbol: "NEAR", score: 6, currentPrice: 485 };
    expect(bestQualifiedSetup([AMD, near])?.symbol).toBe("NEAR");
    const watch = { ...AMD, symbol: "WATCH", outputState: "Watch", score: 6, currentPrice: 485 };
    // Both rank as Watch; the higher score wins.
    expect(bestQualifiedSetup([AMD, watch])?.symbol).toBe("AMD");
  });
});

describe("resting rows held at Watch by the scan (2026-10-27)", () => {
  it("lists a Watch at the Execute cutoff as resting, not a lower Watch", () => {
    const base = { direction: "bullish", entry: 184.45, takeProfit1: 199, masterProfit: 215, currentPrice: 206.71, dayRange: 5 };
    const held = { ...base, outputState: "Watch", score: 9 };
    const low = { ...base, outputState: "Watch", score: 6 };
    const { now, resting } = splitResting([held, low], (r) => restingInputOfRow(r));
    expect(resting).toEqual([held]);
    expect(now).toEqual([low]);
  });
});
