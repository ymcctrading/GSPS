/**
 * Never-failing rule 9: "Never limit your orders or fix a buying or selling
 * price. Trade at the market" (Commodities rule 9, pp.43-45, and p.19; W021
 * PDF p.124 and Appendix A). Read together with the reaction buy zone (W006
 * pp.20, 46-47: old top 50, a close at 53 crosses it, buy 51 down to 48, stop
 * 47): the zone is kept and the fixed price goes. Once a closed bar after the
 * crossing has traded into the zone, the entry is a market order.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { gannBuyZone, tradedIntoBuyZone } from "@/lib/gann/entryTrigger";
import { threePoints } from "@/lib/gann/pointScale";
import { confirmationFromBars } from "@/lib/lifecycle/confirmNow";
import { NEVER_FAILING_RULES } from "@/lib/risk/neverFailingRules";

function bar(t: string, h: number, l: number, c: number): Bar {
  return { t, o: c, h, l, c, v: 1 };
}
const T1 = "2026-01-02T15:00:00Z";
const T2 = "2026-01-02T15:15:00Z";
const T3 = "2026-01-02T15:30:00Z";

describe("the buying zone", () => {
  it("runs from the entry to 1 point short of the stop", () => {
    const zone = gannBuyZone("bullish", 51, 47);
    expect(zone.near).toBe(51);
    expect(zone.far).toBeCloseTo(47 + threePoints(47) / 3, 9);
    const short = gannBuyZone("bearish", 49, 53);
    expect(short.near).toBe(49);
    expect(short.far).toBeCloseTo(53 - threePoints(53) / 3, 9);
  });

  it("is traded into when a long's low (a short's high) reaches the entry", () => {
    expect(tradedIntoBuyZone(bar(T1, 52, 50.9, 51.5), "bullish", 51)).toBe(true);
    expect(tradedIntoBuyZone(bar(T1, 52, 51.1, 51.5), "bullish", 51)).toBe(false);
    expect(tradedIntoBuyZone(bar(T1, 49.1, 48, 48.5), "bearish", 49)).toBe(true);
    expect(tradedIntoBuyZone(bar(T1, 48.9, 48, 48.5), "bearish", 49)).toBe(false);
  });
});

describe("confirmation on the crossing waits for a closed bar in the zone", () => {
  const crossed = bar(T1, 53.4, 50.5, 53);

  it("is not ready on the crossing alone, and the crossing bar's own low does not count", () => {
    const r = confirmationFromBars([crossed], "bullish", 51, 47);
    expect(r.ready).toBe(false);
    expect(r.stage).toBe("broken");
    expect(r.note).toMatch(/market/);
    expect(r.note).not.toMatch(/gann/i);
  });

  it("is ready once a later closed bar trades into the zone", () => {
    const r = confirmationFromBars([crossed, bar(T2, 52.6, 50.8, 51.6)], "bullish", 51, 47);
    expect(r.ready).toBe(true);
    expect(r.note).toMatch(/at the market/);
  });

  it("stays ready after the reaction while no close has gone through the stop", () => {
    const r = confirmationFromBars([crossed, bar(T2, 52.6, 50.8, 51.6), bar(T3, 54, 53, 53.8)], "bullish", 51, 47);
    expect(r.ready).toBe(true);
  });

  it("is off once a close goes through the stop", () => {
    const r = confirmationFromBars([crossed, bar(T2, 50, 46.5, 46.8)], "bullish", 51, 47);
    expect(r.stage).toBe("dead");
  });

  it("mirrors for a short", () => {
    const down = bar(T1, 49.5, 46.6, 47);
    expect(confirmationFromBars([down], "bearish", 49, 53).ready).toBe(false);
    expect(confirmationFromBars([down, bar(T2, 49.2, 47.4, 48.4)], "bearish", 49, 53).ready).toBe(true);
  });
});

describe("the old level waits for price to come back to it", () => {
  it("is not ready until a closed bar trades to the old bottom", () => {
    expect(confirmationFromBars([], "bullish", 100, 95, "oldLevel").ready).toBe(false);
    expect(confirmationFromBars([bar(T1, 103, 101, 102)], "bullish", 100, 95, "oldLevel").ready).toBe(false);
    expect(confirmationFromBars([bar(T1, 103, 99.8, 101)], "bullish", 100, 95, "oldLevel").ready).toBe(true);
  });
  it("mirrors at the old top", () => {
    expect(confirmationFromBars([bar(T1, 99, 97, 98)], "bearish", 100, 105, "oldLevel").ready).toBe(false);
    expect(confirmationFromBars([bar(T1, 100.2, 97, 98)], "bearish", 100, 105, "oldLevel").ready).toBe(true);
  });
});

describe("the never-failing rules record", () => {
  it("marks rules 1 and 9 enforced, and cites the right books for rules 1 and 8", () => {
    const rule = (n: number) => NEVER_FAILING_RULES.find((r) => r.n === n)!;
    expect(rule(1).status).toBe("enforced");
    expect(rule(9).status).toBe("enforced");
    for (const n of [1, 8]) {
      expect(rule(n).note).not.toMatch(/Commodities rule/);
    }
    expect(rule(1).note).toMatch(/p\.46/);
    expect(rule(8).note).toMatch(/Tunnel/);
  });
});
