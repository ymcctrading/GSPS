/**
 * Buy in the campaign's early sections (2026-10-29; `applyCampaignSectionHold`,
 * `CampaignLedger.tradeSection`). Master Course pp. 244-245: "the third or
 * fourth movement up or down marks the culmination".
 */
import { describe, expect, it } from "vitest";
import type { Bar, ScanDecision } from "@/lib/types";
import { applyCampaignSectionHold, applyReadyNowHold } from "@/lib/scoring/score";
import { buildCampaignLedger, CULMINATION_SECTION, SECTION_HALT_DAYS } from "@/lib/gann/campaignLedger";
import { FINAL_STAGE_SECTION } from "@/lib/gann/exitRules";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";

const exec = (score = 8): ScanDecision => ({ score, outputState: "Execute", breakdown: [] });

/** Daily bars walking straight between the given closes, `days` sessions per leg, weekends skipped. */
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

// A decline, then Chrysler 1935's shape (Master Course GA-20/21): 31 to 49¾,
// back to 41¼, to 62¾, back to 57½, to 74, back to 68, each reaction weeks long.
const DECLINE: [number, number][] = [[60, 0], [40, 25], [46, 12], [31, 20]];
const SECTION_1: [number, number][] = [[49.75, 25], [41.25, 15]];
const SECTION_2: [number, number][] = [[62.75, 25], [57.5, 15]];
const SECTION_3: [number, number][] = [[74, 25], [68, 15]];

describe("tradeSection", () => {
  it("counts the sections a buy would ride on the weekly chart's record turns", () => {
    const one = buildCampaignLedger(path([...DECLINE, ...SECTION_1]));
    const two = buildCampaignLedger(path([...DECLINE, ...SECTION_1, ...SECTION_2]));
    const three = buildCampaignLedger(path([...DECLINE, ...SECTION_1, ...SECTION_2, ...SECTION_3]));
    expect(one?.trend).toBe("bullish");
    expect(one?.tradeSection).toBe(2);
    expect(two?.tradeSection).toBe(3);
    expect(three?.tradeSection).toBe(4);
  });

  it("does not end a section at a top exceeded again within the halt", () => {
    // A weekly top at 55 inside the second advance, exceeded again by 3 points within two weeks: no section.
    const brief = path([...DECLINE, ...SECTION_1, [55, 12], [51, 3], [62.75, 8]]);
    expect(buildCampaignLedger(brief)?.tradeSection).toBe(2);
    // The same top held past two weeks ends a section.
    const held = path([...DECLINE, ...SECTION_1, [55, 12], [50, 6], [62.75, 8]]);
    expect(buildCampaignLedger(held)?.tradeSection).toBe(3);
    expect(SECTION_HALT_DAYS).toBe(14);
  });

  it("is the exit rules' final stage figure", () => {
    expect(CULMINATION_SECTION).toBe(3);
    expect(FINAL_STAGE_SECTION).toBe(CULMINATION_SECTION);
  });
});

describe("applyCampaignSectionHold", () => {
  it("holds a buy into the 3rd section of a bull campaign", () => {
    const held = applyCampaignSectionHold(exec(), { trend: "bullish", tradeSection: 3 }, "bullish");
    expect(held.outputState).toBe("Watch");
    expect(held.score).toBe(8);
    expect(held.breakdown.at(-1)).toMatchObject({ key: "campaignSection", passed: false });
  });

  it("leaves the 1st and 2nd sections", () => {
    const d = exec();
    expect(applyCampaignSectionHold(d, { trend: "bullish", tradeSection: 2 }, "bullish")).toBe(d);
    expect(applyCampaignSectionHold(d, { trend: "bullish", tradeSection: 1 }, "bullish")).toBe(d);
  });

  it("mirrors for a short in a bear campaign", () => {
    expect(applyCampaignSectionHold(exec(), { trend: "bearish", tradeSection: 4 }, "bearish").outputState).toBe("Watch");
  });

  it("leaves a trade against the campaign, a Watch and a missing ledger", () => {
    const d = exec();
    expect(applyCampaignSectionHold(d, { trend: "bullish", tradeSection: 5 }, "bearish")).toBe(d);
    const w: ScanDecision = { ...d, outputState: "Watch" };
    expect(applyCampaignSectionHold(w, { trend: "bullish", tradeSection: 5 }, "bullish")).toBe(w);
    expect(applyCampaignSectionHold(d, null, "bullish")).toBe(d);
  });

  it("is not a resting order, and its public note names no method", () => {
    const held = applyCampaignSectionHold(exec(9), { trend: "bullish", tradeSection: 3 }, "bullish");
    const after = applyReadyNowHold(held, { side: "buy", indicationShown: true, price: 186, dayRange: 5, levels: { entry: 185, takeProfit1: 199, masterProfit: 215 } });
    expect(after.resting).toBeUndefined();
    const note = toPublicScoreSummary(after).stateNote ?? "";
    expect(note).toBe("Held at Watch because the move has already run several legs and may be near its end.");
    const disclosed = new RegExp(["gann", "section", "campaign", "\\d"].join("|"), "i");
    expect(note).not.toMatch(disclosed);
  });
});
