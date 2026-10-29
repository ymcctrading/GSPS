/**
 * The universe runner's pure half: argument parsing, cell validation, the
 * bootstrap statistics a production-vs-baseline decision rests on, and the
 * warning that catches a cell whose option the checked-out ref ignores.
 * `main()` needs Vite and a live vendor, so it is exercised by the workflow,
 * not here.
 */

import { describe, expect, it } from "vitest";
import {
  bootstrapDiffCI,
  bootstrapMeanCI,
  coreCampaignSummary,
  ladderRowsFromCore,
  describeTrades,
  factorTable,
  splitTable,
  EXIT_REASON_OF,
  parseArgs,
  summarizeCells,
  summaryMarkdown,
  TRADE_CSV_COLUMNS,
  tradesCsv,
  tradesCsvLogBlock,
  validateCells,
} from "../../scripts/backtest-universe.mjs";
import { gunzipSync } from "node:zlib";
import { monteCarloResample } from "@/lib/backtest/monteCarlo";

const trade = (over: Record<string, unknown>) => ({
  symbol: "AAA",
  openedAt: "2026-09-01T14:00:00Z",
  entry: 10,
  rMultiple: 1,
  outcome: "win",
  outputState: "Execute",
  ...over,
});

describe("parseArgs", () => {
  it("requires --out and applies defaults", () => {
    expect(() => parseArgs([])).toThrow(/--out/);
    const a = parseArgs(["--out", "x"]);
    expect(a).toMatchObject({ universe: "large-cap", timeframe: "15Min", targetR: 2, symbolsPerMinute: 30 });
  });

  it("accepts both --flag value and --flag=value", () => {
    const a = parseArgs(["--out=x", "--universe", "mega-12", "--limit=5", "--symbolsPerMinute", "0", "--allowSynthetic"]);
    expect(a).toMatchObject({ out: "x", universe: "mega-12", limit: 5, symbolsPerMinute: 0, allowSynthetic: true });
  });

  it("rejects unknown flags and bad numbers", () => {
    expect(() => parseArgs(["--out", "x", "--nope", "1"])).toThrow(/Unknown flag/);
    expect(() => parseArgs(["--out", "x", "--targetR", "0"])).toThrow(/targetR/);
  });

  it("takes an --offset to split a long run, 0 by default", () => {
    expect(parseArgs(["--out", "x"]).offset).toBe(0);
    expect(parseArgs(["--out", "x", "--offset", "383", "--limit", "383"])).toMatchObject({ offset: 383, limit: 383 });
    expect(() => parseArgs(["--out", "x", "--offset", "-1"])).toThrow(/offset/);
    expect(() => parseArgs(["--out", "x", "--offset", "1.5"])).toThrow(/offset/);
  });
});

describe("validateCells", () => {
  it("rejects empty, duplicate and unsafe labels", () => {
    expect(() => validateCells([])).toThrow();
    expect(() => validateCells([{ label: "a" }, { label: "a" }])).toThrow(/Duplicate/);
    expect(() => validateCells([{ label: "../x" }])).toThrow(/filesystem-safe/);
    expect(() => validateCells([{ label: "a", options: [] }])).toThrow(/options/);
    expect(validateCells([{ label: "base-1", options: { useProductionStop: true } }])).toHaveLength(1);
  });

  it("takes the intraday profile's own options on that profile only, as the route does", () => {
    expect(() => validateCells([{ label: "a", options: { reactionEntry: true } }])).toThrow(/intraday/);
    expect(() => validateCells([{ label: "a", options: { profile: "swing", scaleOut: false } }])).toThrow(/intraday/);
    const live = { profile: "intraday", reactionEntry: true, sessionPlans: true, scaleOut: false };
    expect(validateCells([{ label: "a", options: live }])).toHaveLength(1);
  });
});

