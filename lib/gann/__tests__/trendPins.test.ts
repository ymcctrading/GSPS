/**
 * Pins for Gann's trend rules the swing-chart read already satisfies (PLAN.md
 * item 6, step 1): a smaller, shorter secondary move leaves the trend as it
 * was (A-TREND-05, W006 pp.13-14). A-TREND-06 (a reaction held above the
 * previous section's top) waits on the monthly-break decision: its 1933 shape
 * breaks monthly lows, which today make the trend read sideways.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readGannTrend } from "@/lib/gann/trendStrength";
import { buildCampaignLedger } from "@/lib/gann/campaignLedger";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function daily(closes: number[], half = 0.3): Bar[] {
  const t0 = Date.parse("2025-01-02T05:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}

describe("a smaller, shorter secondary rally leaves a falling trend down (A-TREND-05)", () => {
  it("reads the trend down after a rally of 10% in 14 days that followed one of 20% in 30", () => {
    // The smaller rally is still open, so the comparison is made (batch review A1).
    const bars = daily([...leg(180, 200, 20), ...leg(200, 120, 40), ...leg(120, 144, 30), ...leg(144, 100, 30), ...leg(100, 110, 14)]);
    const ledger = buildCampaignLedger(bars)!;
    expect(ledger.currentCounterMove).not.toBeNull();
    expect(ledger.spaceOverbalanced).toBe(false);
    expect(ledger.timeOverbalanced).toBe(false);
    expect(readGannTrend(bars).direction).toBe("bearish");
  });
});
