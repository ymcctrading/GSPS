import { describe, expect, it } from "vitest";
import { MAX_RECENT_CHARTS, withRecentChart } from "@/lib/charts/recent";

describe("withRecentChart", () => {
  it("puts the symbol first, upper-cased, once", () => {
    expect(withRecentChart(["AAPL", "SPY", "TSLA"], "spy")).toEqual(["SPY", "AAPL", "TSLA"]);
  });

  it("keeps only the most recent", () => {
    const list = ["A", "B", "C", "D", "E"];
    expect(withRecentChart(list, "F")).toEqual(["F", "A", "B", "C", "D"]);
    expect(withRecentChart(list, "F")).toHaveLength(MAX_RECENT_CHARTS);
  });

  it("ignores a blank symbol", () => {
    expect(withRecentChart(["SPY"], "  ")).toEqual(["SPY"]);
  });
});
