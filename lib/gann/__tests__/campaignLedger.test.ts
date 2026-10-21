import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildCampaignLedger, describeCampaignLedger } from "../campaignLedger";
import { contextFactorsFor } from "../contextFactors";
import { readDisclosedRules } from "../disclosedRules";
import { definiteIndicationPillar, readPillarFacts } from "@/lib/scoring/pillars";

/** One bar per calendar day from 2026-01-01; each bar spans close ± 0.5. */
function daily(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    o: c,
    h: c + 0.5,
    l: c - 0.5,
    c,
    v: 1000,
  }));
}

/** A stepping advance: 6 bars up 1.0, 3 bars down 0.5, repeated. */
function steppingAdvance(cycles: number): number[] {
  const out: number[] = [];
  let p = 100;
  for (let k = 0; k < cycles; k++) {
    for (let i = 0; i < 6; i++) out.push((p += 1));
    for (let i = 0; i < 3; i++) out.push((p -= 0.5));
  }
  return out;
}

describe("buildCampaignLedger", () => {
  it("records a bullish campaign's sections and its greatest reaction", () => {
    const l = buildCampaignLedger(daily([...steppingAdvance(5), 131, 132]))!;
    expect(l.trend).toBe("bullish");
    expect(l.sections).toBeGreaterThanOrEqual(3);
    expect(l.greatestCounterMove).not.toBeNull();
    expect(l.spaceOverbalanced).toBe(false);
    expect(l.timeOverbalanced).toBe(false);
  });

  it("flags over-balance when a reaction outlasts and outsizes every earlier one", () => {
    const base = steppingAdvance(5);
    let p = base[base.length - 1] + 3;
    const closes = [...base, p - 2, p - 1, p];
    for (let i = 0; i < 9; i++) closes.push((p -= 1.2));
    const l = buildCampaignLedger(daily(closes))!;
    expect(l.currentCounterMove).not.toBeNull();
    expect(l.spaceOverbalanced).toBe(true);
    expect(l.timeOverbalanced).toBe(true);
  });

  it("projects a time-balance date from the matching prior leg", () => {
    const l = buildCampaignLedger(daily([...steppingAdvance(4), 125, 126]))!;
    expect(l.timeBalanceDates.length).toBe(1);
  });

  // Monthly-low break (W006; parity G6): the first break of the prior
  // month's low turns a bull campaign, mirrored for a bear campaign's high.
  it("flags a bull campaign's bar that breaks the prior month's low", () => {
    // 2026-01-01 .. 2026-03-14 stepping up, then a drop through February's low.
    const up = steppingAdvance(8);
    const ledgerBefore = buildCampaignLedger(daily(up))!;
    expect(ledgerBefore.trend).toBe("bullish");
    expect(ledgerBefore.monthlyBreak).toBe(false);
    const bars = daily(up);
    const febLow = Math.min(...bars.filter((b) => b.t.startsWith("2026-02")).map((b) => b.l));
    const last = bars[bars.length - 1];
    bars.push({ ...last, t: new Date(Date.parse(last.t) + 86_400_000).toISOString(), c: febLow - 1, o: last.c, h: last.c, l: febLow - 1.5 });
    expect(bars[bars.length - 1].t.slice(0, 7)).toBe("2026-03");
    const l = buildCampaignLedger(bars)!;
    expect(l.trend).toBe("bullish");
    expect(l.monthlyBreak).toBe(true);
  });

  it("flags a bear campaign's bar that breaks the prior month's high (the mirror)", () => {
    const down = steppingAdvance(8).map((c) => 300 - c);
    const bars = daily(down);
    expect(buildCampaignLedger(bars)!.monthlyBreak).toBe(false);
    const febHigh = Math.max(...bars.filter((b) => b.t.startsWith("2026-02")).map((b) => b.h));
    const last = bars[bars.length - 1];
    bars.push({ ...last, t: new Date(Date.parse(last.t) + 86_400_000).toISOString(), c: febHigh + 1, o: last.c, l: last.c, h: febHigh + 1.5 });
    const l = buildCampaignLedger(bars)!;
    expect(l.trend).toBe("bearish");
    expect(l.monthlyBreak).toBe(true);
  });

  it("returns null on too little history", () => {
    expect(buildCampaignLedger(daily([1, 2, 3]))).toBeNull();
  });
});

