/**
 * The yearly-cycle badge on the chart's Research tab: shown when the monthly
 * chart has any yearly cycles landing this month, absent otherwise (including
 * when the fields are missing, as they are on older cached results).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MarketTabs } from "./market-tabs";
import type { GannLevels, ScanResult } from "@/lib/types";

function scan(gann: Partial<GannLevels>): ScanResult {
  return {
    symbol: "F",
    assetClass: "us_equity",
    scannedAt: "2026-09-25T15:00:00.000Z",
    currentPrice: 12,
    direction: "bullish",
    setupKind: "reversion",
    momentumElevated: false,
    trends: [],
    gann: {
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
    },
    pattern: null,
    armedPatterns: [],
    levels: null,
    decision: { score: 5, outputState: "Watch", breakdown: [] },
  } as ScanResult;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MarketTabs yearly-cycle badge", () => {
  it("shows when yearly cycles converge on this month", () => {
    render(<MarketTabs symbol="F" result={scan({ yearCycleBullishHits: 2, yearCycleBearishHits: 0 })} />);
    expect(screen.getByText("Yearly cycles converging")).toBeTruthy();
  });

  it("is absent with no hits, or when the fields are missing", () => {
    render(<MarketTabs symbol="F" result={scan({ yearCycleBullishHits: 0, yearCycleBearishHits: 0 })} />);
    expect(screen.queryByText("Yearly cycles converging")).toBeNull();
    cleanup();
    render(<MarketTabs symbol="F" result={scan({})} />);
    expect(screen.queryByText("Yearly cycles converging")).toBeNull();
  });
});
