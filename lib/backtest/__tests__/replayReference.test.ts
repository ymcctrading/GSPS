import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTION_REPLAY_RUNS } from "@/lib/backtest/replayReference";
import { currentReplayBaseline, EXECUTE_TIER_BACKTEST_BASELINE } from "@/lib/shadow/compare";

interface Bucket {
  bucket: string;
  trades: number;
  winRate: number;
  expectancyR: number;
}

/**
 * The replay figures shown on Past scans and the owner's Test page are copied
 * by hand from the committed runs. This reads each run's own JSON and fails a
 * copy that no longer matches it (numbers audit, 2026-11-09).
 */
describe("the committed production replay runs", () => {
  for (const run of PRODUCTION_REPLAY_RUNS) {
    it(`${run.file} matches its JSON`, () => {
      const file = JSON.parse(readFileSync(path.join(process.cwd(), "docs", "replay-runs", run.file), "utf8"));
      const report = file["prod.report.json"];
      expect(report.usePlanLevels).toBe(true);
      expect(report.entryRule).toBe("reaction");
      expect(["structure", "gann"]).toContain(report.exitRule);
      expect(report.symbols.length).toBe(run.symbols);
      expect(report.window.from.slice(0, 10)).toBe(run.window.from);
      expect(report.window.to.slice(0, 10)).toBe(run.window.to);
      const bucket = (name: string) => (report.buckets as Bucket[]).find((b) => b.bucket === name)!;
      for (const [scope, actual] of [
        ["execute", bucket("Execute")],
        ["watch", bucket("Watch")],
        ["all", report.overall as Bucket],
      ] as const) {
        const shown = run[scope];
        expect(shown.trades).toBe(actual.trades);
        expect(shown.winRate).toBeCloseTo(actual.winRate, 3);
        expect(shown.expectancyR).toBeCloseTo(actual.expectancyR, 3);
      }
    });
  }

  it("feeds the forward test's baseline from the newest run, on that run's own rules version", () => {
    const run = currentReplayBaseline();
    expect(run?.file).toBe("2026-10-21-766sym-15Min-production-cell.json");
    expect(EXECUTE_TIER_BACKTEST_BASELINE).toEqual({
      trades: 271,
      winRate: 0.162,
      expectancyR: -0.037,
      strategyVersion: "2026-10-21-gann-decade-month-et",
    });
  });
});
