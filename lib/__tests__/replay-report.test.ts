/**
 * The reporting script's two jobs that do not need a market-data feed:
 * deciding whether a run may be published at all, and rendering it.
 *
 * `markdown`, `parseArgs` and `refuseReason` are exported from a script whose
 * `main()` otherwise spins up Vite and hits a vendor. The refusals are the part
 * worth pinning: this file exists because a table of confident numbers
 * describing a seeded random walk is exactly how a placeholder became a
 * published finding once already.
 */

import { describe, expect, it } from "vitest";
import { markdown, parseArgs, refuseReason } from "../../scripts/replay-report.mjs";

const report = {
  source: "alpaca",
  live: true,
  timeframe: "15Min",
  targetR: 2,
  breakEvenWinRate: 1 / 3,
  symbols: ["SPY", "AAPL"],
  skipped: [],
  window: { from: "2026-06-15T12:00:00Z", to: "2026-08-12T17:15:00Z" },
  overall: { trades: 100, winRate: 0.4, expectancyR: 0.2, totalR: 20, profitable: true },
  buckets: [
    { bucket: "Execute", trades: 60, winRate: 0.45, expectancyR: 0.35, totalR: 21, profitable: true },
    { bucket: "Watch", trades: 40, winRate: 0.3, expectancyR: -0.02, totalR: -0.8, profitable: false },
    { bucket: "Reject", trades: 0, winRate: 0, expectancyR: 0, totalR: 0, profitable: false },
  ],
  armed: 300,
  triggered: 100,
  attributeWithin: "Execute",
  factors: [
    {
      criterion: "timeCycle",
      observed: 60,
      passed: { n: 50, wins: 24, winRate: 0.48, expectancyR: 0.4 },
      failed: { n: 10, wins: 3, winRate: 0.3, expectancyR: 0.05 },
      deltaExpectancyR: 0.35,
      deltaWinRate: 0.18,
      correlation: 0.12,
      verdict: "informative",
    },
    {
      criterion: "patternArmed",
      observed: 60,
      passed: { n: 60, wins: 27, winRate: 0.45, expectancyR: 0.35 },
      failed: { n: 0, wins: 0, winRate: 0, expectancyR: 0 },
      verdict: "constant",
    },
  ],
  atrBands: [{ from: 1, to: 1.5, trades: 60, winRate: 0.45, expectancyR: 0.35 }],
  generatedAt: "2026-08-12T17:26:33.746Z",
};

describe("refuseReason", () => {
  it("publishes a live run that traded", () => {
    expect(refuseReason(report)).toBeNull();
  });

  it("refuses a synthetic run, however complete its table", () => {
    const reason = refuseReason({ ...report, live: false, source: "synthetic" });

    expect(reason).toContain("synthetic");
    expect(reason).toContain("seeded random walk");
  });

  it("refuses a run that took no trades", () => {
    const empty = { ...report, overall: { ...report.overall, trades: 0 }, triggered: 0 };

    expect(refuseReason(empty)).toContain("no trades");
  });

  // A payload loaded with --from goes through the same gate as a fresh run:
  // where a synthetic report was produced changes nothing about publishing it.
  it("applies to a loaded payload identically", () => {
    expect(refuseReason({ ...report, live: false })).not.toBeNull();
  });
});

