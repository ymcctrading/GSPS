import { describe, expect, it } from "vitest";
import {
  intradayMarkers,
  isIntradayChart,
  markersForTimeframe,
  panelChartPlan,
  type PlanMarker,
} from "@/lib/chart/planForTimeframe";

const daily: PlanMarker[] = [
  { price: 100, label: "Entry", kind: "entry" },
  { price: 96, label: "SL", kind: "stop" },
  { price: 110, label: "TP1", kind: "target" },
  { price: 120, label: "MTP", kind: "target" },
  { price: 95, label: "Support 1x1", kind: "structural" },
];
const intraday = intradayMarkers({ entry: 101.2, stop: 100.4, firstTarget: 102.5, masterTarget: 103 });

describe("markersForTimeframe", () => {
  it("draws the daily (Swing) plan on daily and longer charts", () => {
    for (const tf of ["1Day", "1Week", "1Month"] as const) expect(markersForTimeframe(tf, daily, intraday)).toEqual(daily);
  });

  it("draws the intraday plan in place of the daily plan on intraday charts, keeping the structural levels", () => {
    for (const tf of ["15Min", "1Hour", "5Min"] as const) {
      const shown = markersForTimeframe(tf, daily, intraday);
      expect(shown.map((m) => m.label)).toEqual(["Support 1x1", "Intraday entry", "Intraday SL", "Intraday TP1", "Intraday MTP"]);
      expect(shown.some((m) => m.label === "Entry" || m.label === "MTP")).toBe(false);
    }
  });

  it("draws no plan lines on an intraday chart when no intraday alert stands", () => {
    expect(markersForTimeframe("15Min", daily, [])).toEqual([daily[4]]);
  });

  it("knows which timeframes are intraday", () => {
    expect(isIntradayChart("1Hour")).toBe(true);
    expect(isIntradayChart("1Day")).toBe(false);
  });
});

describe("intradayMarkers", () => {
  it("labels each line Intraday and leaves out what the plan doesn't have", () => {
    expect(intradayMarkers({ entry: null, stop: 99, firstTarget: 104, masterTarget: null })).toEqual([
      { price: 99, label: "Intraday SL", kind: "stop" },
      { price: 104, label: "Intraday TP1", kind: "target" },
    ]);
    expect(intradayMarkers(null)).toEqual([]);
    expect(intradayMarkers({ entry: NaN, stop: 0, firstTarget: -1, masterTarget: null })).toEqual([]);
  });
});

describe("panelChartPlan", () => {
  const plan = { entry: 101.2, stop: 100.4, firstTarget: 102.5, masterTarget: 103 };
  const answered = { symbol: "SPY", known: true, locked: false, failed: false };

  it("gives the chart the panel's alert, or null when none stands", () => {
    expect(panelChartPlan(answered, () => plan)).toEqual(plan);
    expect(panelChartPlan(answered, () => null)).toBeNull();
  });

  it("leaves the daily plan on every timeframe for a viewer without intraday access", () => {
    const locked = panelChartPlan({ ...answered, locked: true }, () => plan);
    expect(locked).toBeUndefined();
    expect(intradayMarkers(locked)).toBeUndefined();
  });

  it("has no say before the panel answers, when its read failed, or for several symbols", () => {
    expect(panelChartPlan({ ...answered, known: false }, () => plan)).toBeUndefined();
    expect(panelChartPlan({ ...answered, failed: true }, () => plan)).toBeUndefined();
    expect(panelChartPlan({ ...answered, symbol: null }, () => plan)).toBeUndefined();
  });
});