describe("bootstrap CIs", () => {
  const values = Array.from({ length: 200 }, (_, i) => (i % 3 === 0 ? 2 : -1));
  const m = values.reduce((s, v) => s + v, 0) / values.length;

  it("brackets the sample mean and is reproducible", () => {
    const ci = bootstrapMeanCI(values)!;
    expect(ci[0]).toBeLessThan(m);
    expect(ci[1]).toBeGreaterThan(m);
    expect(bootstrapMeanCI(values)).toEqual(ci);
  });

  it("returns null when there is too little data", () => {
    expect(bootstrapMeanCI([1])).toBeNull();
    expect(bootstrapDiffCI([1], [1, 2])).toBeNull();
  });

  it("separates clearly different samples and not identical ones", () => {
    const worse = values.map((v) => v - 1);
    const d = bootstrapDiffCI(values, worse)!;
    expect(d[0]).toBeGreaterThan(0);
    const same = bootstrapDiffCI(values, values)!;
    expect(same[0]).toBeLessThan(0);
    expect(same[1]).toBeGreaterThan(0);
  });
});

describe("describeTrades", () => {
  it("splits into chronological halves and computes profit factor", () => {
    const trades = [
      trade({ openedAt: "2026-09-04T14:00:00Z", rMultiple: -1, outcome: "loss" }),
      trade({ openedAt: "2026-09-01T14:00:00Z", rMultiple: 2 }),
      trade({ openedAt: "2026-09-03T14:00:00Z", rMultiple: -1, outcome: "loss" }),
      trade({ openedAt: "2026-09-02T14:00:00Z", rMultiple: 2 }),
    ];
    const d = describeTrades(trades);
    expect(d.n).toBe(4);
    expect(d.expectancyR).toBeCloseTo(0.5);
    expect(d.winRate).toBe(0.5);
    expect(d.profitFactor).toBeCloseTo(2);
    expect(d.halves.first).toMatchObject({ n: 2, expectancyR: 2 });
    expect(d.halves.second).toMatchObject({ n: 2, expectancyR: -1 });
  });
});

describe("summarizeCells", () => {
  const a = [trade({ rMultiple: 2 }), trade({ symbol: "BBB", rMultiple: -1, outcome: "loss", outputState: "Watch" })];

  it("warns when different options produce identical trades", () => {
    const s = summarizeCells([
      { cell: { label: "base", options: {} }, trades: a },
      { cell: { label: "confirmed", options: { requireEntryConfirmation: true } }, trades: a },
    ]);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]).toMatch(/probably not implemented/);
  });

  it("does not warn for genuinely different results, and reports scoped stats and diffs", () => {
    const b = [trade({ rMultiple: -1, outcome: "loss" })];
    const s = summarizeCells([
      { cell: { label: "base", options: {} }, trades: a },
      { cell: { label: "confirmed", options: { requireEntryConfirmation: true } }, trades: b },
    ]);
    expect(s.warnings).toHaveLength(0);
    expect(s.cells[0].scopes.Execute.n).toBe(1);
    expect(s.cells[0].scopes.Watch.n).toBe(1);
    expect(s.cells[0].scopes.all.n).toBe(2);
    expect(s.differencesVsFirst[0].scopes.Execute.diffR).toBeCloseTo(-3);
    const md = summaryMarkdown(
      {
        universe: "mega-12", symbolsUsed: 2, symbolsRequested: 2, ref: "r", sha: "s", timeframe: "15Min",
        targetR: 2, source: "synthetic", live: false, window: { from: null, to: null }, generatedAt: "t", skipped: [],
      },
      s,
    );
    expect(md).toContain("SYNTHETIC — do not publish");
    expect(md).toContain("confirmed − base");
    expect(md).not.toContain("Partial:");
    const partial = summaryMarkdown(
      {
        universe: "mega-12", symbolsUsed: 2, symbolsRequested: 766, ref: "r", sha: "s", timeframe: "1Day",
        targetR: 2, source: "synthetic", live: false, window: { from: null, to: null }, generatedAt: "t", skipped: [],
        partial: true, symbolsDone: 50,
      },
      s,
    );
    expect(partial).toContain("Partial: a checkpoint after 50 of 766 symbols.");
  });

  it("keeps reversals and re-entries out of the buckets, and prints the fill accounting", () => {
    const withDerived = [...a, trade({ symbol: "CCC", rMultiple: 4, derived: "reversal", outputState: "Execute" })];
    const s = summarizeCells([
      {
        cell: { label: "base", options: {} },
        trades: withDerived,
        accounting: { triggered: 5, refusedFills: 1, droppedPlans: 2, droppedPlanReasons: { noLevels: 0, invalidRisk: 0, targetNotBeyondEntry: 2, roundNumberHold: 0 } },
      },
    ]);
    expect(s.cells[0].scopes.Execute.n).toBe(1);
    expect(s.cells[0].scopes.all.n).toBe(3);
    expect(s.cells[0].scopes.derived.n).toBe(1);
    const md = summaryMarkdown(
      {
        universe: "mega-12", symbolsUsed: 2, symbolsRequested: 2, ref: "r", sha: "s", timeframe: "15Min",
        targetR: 2, source: "synthetic", live: false, window: { from: null, to: null }, generatedAt: "t", skipped: [],
      },
      s,
    );
    expect(md).toContain("Reversals and re-entries (derived, unscored)");
    expect(md).toContain("| base | 5 | 1 | 2 | 0 | 0 | 2 | 0 |");
  });
});

