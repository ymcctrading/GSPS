/**
 * Gann's monthly break (A-TREND-11/-12, W006 pp.40-43): the first break of a
 * prior month's low since the last one warns of a turn in an advance, and the
 * mirror in a decline. A month's bar holds its low for the whole month, so a
 * break early in the month still stands on day 20 (PLAN.md item 6, step 3).
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildCampaignLedger } from "@/lib/gann/campaignLedger";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function fromDec(closes: number[], half = 0.3): Bar[] {
  const t0 = Date.parse("2025-12-01T05:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}
const LENGTHS = [31, 28, 31, 30];
/** December up from 80 to 100; then each month a two-day dip to its low (high) and a run to its close. */
function bull(lows: number[], closes: number[]): Bar[] {
  const out = [...leg(80, 100, 31)];
  let p = 100;
  lows.forEach((lo, k) => {
    out.push(...leg(p, lo, 2), ...leg(lo, closes[k], LENGTHS[k] - 2));
    p = closes[k];
  });
  return fromDec(out);
}
function bear(highs: number[], closes: number[]): Bar[] {
  const out = [...leg(200, 180, 31)];
  let p = 180;
  highs.forEach((hi, k) => {
    out.push(...leg(p, hi, 2), ...leg(hi, closes[k], LENGTHS[k] - 2));
    p = closes[k];
  });
  return fromDec(out);
}
/** A lead-in from October 1 ahead of a fixture that starts on December 1. */
function fromOct(lead: number[], rest: Bar[]): Bar[] {
  const t0 = Date.parse("2025-10-01T05:00:00Z");
  return [...lead.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.3, l: c - 0.3, c, v: 1e6 })), ...rest];
}
const until = (bars: Bar[], day: string) => bars.filter((b) => b.t.slice(0, 10) <= day);

describe("the month's low so far (A-TREND-11)", () => {
  it("still reads April's early break of March's low on April 20, after new highs", () => {
    const l = buildCampaignLedger(until(bull([98, 99, 110, 108], [115, 125, 130, 140]), "2026-04-20"))!;
    expect(l.trend).toBe("bullish");
    expect(l.monthlyBreak).toBe(true);
  });

  it("does not read a break when the month has held the prior month's low", () => {
    expect(buildCampaignLedger(until(bull([98, 99, 110, 111], [115, 125, 130, 140]), "2026-04-20"))!.monthlyBreak).toBe(false);
  });

  it("is the first break of the campaign when no earlier month broke its predecessor", () => {
    const l = buildCampaignLedger(until(bull([98, 99, 110, 108], [115, 125, 130, 140]), "2026-04-20"))!;
    expect(l.monthlyBreakFirst).toBe(true);
  });

  it("is not the first when February already broke January's low", () => {
    const l = buildCampaignLedger(until(bull([98, 97, 110, 108], [115, 125, 130, 140]), "2026-04-20"))!;
    expect(l.monthlyBreak).toBe(true);
    expect(l.monthlyBreakFirst).toBe(false);
  });

  it("is not the first when the month just before broke its own predecessor", () => {
    // March broke February's low, and April breaks March's.
    const l = buildCampaignLedger(until(bull([98, 105, 104, 103], [115, 125, 130, 140]), "2026-04-20"))!;
    expect(l.trend).toBe("bullish");
    expect(l.monthlyBreak).toBe(true);
    expect(l.monthlyBreakFirst).toBe(false);
  });

  it("counts only the months since the campaign began, not the decline before it", () => {
    // October and November fall (November under October's low), and the
    // advance runs from the end of November.
    const bars = fromOct([...leg(110, 100, 31), ...leg(100, 80, 30)], bull([98, 99, 110, 108], [115, 125, 130, 140]));
    const l = buildCampaignLedger(until(bars, "2026-04-20"))!;
    expect(l.trend).toBe("bullish");
    expect(l.monthlyBreak).toBe(true);
    expect(l.monthlyBreakFirst).toBe(true);
  });
});

describe("the mirror in a decline (A-TREND-12)", () => {
  it("still reads April's early cross of March's high on April 20, after new lows", () => {
    const l = buildCampaignLedger(until(bear([182, 181, 170, 172], [165, 155, 150, 140]), "2026-04-20"))!;
    expect(l.trend).toBe("bearish");
    expect(l.monthlyBreak).toBe(true);
    expect(l.monthlyBreakFirst).toBe(true);
  });

  it("is not the first when February already crossed January's high", () => {
    const l = buildCampaignLedger(until(bear([182, 183, 170, 172], [165, 155, 150, 140]), "2026-04-20"))!;
    expect(l.monthlyBreak).toBe(true);
    expect(l.monthlyBreakFirst).toBe(false);
  });
});
