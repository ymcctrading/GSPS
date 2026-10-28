/**
 * Gann Confluence Layer / Sara Confluence Layer card — renders the
 * three-way framework identity and each module's alignment read, never a
 * per-criterion explanation-trace note, and never a raw internal scenario
 * code (routes through the pattern glossary instead).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfluenceCard } from "./confluence-card";
import type { ScanResult } from "@/lib/types";
import { EMPTY_DISCLOSED_RULES } from "@/lib/gann/disclosedRules";
import { masterTwelveCell } from "@/lib/gann/masterTwelve";

const baseResult: Omit<ScanResult, "signals"> = {
  symbol: "AAPL",
  assetClass: "us_equity",
  scannedAt: "2026-08-08T00:00:00Z",
  currentPrice: 100,
  direction: "bullish",
  setupKind: "reversion",
  momentumElevated: true,
  trends: [],
  gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleBullishActive: false, timeCycleBearishActive: false, timeCycleDates: [], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
  pattern: null,
  armedPatterns: [],
  levels: null,
  decision: { score: 0, outputState: "Reject", breakdown: [] },
};

const baseSignals = {
  regime: { regime: "trend" as const, direction: "bullish" as const, reasons: [], disqualifiers: [] },
  trendPullback: null,
  trendBreakout: null,
  confirmedReversal: null,
  rangeReversion: null,
};

function makeResult(): ScanResult {
  return {
    ...baseResult,
    signals: {
      ...baseSignals,
      gannConfluence: {
        module: {
          moduleId: "gann_confluence_layer",
          moduleType: "gann",
          displayName: "Structural Coordinate Confluence",
          authorizedSource: "lib/gann",
          version: "0.1.0",
        },
        market: "equities",
        marketAdapterStatus: "supported",
        alignment: "aligned",
        root: 10.1,
        nearestSquareOf9: { degree: 0, price: 105, distancePct: 1, rotation: 0, role: "support" },
        nearestFanLine: null,
        timeCycleActive: false,
        timeCycleDates: [],
        timeCycleFixedCalendarActive: false,
        timeCycleFixedCalendarDates: [],
        decadeCycle: { yearDigit: 5, bias: "bullish", currentBias: "bullish", label: "Year of Ascension", note: "" },
        macroCycle: {
          active: false,
          majorActive: false,
          bullishActive: false,
          bearishActive: false,
          activeWindows: [],
          upcomingMajor: [],
        },
        nearestMasterTwelve: null,
        masterTwelve: null,
        squareOf52: { active: false, dates: [] },
        angleMonthCounts: { active: false, dates: [] },
        spectralCycle: {
          active: false,
          dominantPeriodBars: null,
          dominancePower: null,
          repetitionCount: null,
          periodConsistent: null, schusterP: null, cosinor: null, atBandEdge: null, windowStable: null, holdout: null, homogeneity: null,
          hypothesisOnly: true,
          note: "",
        },
        campaignLeg: { legNumber: null, confidence: null },
        boilingPoint: [],
        vortexContext: {
          priceDisplacement: {
            rawValue: 25,
            normalizationMethod: "price_displacement_ticks",
            integerValue: 25,
            mod9Residue: 7,
            activeDigitalRoot: 7,
            inputTimestamp: "x",
            sourceTimeframe: "1d",
            featureVersion: "0.1.0",
          },
          timeDisplacement: null,
          priceVortexClass: "VORTEX_FLOW",
          timeVortexClass: null,
          relationship: null,
          transition: null,
        },
        angleSlope: null,
        coordinateLedger: [],
        disclosedRules: EMPTY_DISCLOSED_RULES,
        materialNumberClassification: "notImplemented",
        evidence: { calculationVersion: "0.1.0", inputs: { secretNote: "internal threshold" }, sourceTimestamp: "x", explanationTrace: ["secret internal trace"] },
        note: "Confluence only.",
      },
      saraConfluence: {
        module: {
          moduleId: "sara_sniper_confluence_layer",
          moduleType: "sara",
          displayName: "Price-Action Confirmation Confluence",
          authorizedSource: "lib/strat/patterns.ts",
          version: "0.1.0",
        },
        market: "equities",
        marketAdapterStatus: "supported",
        alignment: "conflict",
        scenarioId: "2-1-2",
        direction: "bullish",
        timeframeContinuity: "notConfirmed",
        confirmationState: "closedBarConfirmed",
        evidence: { calculationVersion: "0.1.0", inputs: {}, sourceTimestamp: "x", explanationTrace: ["secret internal trace"] },
        note: "Confluence factor only.",
      },
    },
  };
}

describe("ConfluenceCard", () => {
  it("renders nothing when the scan has no signals field", () => {
    const { container } = render(<ConfluenceCard result={{ ...baseResult, signals: undefined }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when both confluence modules are disabled (null)", () => {
    const { container } = render(
      <ConfluenceCard
        result={{ ...baseResult, signals: { ...baseSignals, gannConfluence: null, saraConfluence: null } }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows both readings as plain-English agreement badges", () => {
    const result = makeResult();

    render(<ConfluenceCard result={result} />);

    expect(screen.getByText("Context")).toBeInTheDocument();
    expect(screen.getByText("Price levels and timing")).toBeInTheDocument();
    expect(screen.getByText("Bar pattern")).toBeInTheDocument();
    expect(screen.getByText("Agrees")).toBeInTheDocument();
    expect(screen.getByText("Disagrees")).toBeInTheDocument();
    expect(screen.getByText(/nearest key price level is 105.00, acting as support/)).toBeInTheDocument();
    expect(screen.queryByText("secret internal trace")).not.toBeInTheDocument();
    // The raw internal scenario code never reaches the DOM — only the
    // plain-language glossary term does.
    expect(screen.queryByText(/2-1-2/)).not.toBeInTheDocument();
    expect(screen.getByText(/Pause continuation/i)).toBeInTheDocument();
  });
});

/**
 * CYC-47 (Tomes, W043) and CYC-30 (Halberg, W041 pp. 29-30): a dated forward
 * claim needs its method and a measured record, and a rhythm is shown by
 * inference, not by eye alone. A time line on the card shows its measured
 * record, or is not shown.
 */