describe("contextFactorsFor", () => {
  it("records each reading as a yes/no factor in the trade's direction", () => {
    const bars = daily(steppingAdvance(6));
    const ctx = readDisclosedRules(bars, bars[bars.length - 1].c);
    const bull = contextFactorsFor(ctx, "bullish", bars[bars.length - 1].c);
    const bear = contextFactorsFor(ctx, "bearish", bars[bars.length - 1].c);
    expect(typeof bull.dayCountBandActive).toBe("boolean");
    expect(bull.withWeeklyTrend).toBe(true);
    expect(bear.withWeeklyTrend).toBe(false);
  });
});

describe("A-LEVELS-02: the top of a secondary rally is an important point to watch", () => {
  const line = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
  /** The 1929-30 averages, scaled: a dip, the 386 top, the panic to 198, the secondary rally to 297, the fall to 155. */
  const dow = [...line(300, 250, 15), ...line(250, 386, 40), ...line(386, 198, 40), ...line(198, 297, 30), ...line(297, 155, 40)];

  it("names 297 as the secondary rally top of the bear campaign from 386", () => {
    const l = buildCampaignLedger(daily(dow))!;
    expect(l.trend).toBe("bearish");
    expect(l.secondaryTurn?.kind).toBe("top");
    expect(l.secondaryTurn?.price).toBeCloseTo(297.5, 6);
  });

  it("mirrors in a bull campaign: the secondary reaction's bottom", () => {
    const l = buildCampaignLedger(daily(dow.map((c) => 500 - c)))!;
    expect(l.trend).toBe("bullish");
    expect(l.secondaryTurn).toMatchObject({ kind: "bottom" });
    expect(l.secondaryTurn?.price).toBeCloseTo(202.5, 6);
  });

  it("is not named before the rally has ended", () => {
    const early = [...line(300, 250, 15), ...line(250, 386, 40), ...line(386, 198, 40), ...line(198, 290, 28)];
    expect(buildCampaignLedger(daily(early))?.secondaryTurn ?? null).toBeNull();
  });

  it("is on the card and counts with a short below it", () => {
    const bars = daily(dow);
    const ctx = readDisclosedRules(bars, 155);
    expect(ctx.campaign?.secondaryTurn?.price).toBeCloseTo(297.5, 6);
    expect(describeCampaignLedger(ctx.campaign!).some((s) => s.includes("secondary rally top") && s.includes("297.50"))).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 155).belowSecondaryRallyTop).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 155).belowSecondaryRallyTop).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 300).belowSecondaryRallyTop).toBe(false);
  });

  it("joins the support and resistance levels the plan's stop and targets come from", async () => {
    const { secondaryTurnLevels } = await import("../campaignLedger");
    const { buildMacroContext } = await import("@/lib/backtest/replay");
    expect(secondaryTurnLevels(buildCampaignLedger(daily(dow)))).toEqual([expect.closeTo(297.5, 6)]);
    expect(secondaryTurnLevels(null)).toEqual([]);
    const levels = buildMacroContext(daily(dow), 155).structuralLevels;
    expect(levels.some((p) => Math.abs(p - 297.5) < 1e-6)).toBe(true);
  });
});

describe("C-TIME-27: the 1935 culmination months are each pinned (Master Course Ch.7 PDF 220)", () => {
  it("reads the 23rd, 24th, 27th and 30th months and the 34th-35th and 41st-42nd, and no month between", async () => {
    const { readCampaignAge } = await import("../campaignLedger");
    const on = [23, 24, 27, 30, 34, 35, 41, 42];
    for (let m = 20; m <= 44; m++) expect(readCampaignAge(m).culmination1935, `month ${m}`).toBe(on.includes(m));
  });
});

