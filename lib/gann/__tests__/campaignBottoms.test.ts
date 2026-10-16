import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readCampaignBottoms } from "@/lib/gann/campaignBottoms";

/** Monthly bars along straight legs between [month index from 2016-01, close] points. */
function monthly(points: [number, number][]): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [m0, c0] = points[i];
    const [m1, c1] = points[i + 1];
    for (let m = m0; m < m1; m++) {
      const c = c0 + ((c1 - c0) * (m - m0)) / (m1 - m0);
      out.push({ t: new Date(Date.UTC(2016, m, 1)).toISOString(), o: c, h: c * 1.02, l: c * 0.98, c, v: 1e6 });
    }
  }
  return out;
}

// Campaign bottoms near 70 (2017), 85 (2020) and 100 (2023), newest last.
const legs: [number, number][] = [[0, 120], [17, 70], [35, 130], [50, 85], [71, 140], [89, 100], [113, 135]];
const asOf = new Date("2026-10-16T15:00:00Z");

describe("A-LEVELS-03: the ladder of old campaign bottoms", () => {
  it("looks to the previous campaign bottom while it holds", () => {
    const r = readCampaignBottoms(monthly([...legs, [129, 104], [130, 104]]), [], asOf)!;
    expect(r.bottoms.map((b) => b.month).slice(0, 3)).toEqual(["2023-06", "2020-03", "2017-06"]);
    expect(r.nextSupport?.month).toBe("2023-06");
  });

  it("looks to the next older bottom once a close has broken the previous one by the 3 points", () => {
    const r = readCampaignBottoms(monthly([...legs, [129, 90], [130, 90]]), [], asOf)!;
    expect(r.bottoms[0]).toMatchObject({ month: "2023-06", broken: true });
    expect(r.nextSupport?.month).toBe("2020-03");
  });

  it("does not count a dip under the bottom inside the 3 points as a break", () => {
    const r = readCampaignBottoms(monthly([...legs, [127, 96], [130, 96]]), [], asOf)!;
    expect(r.bottoms[0].broken).toBe(false);
    expect(r.nextSupport?.month).toBe("2023-06");
  });
});

describe("A-LEVELS-03: the ladder's span and sessions", () => {
  it("passes over an older bottom that sits above the broken one, which is overhead, not support", () => {
    const higher: [number, number][] = [[0, 120], [17, 70], [35, 140], [50, 115], [71, 150], [89, 100], [113, 135], [129, 90], [130, 90]];
    const r = readCampaignBottoms(monthly(higher), [], asOf)!;
    expect(r.bottoms.map((b) => b.month).slice(0, 3)).toEqual(["2023-06", "2020-03", "2017-06"]);
    expect(r.nextSupport?.month).toBe("2017-06");
  });

  it("reads only the ten calendar years before the session, so a longer history gives the same ladder", () => {
    const m = monthly([...legs, [129, 90], [130, 90]]);
    const older: Bar[] = Array.from({ length: 36 }, (_, i) => {
      const c = 50 + i;
      return { t: new Date(Date.UTC(2013, i, 1)).toISOString(), o: c, h: c, l: i === 10 ? 20 : c, c, v: 1e6 };
    });
    expect(readCampaignBottoms([...older, ...m], [], asOf)).toEqual(readCampaignBottoms(m, [], asOf));
  });

  it("counts a completed session's close this month as a break, but not the session still trading", () => {
    const m = monthly([...legs, [129, 99], [130, 99]]);
    const day = (d: string, c: number): Bar => ({ t: `${d}T04:00:00Z`, o: c, h: c, l: c, c, v: 1e6 });
    expect(readCampaignBottoms(m, [day("2026-10-15", 90)], asOf)!.bottoms[0].broken).toBe(true);
    expect(readCampaignBottoms(m, [day("2026-10-16", 90)], asOf)!.bottoms[0].broken).toBe(false);
    // The live feed's forming month closing under the line is no break either (review M1).
    const forming = m.map((b) => (b.t.startsWith("2026-10") ? { ...b, c: 90, l: 89 } : b));
    expect(readCampaignBottoms(forming, [], asOf)!.bottoms[0].broken).toBe(false);
  });

  it("is on the card and in the trade's factors", async () => {
    const { readDisclosedRules, describeDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const { contextFactorsFor } = await import("@/lib/gann/contextFactors");
    const daily: Bar[] = Array.from({ length: 60 }, (_, i) => ({ t: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(), o: 90, h: 91, l: 89, c: 90, v: 1e6 }));
    const ctx = readDisclosedRules(daily, 90, { sharesOutstanding: null, inception: null, monthly: monthly([...legs, [129, 90], [130, 90]]) }, asOf);
    expect(ctx.campaignBottoms?.nextSupport?.month).toBe("2020-03");
    expect(describeDisclosedRules(ctx).some((l) => l.includes("next older campaign bottom"))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 90).campaignBottomBrokenAgreesWithTrade).toBe(false);
    expect(contextFactorsFor(ctx, "bearish", 90).campaignBottomBrokenAgreesWithTrade).toBe(true);
  });
});
