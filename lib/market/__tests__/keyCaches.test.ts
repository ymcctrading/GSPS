import { describe, expect, it } from "vitest";
import { etDateKey } from "@/lib/market/session";
import { toMonthlyBars, toWeeklyBars } from "@/lib/gann/disclosedRules";
import type { Bar } from "@/lib/types";

// The per-bar key caches (speed only) must give what the uncached code gave,
// on the first call and every repeat, and still refuse an invalid instant.
describe("per-bar key caches", () => {
  it("etDateKey gives the same New York date on a repeat, and still throws on an invalid date", () => {
    const late = new Date("2026-03-09T03:30:00Z"); // 23:30 ET on the 8th, after the DST change
    expect(etDateKey(late)).toBe("2026-03-08");
    expect(etDateKey(new Date(late.getTime()))).toBe("2026-03-08");
    expect(() => etDateKey(new Date(NaN))).toThrow(RangeError);
    expect(() => etDateKey(new Date(NaN))).toThrow(RangeError);
  });

  it("weekly and monthly bars are the same on a repeat read", () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 60; i++) {
      const t = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString();
      bars.push({ t, o: 10 + i, h: 11 + i, l: 9 + i, c: 10.5 + i, v: 100 + i });
    }
    const weekly = toWeeklyBars(bars);
    expect(toWeeklyBars(bars)).toEqual(weekly);
    expect(weekly[0].t).toBe(bars[0].t);
    expect(weekly.length).toBe(9); // Jan 1 to Mar 1 2026: the part-week from Thursday Jan 1, then 8 Monday weeks
    expect(toMonthlyBars(bars).map((b) => b.t.slice(0, 7))).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(toMonthlyBars(bars)).toEqual(toMonthlyBars(bars.slice()));
  });
});