describe("closed trades (open_at_end left out, 2026-10-21)", () => {
  const meta = {
    universe: "mega-12", symbolsUsed: 2, symbolsRequested: 2, ref: "r", sha: "s", timeframe: "15Min",
    targetR: 2, source: "synthetic", live: false, window: { from: null, to: null }, generatedAt: "t", skipped: [],
  };
  const trades = [
    trade({ openedAt: "2026-09-01T14:00:00Z", rMultiple: -1, outcome: "loss", score: 7 }),
    trade({ openedAt: "2026-09-02T14:00:00Z", rMultiple: 0.5, outcome: "timeout", exitReason: "held_to_limit", score: 7 }),
    trade({ openedAt: "2026-09-03T14:00:00Z", rMultiple: 3, outcome: "timeout", exitReason: "open_at_end", score: 7 }),
    trade({ openedAt: "2026-09-04T14:00:00Z", rMultiple: 2, outcome: "timeout", exitReason: "open_at_end", score: 7 }),
  ];

  it("describes the closed trades alone beside the whole scope", () => {
    const d = describeTrades(trades);
    expect(d.n).toBe(4);
    expect(d.openAtEnd).toBe(2);
    expect(d.closed.n).toBe(2);
    expect(d.closed.expectancyR).toBeCloseTo(-0.25);
    expect(d.closed.halves.first.n + d.closed.halves.second.n).toBe(2);
    expect(d.closed.profitFactor).toBeCloseTo(0.5);
  });

  it("carries the closed stats in every scope, score band and diff, and prints them", () => {
    const s = summarizeCells([
      { cell: { label: "base", options: {} }, trades },
      { cell: { label: "other", options: { x: 1 } }, trades: trades.slice(0, 2) },
    ]);
    expect(s.cells[0].scopes.Execute.closed.n).toBe(2);
    expect(s.cells[0].scopes.all.openAtEnd).toBe(2);
    expect(s.cells[0].scoreBands[0].closed.n).toBe(2);
    expect(s.differencesVsFirst[0].scopes.Execute.closed.diffR).toBeCloseTo(0);
    const md = summaryMarkdown(meta, s);
    expect(md).toContain("Closed trades only");
    expect(md).toContain("| base | 2 | 2 | -0.250R |");
    expect(md).toContain("other − base, closed only: +0.000R");
  });
});

