/**
 * An outdated plan expires, the stock stays tracked (owner, 2026-10-28;
 * `lib/gann/planExpiry.ts`, `applyPlanExpiredHold`).
 */
import { describe, expect, it } from "vitest";
import type { Bar, ScanDecision } from "@/lib/types";
import type { CampaignLedger } from "@/lib/gann/campaignLedger";
import { campaignExtreme, readPlanExpiry } from "@/lib/gann/planExpiry";
import { applyPlanExpiredHold } from "@/lib/scoring/score";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";
import { isInvalidated } from "@/lib/dailyScans";
import { pricePoint } from "@/lib/gann/pointScale";

const bar = (i: number, h: number, l: number): Bar => ({
  t: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
  o: (h + l) / 2,
  h,
  l,
  c: (h + l) / 2,
  v: 1_000_000,
});

// A bull campaign: up to 130 (bar 5), a 10-point reaction to 120 (bar 8),
// then on to a top of 150 (bar 12), now 146.
const highs = [101, 108, 115, 122, 127, 130, 126, 123, 121, 128, 136, 144, 150, 148, 147];
const bars = highs.map((h, i) => bar(i, h, h - 2));
const ledger = {
  trend: "bullish",
  legs: [
    { direction: "up", fromIndex: 0, toIndex: 5, points: 31, pct: 31, days: 5 },
    { direction: "down", fromIndex: 5, toIndex: 8, points: 10, pct: 7.7, days: 3 },
    { direction: "up", fromIndex: 8, toIndex: 12, points: 31, pct: 26, days: 4 },
  ],
  greatestCounterMove: { points: 10, pct: 7.7, days: 3 },
} as unknown as CampaignLedger;

const decision = (outputState: ScanDecision["outputState"], score: number): ScanDecision => ({ score, outputState, breakdown: [] });

describe("readPlanExpiry: the first target passed", () => {
  it("expires WAT's buy of 2026-10-28, price past TP1 and MTP", () => {
    const e = readPlanExpiry({ side: "buy", price: 468.39, levels: { entry: 395.23, takeProfit1: 418.92, masterProfit: 447 } });
    expect(e?.reason).toBe("target_passed");
    expect(e?.note).toContain("$418.92");
  });

  it("expires PINS's sell, price under its TP1", () => {
    expect(readPlanExpiry({ side: "sell", price: 20.56, levels: { entry: 25.72, takeProfit1: 23.42 } })?.reason).toBe("target_passed");
  });

  it("counts price exactly at TP1 as passed", () => {
    expect(readPlanExpiry({ side: "buy", price: 110, levels: { entry: 100, takeProfit1: 110 } })?.reason).toBe("target_passed");
  });

  it("leaves a plan whose TP1 is still ahead", () => {
    expect(readPlanExpiry({ side: "buy", price: 105, levels: { entry: 100, takeProfit1: 110 } })).toBeNull();
    expect(readPlanExpiry({ side: "sell", price: 95, levels: { entry: 100, takeProfit1: 90 } })).toBeNull();
  });

  it("knows nothing without a price or levels", () => {
    expect(readPlanExpiry({ side: "buy", price: null, levels: { entry: 100, takeProfit1: 110 } })).toBeNull();
    expect(readPlanExpiry({ side: "buy", price: 105, levels: null })).toBeNull();
    expect(readPlanExpiry({ side: "buy", price: Number.NaN, levels: { entry: 100, takeProfit1: 110 } })).toBeNull();
  });
});

