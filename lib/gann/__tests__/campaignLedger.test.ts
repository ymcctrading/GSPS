import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildCampaignLedger, describeCampaignLedger } from "../campaignLedger";
import { contextFactorsFor } from "../contextFactors";
import { readDisclosedRules } from "../disclosedRules";

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
});

describe("C-TIME-27: the 1935 culmination months are each pinned (Master Course Ch.7 PDF 220)", () => {
  it("reads the 23rd, 24th, 27th and 30th months and the 34th-35th and 41st-42nd, and no month between", async () => {
    const { readCampaignAge } = await import("../campaignLedger");
    const on = [23, 24, 27, 30, 34, 35, 41, 42];
    for (let m = 20; m <= 44; m++) expect(readCampaignAge(m).culmination1935, `month ${m}`).toBe(on.includes(m));
  });
});