describe("Monte Carlo resampling in the summary", () => {
  const meta = {
    universe: "mega-12", symbolsUsed: 1, symbolsRequested: 1, ref: "r", sha: "s", timeframe: "15Min",
    targetR: 2, source: "synthetic", live: false, window: { from: null, to: null }, generatedAt: "t", skipped: [],
  };
  const trades = [
    ...Array.from({ length: 12 }, (_, i) =>
      trade({ openedAt: `2026-09-${String(i + 1).padStart(2, "0")}T14:00:00Z`, rMultiple: i % 3 === 0 ? 2 : -1, outcome: i % 3 === 0 ? "win" : "loss" }),
    ),
    trade({ openedAt: "2026-09-20T14:00:00Z", rMultiple: 4, outcome: "timeout", exitReason: "open_at_end" }),
    trade({ openedAt: "2026-09-21T14:00:00Z", rMultiple: -1, outcome: "loss", derived: "reversal" }),
    trade({ openedAt: "2026-09-22T14:00:00Z", rMultiple: 1, outcome: "win", derived: "rebuy" }),
  ];

  it("leaves the key out unless the resampler is passed", () => {
    const s = summarizeCells([{ cell: { label: "base" }, trades }]);
    expect(s.cells[0].monteCarlo).toBeUndefined();
    expect(summaryMarkdown(meta, s)).not.toContain("Monte Carlo");
  });

  it("resamples each scope, derived trades apart, and prints the bands", () => {
    const s = summarizeCells([{ cell: { label: "base" }, trades }], { monteCarlo: monteCarloResample });
    const mc = s.cells[0].monteCarlo;
    expect(mc.armed.n).toBe(12);
    expect(mc.armed.excludedOpenAtEnd).toBe(1);
    expect(mc.Execute.n).toBe(12);
    expect(mc.Watch).toBeNull();
    expect(mc.derived.n).toBe(2);
    // The other tables are unchanged by the new key.
    expect(s.cells[0].scopes.all.n).toBe(15);
    const md = summaryMarkdown(meta, s);
    expect(md).toContain("## Monte Carlo resampling");
    expect(md).toMatch(/\| base \| armed \| 12 \| 2 \|/);
  });
});

describe("per-trade CSV for the job log", () => {
  const cellResults = [
    {
      cell: { label: "base" },
      trades: [
        trade({ closedAt: "2026-09-01T15:00:00Z", direction: "bearish", score: 6, setupKind: "reversion", entryKind: "crossing", exitReason: "open_at_end", outcome: "timeout", barsHeld: 4, rMultiple: 0.5, stop: 10.4, crossedLevel: 10.1, exitPrice: 9.8 }),
        trade({ direction: "bullish", outcome: "loss", rMultiple: -1, barsHeld: 2, derived: "reversal", outputState: undefined, stop: 9.5, crossedLevel: null, exitPrice: 9.5 }),
        // A record from before the price fields existed leaves them empty.
        trade({ entry: undefined, outcome: "win", barsHeld: 1 }),
      ],
    },
  ];

  it("writes one row per trade with the named columns", () => {
    const csv = tradesCsv(cellResults);
    const rows = csv.trim().split("\n");
    expect(rows[0]).toBe(TRADE_CSV_COLUMNS.join(","));
    expect(TRADE_CSV_COLUMNS.slice(-4)).toEqual(["entryPrice", "initialStop", "crossedLevel", "exitPrice"]);
    expect(rows[1]).toBe("base,AAA,2026-09-01T14:00:00Z,2026-09-01T15:00:00Z,short,6,Execute,reversion,crossing,open_at_end,4,0.5000,,10,10.4,10.1,9.8");
    expect(rows[2]).toBe("base,AAA,2026-09-01T14:00:00Z,,long,,,,,bracket_stop,2,-1.0000,reversal,10,9.5,,9.5");
    expect(rows[3]).toBe("base,AAA,2026-09-01T14:00:00Z,,long,,Execute,,,bracket_target,1,1.0000,,,,,");
  });

  it("prints it plain between markers, and gzipped base64 when over the limit", () => {
    const csv = tradesCsv(cellResults);
    expect(tradesCsvLogBlock(csv)).toBe(`=== BEGIN trades.csv ===\n${csv}=== END trades.csv ===\n`);
    const block = tradesCsvLogBlock(csv, 10);
    const lines = block.trim().split("\n");
    expect(lines[0]).toBe("=== BEGIN trades.csv.gz.base64 ===");
    expect(lines.at(-1)).toBe("=== END trades.csv.gz.base64 ===");
    expect(gunzipSync(Buffer.from(lines.slice(1, -1).join(""), "base64")).toString("utf8")).toBe(csv);
  });
});