// Over-balance of time, like for like (2026-10-20): a completed reaction is
// measured top to bottom, so the one in progress is measured to its extreme so
// far. A reaction that made its low inside the campaign's longest and has held
// since is not over-balanced in time, however long it has held.
describe("over-balance of time reads the reaction to its extreme", () => {
  const DAY = 86_400_000;
  const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
  const bars = (closes: number[]): Bar[] => {
    const t0 = Date.parse("2025-01-02T05:00:00Z");
    return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.3, l: c - 0.3, c, v: 1e6 }));
  };
  // A bull campaign whose one completed reaction (81 to 70) runs 20 days.
  const CAMPAIGN = [...leg(30, 40, 20), ...leg(40, 81, 60), ...leg(81, 70, 20), ...leg(70, 120, 100)];
  const mirror = (b: Bar[]): Bar[] => b.map((x) => ({ ...x, o: 300 - x.o, c: 300 - x.c, h: 300 - x.l, l: 300 - x.h }));

  it("does not flag a reaction that made its low on day 15 and has held for 15 more", () => {
    const held = bars([...CAMPAIGN, ...leg(120, 113, 15), ...Array.from({ length: 15 }, () => 113)]);
    const l = buildCampaignLedger(held)!;
    expect(l.trend).toBe("bullish");
    expect(l.greatestCounterMove?.days).toBe(20);
    expect(l.currentCounterMove?.days).toBe(30);
    expect(l.currentCounterMove?.extremeDays).toBe(15);
    expect(l.spaceOverbalanced).toBe(false);
    expect(l.timeOverbalanced).toBe(false);
    // The mirror, a bear campaign's rally that topped and held.
    const m = buildCampaignLedger(mirror(held))!;
    expect(m.trend).toBe("bearish");
    expect(m.timeOverbalanced).toBe(false);
  });

  it("lets the definite-indication pillar pass a long bought at that held low", () => {
    const held = bars([...CAMPAIGN, ...leg(120, 113, 15), ...Array.from({ length: 15 }, () => 113)]);
    const price = held[held.length - 1].c;
    const asOf = new Date(Date.parse(held[held.length - 1].t) + DAY);
    const facts = readPillarFacts({ rules: readDisclosedRules(held, price, null, asOf), daily: held, monthly: [], marketDaily: null, marketMonthly: null, price, asOf });
    expect(definiteIndicationPillar(facts, "bullish", true, true).passed).toBe(true);
    expect(definiteIndicationPillar(facts, "bearish", true, true).passed).toBe(false);
  });

  it("still flags a reaction still making new lows past the campaign's longest", () => {
    const longer = bars([...CAMPAIGN, ...leg(120, 113, 25)]);
    const l = buildCampaignLedger(longer)!;
    expect(l.currentCounterMove?.extremeDays).toBe(25);
    expect(l.spaceOverbalanced).toBe(false);
    expect(l.timeOverbalanced).toBe(true);
    expect(buildCampaignLedger(mirror(longer))!.timeOverbalanced).toBe(true);
  });
});