describe("readPlanExpiry: out of a reaction's reach", () => {
  it("reads the campaign's latest top since its last reaction", () => {
    expect(campaignExtreme(ledger, bars)).toBe(150);
  });

  it("expires a buy that only a reaction over the greatest by a point could fill", () => {
    // From 150 to 120 is 30 points against a greatest reaction of 10.
    const e = readPlanExpiry({ side: "buy", price: 146, levels: { entry: 120, takeProfit1: 160, entryKind: "crossing" }, ledger, bars });
    expect(e?.reason).toBe("beyond_reaction");
    expect(e?.reactionNeeded).toBe(30);
    expect(e?.greatestReaction).toBe(10);
  });

  it("keeps a buy a normal reaction reaches", () => {
    expect(readPlanExpiry({ side: "buy", price: 146, levels: { entry: 142, takeProfit1: 160, entryKind: "crossing" }, ledger, bars })).toBeNull();
  });

  it("needs the full point beyond the greatest", () => {
    const point = pricePoint(150);
    const justUnder = 150 - (10 + point) + 0.01;
    expect(readPlanExpiry({ side: "buy", price: 146, levels: { entry: justUnder, takeProfit1: 160, entryKind: "crossing" }, ledger, bars })).toBeNull();
    const at = 150 - (10 + point) - 0.01;
    expect(readPlanExpiry({ side: "buy", price: 146, levels: { entry: at, takeProfit1: 160, entryKind: "crossing" }, ledger, bars })?.reason).toBe("beyond_reaction");
  });

  it("does not read a buy at an old bottom, whose double-bottom test is the buy", () => {
    expect(readPlanExpiry({ side: "buy", price: 146, levels: { entry: 120, takeProfit1: 160, entryKind: "oldLevel" }, ledger, bars })).toBeNull();
  });

  it("does not read a plan against the campaign's trend", () => {
    // A sell above price in a bull campaign is a rally with the trend, not a reaction.
    expect(readPlanExpiry({ side: "sell", price: 146, levels: { entry: 190, takeProfit1: 130, entryKind: "crossing" }, ledger, bars })).toBeNull();
  });

  it("does not read an entry on the far side of price (a crossing still to come)", () => {
    expect(readPlanExpiry({ side: "buy", price: 146, levels: { entry: 152, takeProfit1: 170, entryKind: "crossing" }, ledger, bars })).toBeNull();
  });

  it("does not read a campaign with no completed reaction", () => {
    const young = { ...ledger, greatestCounterMove: null } as CampaignLedger;
    expect(readPlanExpiry({ side: "buy", price: 146, levels: { entry: 100, takeProfit1: 160, entryKind: "crossing" }, ledger: young, bars })).toBeNull();
  });

  it("mirrors for a sell in a bear campaign", () => {
    const lows = highs.map((h) => 250 - h);
    const bearBars = lows.map((l, i) => bar(i, l + 2, l));
    const bear = {
      ...ledger,
      trend: "bearish",
      legs: [
        { direction: "down", fromIndex: 0, toIndex: 5, points: 31, pct: 20, days: 5 },
        { direction: "up", fromIndex: 5, toIndex: 8, points: 10, pct: 8, days: 3 },
        { direction: "down", fromIndex: 8, toIndex: 12, points: 31, pct: 24, days: 4 },
      ],
    } as unknown as CampaignLedger;
    expect(campaignExtreme(bear, bearBars)).toBe(100);
    expect(readPlanExpiry({ side: "sell", price: 104, levels: { entry: 130, takeProfit1: 90, entryKind: "crossing" }, ledger: bear, bars: bearBars })?.reason).toBe("beyond_reaction");
    expect(readPlanExpiry({ side: "sell", price: 104, levels: { entry: 108, takeProfit1: 90, entryKind: "crossing" }, ledger: bear, bars: bearBars })).toBeNull();
  });
});

describe("applyPlanExpiredHold", () => {
  const expiry = readPlanExpiry({ side: "buy", price: 468.39, levels: { entry: 395.23, takeProfit1: 418.92 } });

  it("leaves a decision with nothing expired", () => {
    const d = decision("Execute", 9);
    expect(applyPlanExpiredHold(d, null)).toBe(d);
  });

  it("drops an Execute or a Watch to Reject, score untouched, and the card says why", () => {
    for (const state of ["Execute", "Watch"] as const) {
      const out = applyPlanExpiredHold(decision(state, 8), expiry);
      expect(out.outputState).toBe("Reject");
      expect(out.score).toBe(8);
      expect(toPublicScoreSummary(out).stateNote).toBe(expiry!.note);
    }
  });

  it("gives a Reject its reason too", () => {
    const out = applyPlanExpiredHold(decision("Reject", 2), expiry);
    expect(out.outputState).toBe("Reject");
    expect(out.breakdown.some((b) => b.key === "planExpired")).toBe(true);
  });

  it("leaves a retired plan with its own reason", () => {
    const retired: ScanDecision = {
      score: 7,
      outputState: "Reject",
      breakdown: [{ key: "stopBreach", criterion: "Plan's stop still intact", passed: false, note: "broken" }],
    };
    expect(applyPlanExpiredHold(retired, expiry)).toBe(retired);
  });

  it("names no method, rule or figure in what the reader sees", () => {
    const disclosed = new RegExp(["gann", "jensen", "dewey", "herm" + "etic", "cycle", "balance", "campaign", "\\d+ points?"].join("|"), "i");
    const beyond = readPlanExpiry({ side: "buy", price: 146, levels: { entry: 120, takeProfit1: 160, entryKind: "crossing" }, ledger, bars });
    for (const e of [expiry, beyond]) expect(e!.note).not.toMatch(disclosed);
  });
});

describe("the daily lists drop a stored row whose TP1 price had passed", () => {
  const row = { direction: "bullish" as const, stop_loss: 380, take_profit_1: 418.92 };
  it("drops it at the scan-time price", () => {
    expect(isInvalidated({ ...row, detail: { currentPrice: 468.39 } })).toBe(true);
  });
  it("keeps one with TP1 ahead", () => {
    expect(isInvalidated({ ...row, detail: { currentPrice: 400 } })).toBe(false);
  });
});
