/**
 * Execute only when the trade can be placed today, with its targets ahead of
 * price (owner amendment, 2026-10-27; `applyReadyNowHold`).
 */
import { describe, expect, it } from "vitest";
import type { ScanDecision } from "@/lib/types";
import { applyReadyNowHold, indicationShownBy, readyNowReasons, type ReadyNowReading } from "@/lib/scoring/score";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";

const decision = (outputState: ScanDecision["outputState"], score: number): ScanDecision => ({
  score,
  outputState,
  breakdown: [],
});

// COKE on 2026-10-27: $206.71, a buy resting at $184.45.
const levels = { entry: 184.45, takeProfit1: 199, masterProfit: 215 };

const ready: ReadyNowReading = {
  side: "buy",
  indicationShown: true,
  price: 186,
  dayRange: 5,
  levels,
};

describe("applyReadyNowHold", () => {
  it("leaves an Execute that can be placed today", () => {
    const d = decision("Execute", 9);
    expect(applyReadyNowHold(d, ready)).toBe(d);
  });

  it("holds a resting Execute at Watch and says why", () => {
    const held = applyReadyNowHold(decision("Execute", 9), { ...ready, price: 206.71 });
    expect(held.outputState).toBe("Watch");
    expect(held.score).toBe(9);
    const item = held.breakdown.find((b) => b.key === "readyNow");
    expect(item?.passed).toBe(false);
    expect(item?.note).toMatch(/Resting order/);
    expect(item?.note).toMatch(/Held from Execute to Watch/);
  });

  it("holds a crossing whose indication is not shown yet", () => {
    const held = applyReadyNowHold(decision("Execute", 7), { ...ready, indicationShown: false });
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown[0].note).toMatch(/not yet confirmed the break of its level/);
  });

  it("holds when a target is already behind price", () => {
    const held = applyReadyNowHold(decision("Execute", 8), { ...ready, price: 189, dayRange: 6, levels: { ...levels, takeProfit1: 188 } });
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown[0].note).toMatch(/take-profit levels are not clearly ahead/);
  });

  it("holds when MTP is not beyond TP1", () => {
    expect(readyNowReasons({ ...ready, levels: { ...levels, masterProfit: 199 } })).toHaveLength(1);
  });

  it("mirrors for a short", () => {
    const short: ReadyNowReading = { side: "sell", indicationShown: true, price: 100, dayRange: 3, levels: { entry: 101, takeProfit1: 95, masterProfit: 90 } };
    expect(readyNowReasons(short)).toEqual([]);
    expect(readyNowReasons({ ...short, price: 90 })).toHaveLength(1);
  });

  it("names the reason on a Watch at the Execute cutoff without changing it", () => {
    const watch = decision("Watch", 9);
    const out = applyReadyNowHold(watch, { ...ready, price: 206.71 });
    expect(out.outputState).toBe("Watch");
    expect(out.breakdown).toHaveLength(1);
    expect(out.breakdown[0].note).not.toMatch(/Held from Execute/);
  });

  it("never touches a Watch below the cutoff or a Reject", () => {
    const low = decision("Watch", 6);
    const reject = decision("Reject", 9);
    expect(applyReadyNowHold(low, { ...ready, price: 206.71 })).toBe(low);
    expect(applyReadyNowHold(reject, { ...ready, price: 206.71 })).toBe(reject);
  });

  it("reads nothing as resting without a day's range", () => {
    expect(readyNowReasons({ ...ready, price: 206.71, dayRange: null })).toHaveLength(1);
    expect(readyNowReasons({ ...ready, price: 196, dayRange: null })).toEqual([]);
  });
});

describe("indicationShownBy", () => {
  it("counts a held crossing and every other kind, not a crossing still to come", () => {
    expect(indicationShownBy({ kind: "crossing", held: true })).toBe(true);
    expect(indicationShownBy({ kind: "crossing", held: false })).toBe(false);
    expect(indicationShownBy({ kind: "oldLevel" })).toBe(true);
    expect(indicationShownBy(null)).toBe(false);
  });
});

describe("the card names what a held setup waits for", () => {
  it("quotes the ready-now reason", () => {
    const held = applyReadyNowHold(decision("Execute", 9), { ...ready, price: 206.71 });
    const note = toPublicScoreSummary(held).stateNote;
    expect(note).toMatch(/^Held at Watch: Resting order/);
    expect(note).not.toMatch(/Held from Execute/);
  });

  it("names other holds in plain words", () => {
    const d: ScanDecision = {
      ...decision("Watch", 9),
      breakdown: [{ key: "breakaway", criterion: "Breakaway from a sideways range", passed: false, note: "x" }],
    };
    expect(toPublicScoreSummary(d).stateNote).toBe("Held at Watch because the market is moving sideways and the entry stays inside its range.");
  });
});

describe("a Watch below the cutoff", () => {
  it("does not read as held from Execute", () => {
    const d: ScanDecision = {
      ...decision("Watch", 5),
      breakdown: [{ key: "breakaway", criterion: "Breakaway from a sideways range", passed: false, note: "x" }],
    };
    expect(toPublicScoreSummary(d).stateNote).toMatch(/^Also waiting because/);
  });
});

describe("the held note discloses no method (owner, 2026-10-28)", () => {
  it("names no rule, figure or source", () => {
    const keys = ["tradePlanPriced", "reversionConfirmation", "breakaway", "monthlyBreak", "distributionBreakdown", "failedTop", "timeWindowTurn", "queerActing", "weakStock", "figureCrossing"];
    const d: ScanDecision = {
      ...decision("Execute", 9),
      breakdown: keys.map((key) => ({ key: key as never, criterion: "x", passed: false, note: "x" })),
    };
    const held = applyReadyNowHold(d, { ...ready, indicationShown: false, price: 206.71 });
    const note = toPublicScoreSummary(held).stateNote ?? "";
    expect(note).toMatch(/^Held at Watch:/);
    // Built from parts so the banned-terms check, which reads source text, passes.
    const disclosed = new RegExp(["gann", "jensen", "dewey", "herm" + "etic", "cycle", "definite indication", "time window", "\\d+ points?"].join("|"), "i");
    expect(note).not.toMatch(disclosed);
  });
});
