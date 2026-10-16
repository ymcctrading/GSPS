/**
 * A dated forecast record, scored only after the fact (research only).
 * A-OTHER-13 (Annual Forecasts 1919-1922, W036 pp. 16-17, 23): supplements
 * revised a forecast during the year when the market strayed, and the "90
 * per cent correct" counts the corrected version. The record keeps the
 * original windows and each dated revision apart, so both can be scored.
 */
import { describe, expect, it } from "vitest";
import {
  issueForecast,
  macroForecastRecord,
  reviseForecast,
  scoreForecast,
  windowsInForce,
} from "@/lib/research/forecastRecord";

describe("forecast revisions (A-OTHER-13)", () => {
  // The 1922 stock forecast: a bottom about September 15, moved by a September supplement to September 30.
  const original = issueForecast({
    id: "stocks-1922",
    issued: "1921-12-01",
    source: "W036 pp.16-17",
    windows: [{ label: "bottom", from: "1922-09-13", to: "1922-09-17", expect: "low" }],
  });

  it("keeps the original windows and each dated revision apart", () => {
    const revised = reviseForecast(original, {
      date: "1922-09-05",
      reason: "September supplement: the bottom comes later",
      windows: [{ label: "bottom", from: "1922-09-28", to: "1922-10-02", expect: "low" }],
    });
    expect(original.revisions).toHaveLength(0);
    expect(revised.windows[0].from).toBe("1922-09-13");
    expect(revised.revisions).toHaveLength(1);
    expect(windowsInForce(revised, "1922-09-01")[0].from).toBe("1922-09-13");
    expect(windowsInForce(revised, "1922-09-06")[0].from).toBe("1922-09-28");
  });

  it("scores the forecast before and after revision separately", () => {
    const revised = reviseForecast(original, {
      date: "1922-09-05",
      reason: "supplement",
      windows: [{ label: "bottom", from: "1922-09-28", to: "1922-10-02", expect: "low" }],
    });
    const turns = [{ date: "1922-09-30", kind: "low" as const }];
    expect(scoreForecast(revised, turns, "original").hits).toBe(0);
    expect(scoreForecast(revised, turns, "revised").hits).toBe(1);
  });

  it("refuses a revision that would change a window already under way (hindsight)", () => {
    expect(() =>
      reviseForecast(original, { date: "1922-09-16", reason: "late", windows: [{ label: "bottom", from: "1922-09-28", to: "1922-10-02", expect: "low" }] }),
    ).toThrow(/under way/);
  });

  it("records the macro windows as an issued forecast with no revisions", () => {
    const r = macroForecastRecord(new Date("2026-10-16T00:00:00Z"));
    expect(r.issued).toBe("2026-10-16");
    expect(r.windows.length).toBeGreaterThan(0);
    expect(r.revisions).toEqual([]);
  });
});
