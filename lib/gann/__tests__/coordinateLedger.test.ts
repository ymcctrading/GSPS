import { describe, expect, it } from "vitest";
import { buildCoordinateLedger } from "../coordinateLedger";
import type { Bar } from "@/lib/types";

function bar(t: string, h: number, l: number, c: number): Bar {
  return { t, o: c, h, l, c, v: 1000 };
}

describe("buildCoordinateLedger", () => {
  it("returns nothing for an empty history", () => {
    expect(buildCoordinateLedger([], 100)).toEqual([]);
  });

  it("builds prior day/week/month high-low coordinates", () => {
    const bars: Bar[] = Array.from({ length: 25 }, (_, i) =>
      bar(`2026-08-${String(i + 1).padStart(2, "0")}`, 100 + i, 90 + i, 95 + i),
    );
    const ledger = buildCoordinateLedger(bars, 120);

    const dayHigh = ledger.find((c) => c.coordinateType === "PRIOR_DAY_HIGH");
    expect(dayHigh?.priceLevel).toBe(124); // last bar: h = 100 + 24
    expect(dayHigh?.side).toBe("RESISTANCE"); // currentPrice 120 < level 124

    const weekHigh = ledger.find((c) => c.coordinateType === "PRIOR_WEEK_HIGH");
    const weekLow = ledger.find((c) => c.coordinateType === "PRIOR_WEEK_LOW");
    expect(weekHigh?.priceLevel).toBe(124);
    expect(weekLow?.priceLevel).toBe(110); // trailing 5 bars: l = 90+20..90+24 -> min 110

    const monthHigh = ledger.find((c) => c.coordinateType === "PRIOR_MONTH_HIGH");
    expect(monthHigh?.parameterValues.sessions).toBe(21);
  });

  it("labels side relative to current price, not the prior close", () => {
    const bars: Bar[] = [bar("2026-08-01", 110, 90, 100)];
    const above = buildCoordinateLedger(bars, 200);
    const dayHigh = above.find((c) => c.coordinateType === "PRIOR_DAY_HIGH");
    expect(dayHigh?.side).toBe("SUPPORT");

    const below = buildCoordinateLedger(bars, 50);
    const dayHigh2 = below.find((c) => c.coordinateType === "PRIOR_DAY_HIGH");
    expect(dayHigh2?.side).toBe("RESISTANCE");
  });

  it("builds range-fraction coordinates including the midpoint", () => {
    const bars: Bar[] = Array.from({ length: 5 }, (_, i) => bar(`2026-08-0${i + 1}`, 110, 90, 100));
    const ledger = buildCoordinateLedger(bars, 100);
    const midpoint = ledger.find((c) => c.coordinateType === "WEEK_RANGE_MIDPOINT");
    expect(midpoint?.priceLevel).toBe(100); // low 90 + (110-90)*0.5

    const quarter = ledger.find((c) => c.coordinateType === "WEEK_RANGE_FRACTION_25");
    expect(quarter?.priceLevel).toBe(95); // 90 + 20*0.25
  });

  it("every coordinate reports EXPERIMENTAL research status", () => {
    const bars: Bar[] = Array.from({ length: 5 }, (_, i) => bar(`2026-08-0${i + 1}`, 110, 90, 100));
    const ledger = buildCoordinateLedger(bars, 100);
    expect(ledger.every((c) => c.researchStatus === "EXPERIMENTAL")).toBe(true);
    expect(ledger.length).toBeGreaterThan(0);
  });
});
