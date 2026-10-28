/**
 * The yearly-cycle badge on the chart's Research tab. CYC-30: a time line is
 * shown only with its measured record (lib/gann/timeRecords.ts), and the
 * yearly-cycle convergence has none yet, so it is hidden even with hits; it
 * is absent with no hits or missing fields too.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MarketTabs } from "./market-tabs";
import type { GannLevels, PublicScanResult } from "@/lib/types";
import { toChartLevels } from "@/lib/scoring/public-summary";
import { TIME_LINE_RECORDS } from "@/lib/gann/timeRecords";

function scan(gann: Partial<GannLevels>): PublicScanResult {
  return {
    symbol: "F",
    assetClass: "us_equity",
    scannedAt: "2026-09-25T15:00:00.000Z",
    currentPrice: 12,
    direction: "bullish",
    setupKind: "reversion",
    momentumElevated: false,
    trends: [],
    chartLevels: toChartLevels({
      fanLines: [],
      squareOf9: [],
      timeCycleActive: false,
      timeCycleBullishActive: false,
      timeCycleBearishActive: false,
      timeCycleDates: [],
      angleSlopes: [],
      retracementLevels: [],
      digitalRootConfluences: [],
      ...gann,
    }),
    pattern: null,
    armedPatterns: [],
    levels: null,
    decision: { score: 5, outputState: "Watch", breakdown: [] },
  } as PublicScanResult;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MarketTabs yearly-cycle badge", () => {
  it("stays hidden with hits while the yearly cycles have no measured record", () => {
    expect(TIME_LINE_RECORDS.yearCycles).toBeNull();
    render(<MarketTabs symbol="F" result={scan({ yearCycleBullishHits: 2, yearCycleBearishHits: 0 })} />);
    expect(screen.queryByText("Long-term timing lines up")).toBeNull();
  });

  it("shows the turn window with its measured record", () => {
    render(<MarketTabs symbol="F" result={scan({ timeCycleActive: true })} />);
    expect(screen.getByText("Cyclical turn window")).toBeTruthy();
    expect(screen.getByText(/no better than chance/)).toBeTruthy();
  });

  it("is absent with no hits, or when the fields are missing", () => {
    render(<MarketTabs symbol="F" result={scan({ yearCycleBullishHits: 0, yearCycleBearishHits: 0 })} />);
    expect(screen.queryByText("Long-term timing lines up")).toBeNull();
    cleanup();
    render(<MarketTabs symbol="F" result={scan({})} />);
    expect(screen.queryByText("Long-term timing lines up")).toBeNull();
  });
});