describe("factor table over all scored trades", () => {
  const trades = [
    trade({ score: 8, rMultiple: 2, criteria: { ruleOfThree: true }, contextFactors: { lead: true } }),
    trade({ score: 8, rMultiple: 1, criteria: { ruleOfThree: true } }),
    trade({ score: 4, outputState: "Watch", rMultiple: -1, criteria: { ruleOfThree: false }, contextFactors: { lead: false } }),
    trade({ score: 3, outputState: "Watch", rMultiple: 0, criteria: { ruleOfThree: false } }),
    // Derived trades carry no score and stay out.
    trade({ derived: "reversal", outputState: undefined, rMultiple: 5, criteria: { ruleOfThree: true } }),
  ];

  it("reads pass against fail on every scored trade and within Execute, absent keys left out", () => {
    type Row = { key: string; diffCI95: [number, number] | null } & Record<string, unknown>;
    const f = factorTable(trades) as Record<"scored" | "Execute", Row[]>;
    const r3 = f.scored.find((x) => x.key === "ruleOfThree")!;
    expect(r3).toMatchObject({ source: "criterion", passN: 2, failN: 2, passR: 1.5, failR: -0.5, diffR: 2 });
    // Normal interval: var 0.5 each side, se sqrt(0.25 + 0.25).
    expect(r3.diffCI95![0]).toBeCloseTo(2 - 1.96 * Math.sqrt(0.5));
    const lead = f.scored.find((x) => x.key === "lead");
    expect(lead).toMatchObject({ source: "context", passN: 1, failN: 1, diffCI95: null });
    // Within Execute every trade passed, so there is nothing to compare against.
    expect(f.Execute.find((x) => x.key === "ruleOfThree")).toMatchObject({ passN: 2, failN: 0, diffR: null });
  });

  it("rides in the summary and its markdown", () => {
    const s = summarizeCells([{ cell: { label: "prod" }, trades }]);
    expect(s.cells[0].factors.scored.length).toBe(2);
    const md = summaryMarkdown(
      { universe: "u", symbolsUsed: 1, symbolsRequested: 1, ref: "r", sha: "s", timeframe: "1Day", targetR: 2, source: "x", live: true, window: {}, generatedAt: "g", skipped: [] },
      s,
    );
    expect(md).toContain("## Factor table");
    expect(md).toContain("| prod | ruleOfThree | 2 | 2 | +2.000R |");
  });
});

describe("exit reasons and entry kinds", () => {
  const trades = [
    trade({ score: 8, rMultiple: 2, barsHeld: 9, exitReason: "trend_change", entryKind: "crossing" }),
    trade({ score: 8, rMultiple: -1, outcome: "loss", barsHeld: 2, exitReason: "initial", entryKind: "crossing" }),
    trade({ score: 8, rMultiple: -0.5, outcome: "loss", barsHeld: 4, exitReason: "initial", entryKind: "oldLevel" }),
    trade({ score: 4, outputState: "Watch", rMultiple: 1, barsHeld: 3, outcome: "win" }),
    trade({ derived: "reversal", outputState: undefined, rMultiple: 5, exitReason: "initial" }),
  ];

  it("groups scored trades by how they left, largest group first, derived left out", () => {
    type Row = { key: string; n: number; expectancyR: number; expectancyCI95: [number, number] | null; winRate: number; medianBarsHeld: number | null };
    const t = splitTable(trades, EXIT_REASON_OF) as Record<"scored" | "Execute", Row[]>;
    expect(t.scored.map((r) => r.key)).toEqual(["initial", "bracket_target", "trend_change"]);
    const initial = t.scored[0];
    expect(initial).toMatchObject({ n: 2, expectancyR: -0.75, winRate: 0, medianBarsHeld: 4 });
    expect(initial.expectancyCI95![0]).toBeCloseTo(-0.75 - 1.96 * Math.sqrt(0.125 / 2));
    expect(t.scored.find((r) => r.key === "trend_change")!.expectancyCI95).toBeNull();
    expect(t.Execute.map((r) => r.key)).toEqual(["initial", "trend_change"]);
  });

  it("rides in the summary and its markdown", () => {
    const s = summarizeCells([{ cell: { label: "prod" }, trades }]);
    expect(s.cells[0].entries.Execute.map((r: { key: string }) => r.key)).toEqual(["crossing", "oldLevel"]);
    const md = summaryMarkdown(
      { universe: "u", symbolsUsed: 1, symbolsRequested: 1, ref: "r", sha: "s", timeframe: "1Day", targetR: 2, source: "x", live: true, window: {}, generatedAt: "g", skipped: [] },
      s,
    );
    expect(md).toContain("## Exit reasons");
    expect(md).toContain("| prod | Execute | initial | 2 | -0.750R |");
    expect(md).toContain("## Entry kinds");
    expect(md).toContain("| prod | scored | none | 1 | +1.000R |");
  });
});

