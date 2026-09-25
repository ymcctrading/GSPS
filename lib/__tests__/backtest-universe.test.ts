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
  describeTrades,
  parseArgs,
  summarizeCells,
  summaryMarkdown,
  validateCells,
} from "../../scripts/backtest-universe.mjs";

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
});

describe("validateCells", () => {
  it("rejects empty, duplicate and unsafe labels", () => {
    expect(() => validateCells([])).toThrow();
    expect(() => validateCells([{ label: "a" }, { label: "a" }])).toThrow(/Duplicate/);
    expect(() => validateCells([{ label: "../x" }])).toThrow(/filesystem-safe/);
    expect(() => validateCells([{ label: "a", options: [] }])).toThrow(/options/);
    expect(validateCells([{ label: "base-1", options: { useProductionStop: true } }])).toHaveLength(1);
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
  });
});