describe("time lines carry their measured record or are hidden", () => {
  function withTime(): ScanResult {
    const r = makeResult();
    const g = r.signals!.gannConfluence!;
    g.timeCycleActive = true;
    g.macroCycle = {
      active: true,
      majorActive: true,
      bullishActive: true,
      bearishActive: false,
      activeWindows: [{ anchor: "August 1896 bottom", bullish: true, month: "2026-08", yearsElapsed: 130, cycleYears: [1, 2, 5, 10], majorCycleYears: [5, 10] }],
      upcomingMajor: [{ anchor: "April 1897 low", bullish: true, month: "2027-04", yearsElapsed: 130, cycleYears: [1, 2, 5, 10], majorCycleYears: [5, 10] }],
    };
    g.squareOf52 = { active: true, dates: [] };
    g.angleMonthCounts = { active: true, dates: [] };
    g.disclosedRules = {
      ...EMPTY_DISCLOSED_RULES,
      dayCountBands: [{ pivotDate: "2026-07-01", pivotKind: "low", daysSincePivot: 30, band: [28, 31] }],
      timing: { alternation: { daysSincePivot: 14, mark: 14 }, square144: null, projection: { kind: "top", medianDate: "2026-11-02", spreadDays: 4, count: 3 }, changeDates: null },
    } as typeof g.disclosedRules;
    return r;
  }

  it("drops a fan line's time target, which has no measured record (R-024)", () => {
    const r = withTime();
    r.signals!.gannConfluence!.nearestFanLine = {
      angle: "1x1 (low)",
      price: 100,
      distancePct: 0.5,
      anchor: { price: 90, index: 10, kind: "low" },
      role: "support",
      timeProjectionDate: "2027-01-15",
      rank: 1,
    };
    render(<ConfluenceCard result={r} />);
    expect(screen.getByText(/A trend line from the last low sits at 100.00/)).toBeInTheDocument();
    expect(screen.queryByText(/1x1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2027-01-15/)).not.toBeInTheDocument();
  });

  it("drops the macro cycle's next major date, which has no measured record (CYC-47)", () => {
    render(<ConfluenceCard result={withTime()} />);
    expect(screen.queryByText(/Next major/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2027-04/)).not.toBeInTheDocument();
  });

  it("shows the time-cycle and day-count lines with their measured record (CYC-30)", () => {
    render(<ConfluenceCard result={withTime()} />);
    expect(screen.getByText(/A timing window is open/)).toBeInTheDocument();
    expect(screen.getByText(/30 days since the last turn/)).toBeInTheDocument();
    expect(screen.getAllByText(/no better than chance/i).length).toBe(2);
  });

  it("hides time lines that have no measured record (CYC-30)", () => {
    render(<ConfluenceCard result={withTime()} />);
    for (const label of [/long-term timing window/, /weekly timing window/, /monthly timing window/, /14 days since/, /possible swing/]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});

/**
 * A-TIME-03, C-SWING-01 and C-TIME-03 are context readings whose description
 * lives only in the explanation trace, which every API response empties. The
 * card shows them as tiles from the structured reading instead. A-TIME-16's
 * dated change-date label stays off the card until it has a measured record
 * (CYC-47).
 */
describe("context readings reach the card", () => {
  function withContext(): ScanResult {
    const r = makeResult();
    const g = r.signals!.gannConfluence!;
    g.disclosedRules = {
      ...EMPTY_DISCLOSED_RULES,
      campaign: { equalCorrections: true, counterMoveThirdMonth: false },
      firstRally: { lowMonth: "2026-01", topMonth: "2026-03", advanceMonths: 2, volumeRatio: 2.1, state: "firstRally" },
      cycleRangeBreak: { rangeDays: 4, rangeLow: 99, rangeHigh: 101, volumeRatio: 2.5, onCycleDate: true, shortSetup: true },
      timing: {
        alternation: null,
        square144: null,
        projection: null,
        changeDates: { dates: [{ date: "2026-11-09", days: 14, expect: "high", came: null }], next: { date: "2026-11-09", days: 14, expect: "high", came: null } },
      },
    } as unknown as typeof g.disclosedRules;
    return r;
  }

  it("shows the first rally out of a bear market (A-TIME-03)", () => {
    render(<ConfluenceCard result={withContext()} />);
    expect(screen.getByText(/advance from the bear-market low is a first rally so far/)).toBeInTheDocument();
  });

  it("shows a bull campaign of three months or more (A-TIME-03)", () => {
    const r = withContext();
    const rules = r.signals!.gannConfluence!.disclosedRules;
    rules.firstRally = { lowMonth: "2026-01", topMonth: "2026-05", advanceMonths: 4, volumeRatio: 1.2, state: "bullCampaign" };
    render(<ConfluenceCard result={r} />);
    expect(screen.getByText(/bull trend has run 4 months/)).toBeInTheDocument();
  });

  it("shows nearly equal reactions in an uptrend (C-SWING-01)", () => {
    render(<ConfluenceCard result={withContext()} />);
    expect(screen.getByText(/last three pullbacks in the uptrend were nearly equal/)).toBeInTheDocument();
  });

  it("shows a range broken on volume, with the time-cycle record beside its date (C-TIME-03)", () => {
    render(<ConfluenceCard result={withContext()} />);
    expect(screen.getByText(/4-day range broke down on 2.5× volume, inside a timing window/)).toBeInTheDocument();
    expect(screen.getAllByText(/no better than chance/i).length).toBeGreaterThan(0);
  });

  it("labels each of the three as context that does not change the setup", () => {
    render(<ConfluenceCard result={withContext()} />);
    expect(screen.getAllByText(/does not change the setup/).length).toBe(3);
  });

  it("keeps the dated change-date label off the card while it has no measured record (A-TIME-16)", () => {
    render(<ConfluenceCard result={withContext()} />);
    expect(screen.queryByText(/2026-11-09/)).not.toBeInTheDocument();
    expect(screen.queryByText(/possible high/i)).not.toBeInTheDocument();
  });
});

describe("the 12-by-12 time chart stays off the card (confidential sources, 2026-10-28)", () => {
  it("shows no grid reading even when one is computed", () => {
    const r = makeResult();
    r.signals!.gannConfluence!.masterTwelve = { count: 144, unit: "bars", cell: masterTwelveCell(144)! };
    render(<ConfluenceCard result={r} />);
    expect(screen.queryByText(/144 bars/)).not.toBeInTheDocument();
    expect(screen.queryByText(/square end/)).not.toBeInTheDocument();
  });
});