describe("bare core cells", () => {
  it("takes its own options only on profile core", () => {
    expect(() => validateCells([{ label: "c", options: { profile: "core", coreShorts: false, coreTrail: "eachWeek" } }])).not.toThrow();
    expect(() => validateCells([{ label: "s", options: { coreShorts: false } }])).toThrow(/profile "core" only/);
  });

  it("prints the whole line beside the first lot", () => {
    const side = { campaigns: 2, lineExpectancyR: 0.5, firstLotExpectancyR: 0.25 };
    const md = coreCampaignSummary("core", {
      campaigns: 4, lineR: 2, firstLotR: 1, lineExpectancyR: 0.5, firstLotExpectancyR: 0.25, pyramided: 1, meanLots: 1.5,
      closed: { campaigns: 3, lineExpectancyR: -0.1 },
      bySide: { long: side, short: side },
      byEntry: { crossing: { campaigns: 1, lineExpectancyR: 1 }, reaction: { campaigns: 3, lineExpectancyR: 0.1 } },
    });
    expect(md).toContain("## Core campaigns: core");
    expect(md).toContain("Whole line +0.500R a campaign");
    expect(md).toContain("first lot alone +0.250R");
    expect(md).toContain("| Short | 2 | +0.500R | +0.250R |");
  });
});


describe("rule ladder cells", () => {
  it("accept ladder options on the core profile only, one at a time", () => {
    expect(() => validateCells([{ label: "t", options: { profile: "core", ladder: "tag" } }])).not.toThrow();
    expect(() => validateCells([{ label: "g", options: { profile: "core", ladderGate: ["hold:breakaway"] } }])).not.toThrow();
    expect(() => validateCells([{ label: "t", options: { ladder: "tag" } }])).toThrow(/core/);
    expect(() => validateCells([{ label: "t", options: { profile: "core", ladder: "gate" } }])).toThrow();
    expect(() => validateCells([{ label: "t", options: { profile: "core", ladderGate: "hold:breakaway" } }])).toThrow();
    expect(() => validateCells([{ label: "t", options: { profile: "core", ladder: "tag", ladderGate: ["hold:breakaway"] } }])).toThrow(/exclusive/);
    expect(() => validateCells([{ label: "g", options: { profile: "core", ladderGate: [] } }])).toThrow(/non-empty/);
    expect(() => validateCells([{ label: "g", options: { profile: "core", ladderGate: ["ref:execute"] } }])).toThrow(/references/);
  });

  it("turn tagged campaigns into ladder rows and skip untagged ones", () => {
    const rows = ladderRowsFromCore([
      { symbol: "AAA", openedAt: "2024-03-01T05:00:00Z", rMultiple: 1.5, rulesRefused: ["hold:breakaway"] },
      { symbol: "BBB", openedAt: "2024-03-02T05:00:00Z", rMultiple: -1 },
    ]);
    expect(rows).toEqual([{ symbol: "AAA", date: "2024-03-01", r: 1.5, refused: new Set(["hold:breakaway"]) }]);
  });
});