describe("markdown", () => {
  it("states the window, the break-even rate and the provenance", () => {
    const out = markdown(report, { within: "Execute" });

    expect(out).toContain("2026-06-15 → 2026-08-12");
    expect(out).toContain("33.3%");
    expect(out).toContain("alpaca (live feed)");
    expect(out).toContain("| Armed / triggered | 300 / 100 |");
  });

  it("marks each bucket above or below break-even rather than leaving the reader to divide", () => {
    const out = markdown(report, { within: "Execute" });
    const execute = out.split("\n").find((l) => l.startsWith("| Execute |"));
    const watch = out.split("\n").find((l) => l.startsWith("| Watch |"));

    expect(execute).toContain("| yes |");
    expect(watch).toContain("| no |");
  });

  it("dashes an empty bucket instead of reporting 0.0% and +0.000R", () => {
    const out = markdown(report, { within: "Execute" });
    const reject = out.split("\n").find((l) => l.startsWith("| Reject |"));

    expect(reject).toBe("| Reject | 0 | — | — | — | — |");
  });

  it("leaves a constant criterion's missing arm blank, not zero", () => {
    const out = markdown(report, { within: "Execute" });
    const constant = out.split("\n").find((l) => l.startsWith("| patternArmed |"));

    expect(constant).toContain("constant");
    expect(constant).not.toContain("+0.000R");
  });

  it("names the payload only when one was rendered", () => {
    const captured = markdown(report, { within: "Execute", from: "docs/replay-runs/x.json" });
    const local = markdown(report, { within: "Execute" });

    expect(captured).toContain("docs/replay-runs/x.json");
    expect(local).not.toContain("Run by");
  });

  it("reproduces from the report, not from the flags it was handed", () => {
    // A payload rendered with default flags must not print a command that would
    // replay a different universe than the one the numbers describe.
    const out = markdown(report, { within: "Reject", from: "x.json" });

    expect(out).toContain("--symbols SPY,AAPL --timeframe 15Min --targetR 2 --within Execute");
  });

  it("renders no large-cap section for an older payload that lacks the field", () => {
    // --from can load a report committed before this session's change.
    const out = markdown(report, { within: "Execute" });
    expect(out).not.toContain("## Large-cap vs. not");
  });

  it("renders the large-cap split and states which stop model produced it", () => {
    const withSplit = {
      ...report,
      useProductionStop: true,
      largeCapSplit: {
        largeCap: { trades: 30, winRate: 0.5, expectancyR: 0.4, totalR: 12, profitable: true },
        notLargeCap: { trades: 70, winRate: 0.35, expectancyR: 0.1, totalR: 7, profitable: true },
      },
    };
    const out = markdown(withSplit, { within: "Execute" });
    expect(out).toContain("production (leeway + large-cap widening)");
    expect(out).toContain("## Large-cap vs. not");
    const largeCapRow = out.split("\n").find((l) => l.startsWith("| Large-cap |"));
    const notLargeCapRow = out.split("\n").find((l) => l.startsWith("| Not large-cap |"));
    expect(largeCapRow).toContain("50.0%");
    expect(notLargeCapRow).toContain("35.0%");
    expect(out).toContain("--productionStop");
  });

  it("states the raw-pattern stop model when useProductionStop is unset", () => {
    const out = markdown(report, { within: "Execute" });
    expect(out).toContain("raw pattern (original harness behaviour)");
    expect(out).not.toContain("--productionStop");
  });

  it("renders no required-metrics section for an older payload that lacks the field", () => {
    const out = markdown(report, { within: "Execute" });
    expect(out).not.toContain("## Required performance metrics");
  });

  it("renders the required performance metrics when present", () => {
    const required = {
      sampleSize: 60,
      avgWinR: 0.5,
      medianWinR: 0.4,
      avgLossR: -0.3,
      medianLossR: -0.25,
      maxLossR: -1.1,
      profitFactor: 1.8,
      maxDrawdownR: 2.3,
      avgBarsHeld: 5,
      medianBarsHeld: 4,
    };
    const withMetrics = {
      ...report,
      overall: { ...report.overall, required },
      buckets: report.buckets.map((b) => ({ ...b, required })),
      strategyVersion: "2026-08-27-role-aware-proximity",
    };
    const out = markdown(withMetrics, { within: "Execute" });

    expect(out).toContain("## Required performance metrics");
    expect(out).toContain("| Strategy version | 2026-08-27-role-aware-proximity |");
    const executeRows = out.split("\n").filter((l) => l.startsWith("| Execute | 60 |"));
    expect(executeRows.some((l) => l.includes("+0.500R") && l.includes("1.80"))).toBe(true);
  });

  it("renders the slippage-sensitivity section only when present", () => {
    expect(markdown(report, { within: "Execute" })).not.toContain("Slippage sensitivity");

    const withSensitivity = {
      ...report,
      slippageSensitivity: {
        costPerShare: 0.02,
        elevatedCostPerShare: 0.06,
        baseExpectancyR: 0.2,
        elevatedExpectancyR: 0.05,
        expectancyDeltaR: -0.15,
      },
    };
    const out = markdown(withSensitivity, { within: "Execute" });
    expect(out).toContain("### Slippage sensitivity");
    expect(out).toContain("-0.150R");
  });
});

describe("parseArgs", () => {
  it("defaults to writing the results file", () => {
    expect(parseArgs([]).out).toBe("docs/REPLAY_RESULTS.md");
  });

  it("takes --from with either spelling", () => {
    expect(parseArgs(["--from", "a.json"]).from).toBe("a.json");
    expect(parseArgs(["--from=b.json"]).from).toBe("b.json");
  });

  it("takes --since, and defaults it to the timeframe's own lookback", () => {
    expect(parseArgs(["--since", "2026-06-15"]).since).toBe("2026-06-15");
    expect(parseArgs([]).since).toBeNull();
  });

  it("rejects an unknown flag rather than silently ignoring it", () => {
    expect(() => parseArgs(["--symbol", "SPY"])).toThrow(/Unknown argument/);
  });

  it("defaults productionStop to false and flips it on --productionStop", () => {
    expect(parseArgs([]).productionStop).toBe(false);
    expect(parseArgs(["--productionStop"]).productionStop).toBe(true);
    // A flag, not a value — the next token is the next flag, not consumed as its value.
    expect(parseArgs(["--productionStop", "--symbols", "SPY"]).symbols).toEqual(["SPY"]);
  });
});