describe("an over-balancing reaction stands until the trend resumes past its top (2026-10-21)", () => {
  const DAY = 86_400_000;
  const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
  const bars = (closes: number[]): Bar[] => {
    const t0 = Date.parse("2025-01-02T05:00:00Z");
    return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.3, l: c - 0.3, c, v: 1e6 }));
  };
  const mirror = (b: Bar[]): Bar[] => b.map((x) => ({ ...x, o: 300 - x.o, c: 300 - x.c, h: 300 - x.l, l: 300 - x.h }));
  // A bull campaign whose one earlier reaction (81 to 70) is about 14%; then a
  // reaction from 120 to 98 (about 19%) that has ended, and a rally to 108,
  // still under 120.
  const CAMPAIGN = [...leg(30, 40, 20), ...leg(40, 81, 60), ...leg(81, 70, 20), ...leg(70, 120, 100)];
  const completed = bars([...CAMPAIGN, ...leg(120, 98, 15), ...leg(98, 108, 8)]);

  it("still reads the completed reaction as over-balanced in space", () => {
    const l = buildCampaignLedger(completed)!;
    expect(l.trend).toBe("bullish");
    expect(l.currentCounterMove).toBeNull();
    expect(l.spaceOverbalanced).toBe(true);
    expect(l.overbalance).toMatchObject({ fromIndex: CAMPAIGN.length - 1, standing: true });
    const m = buildCampaignLedger(mirror(completed))!;
    expect(m.trend).toBe("bearish");
    expect(m.spaceOverbalanced).toBe(true);
  });

  it("clears once price goes back past the top the reaction fell from", () => {
    const resumed = bars([...CAMPAIGN, ...leg(120, 98, 15), ...leg(98, 124, 20)]);
    const l = buildCampaignLedger(resumed)!;
    expect(l.spaceOverbalanced).toBe(false);
    expect(l.timeOverbalanced).toBe(false);
    expect(l.overbalance).toBeNull();
    expect(buildCampaignLedger(mirror(resumed))!.spaceOverbalanced).toBe(false);
  });

  it("fails the definite-indication pillar for a long bought on that rally, and passes the short", () => {
    const price = completed[completed.length - 1].c;
    const asOf = new Date(Date.parse(completed[completed.length - 1].t) + DAY);
    const facts = readPillarFacts({ rules: readDisclosedRules(completed, price, null, asOf), daily: completed, monthly: [], marketDaily: null, marketMonthly: null, price, asOf });
    expect(definiteIndicationPillar(facts, "bullish", true, true).passed).toBe(false);
    expect(definiteIndicationPillar(facts, "bearish", true, true).passed).toBe(true);
    // The bear mirror: the short fails it on the secondary reaction, the long passes.
    const m = mirror(completed);
    const mp = m[m.length - 1].c;
    const mFacts = readPillarFacts({ rules: readDisclosedRules(m, mp, null, asOf), daily: m, monthly: [], marketDaily: null, marketMonthly: null, price: mp, asOf });
    expect(definiteIndicationPillar(mFacts, "bearish", true, true).passed).toBe(false);
    expect(definiteIndicationPillar(mFacts, "bullish", true, true).passed).toBe(true);
  });

  it("says on the card that it stands, and until which price", () => {
    const text = describeCampaignLedger(buildCampaignLedger(completed)!).join(" ");
    expect(text).toMatch(/exceeded the campaign's greatest in space/);
    expect(text).toMatch(/stands until price goes back above 120\.30/);
    const bear = describeCampaignLedger(buildCampaignLedger(mirror(completed))!).join(" ");
    expect(bear).toMatch(/The rally from the bottom of 179\.70/);
    expect(bear).toMatch(/goes back below 179\.70/);
  });

  it("is measured against the reactions before it, and once the trend has resumed it is the yardstick for the next", () => {
    // After the new high, a reaction of 20 points: larger than 81-70 but not than 120-98.
    const after = bars([...CAMPAIGN, ...leg(120, 98, 15), ...leg(98, 130, 40), ...leg(130, 110, 15), ...leg(110, 114, 4)]);
    const l = buildCampaignLedger(after)!;
    expect(l.trend).toBe("bullish");
    expect(l.greatestCounterMove!.points).toBeCloseTo(22.6, 1);
    expect(l.spaceOverbalanced).toBe(false);
    expect(buildCampaignLedger(mirror(after))!.spaceOverbalanced).toBe(false);
  });
});

describe("over-balance of space is read in points, as the method states it (2026-10-21)", () => {
  const DAY = 86_400_000;
  const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
  const bars = (closes: number[]): Bar[] => {
    const t0 = Date.parse("2025-01-02T05:00:00Z");
    return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.3, l: c - 0.3, c, v: 1e6 }));
  };
  const mirror = (b: Bar[]): Bar[] => b.map((x) => ({ ...x, o: 300 - x.o, c: 300 - x.c, h: 300 - x.l, l: 300 - x.h }));
  // Reactions of 20 points from 100 (20%) and then 23 points from 160 (14%),
  // the second still running and as short in time as the first.
  const shape = bars([...leg(30, 40, 20), ...leg(40, 100, 60), ...leg(100, 80, 15), ...leg(80, 160, 80), ...leg(160, 137, 12)]);

  it("a larger reaction in points over-balances though it is smaller in percent", () => {
    const l = buildCampaignLedger(shape)!;
    expect(l.trend).toBe("bullish");
    expect(l.currentCounterMove!.points).toBeGreaterThan(l.greatestCounterMove!.points);
    expect(l.currentCounterMove!.pct).toBeLessThan(l.greatestCounterMove!.pct);
    expect(l.timeOverbalanced).toBe(false);
    expect(l.spaceOverbalanced).toBe(true);
    expect(l.overbalance).toMatchObject({ standing: false });
  });

  it("reads the bear mirror the same, point for point", () => {
    const l = buildCampaignLedger(mirror(shape))!;
    expect(l.trend).toBe("bearish");
    expect(l.currentCounterMove!.points).toBeCloseTo(buildCampaignLedger(shape)!.currentCounterMove!.points, 6);
    expect(l.spaceOverbalanced).toBe(true);
  });

  it("the card gives the sizes in points", () => {
    expect(describeCampaignLedger(buildCampaignLedger(shape)!).join(" ")).toMatch(/points \([\d.]+%\) over \d+d .* greatest [\d.]+ points/);
  });
});
