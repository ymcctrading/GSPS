/**
 * End-to-end wiring check for the backtest pipeline: fetch → replay → verdict
 * split → factor attribution.
 *
 * Runs against the synthetic provider, which is a seeded random walk. That
 * makes every number here meaningless as a trading result and completely
 * reliable as a wiring result — the point is that the stages connect, that the
 * buckets partition the trades, and that provenance is reported honestly. No
 * assertion below reads a win rate or an expectancy, because on this data
 * neither means anything.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { runBacktest } from "@/lib/backtest/run";
import { getMarketDataProvider } from "@/lib/data/provider";

beforeAll(() => {
  // Pin the provider so a machine that happens to have vendor credentials
  // configured runs this against the same deterministic series as CI.
  process.env.MARKET_DATA_PROVIDER = "synthetic";
});

describe("runBacktest", () => {
  it("reports the data source and refuses to claim a synthetic run is live", async () => {
    expect(getMarketDataProvider().isLive).toBe(false);
    const report = await runBacktest({ symbols: ["SPY"], timeframe: "15Min" });
    expect(report.live).toBe(false);
    expect(report.source).toBe("synthetic");
  });

  it("partitions every trade into exactly one verdict bucket", async () => {
    const report = await runBacktest({ symbols: ["SPY", "AAPL"], timeframe: "15Min" });
    const bucketed = report.buckets.reduce((n, b) => n + b.trades, 0);
    expect(bucketed).toBe(report.overall.trades);
    expect(report.triggered).toBeLessThanOrEqual(report.armed);
  });

  it("attributes factors within the requested bucket only", async () => {
    const report = await runBacktest({
      symbols: ["SPY"],
      timeframe: "15Min",
      attributeWithin: "Watch",
    });
    expect(report.attributeWithin).toBe("Watch");
    const watch = report.buckets.find((b) => b.bucket === "Watch")!;
    for (const factor of report.factors) {
      expect(factor.observed).toBeLessThanOrEqual(watch.trades);
      expect(factor.passed.n + factor.failed.n).toBe(factor.observed);
    }
  });

  it("records an unfetchable symbol as skipped instead of dropping it silently", async () => {
    // Every symbol resolves under the synthetic generator, so the guarantee
    // worth pinning is the accounting: whatever is not in `symbols` is in
    // `skipped`, and a run never quietly reports on a smaller universe than
    // it was handed.
    const requested = ["SPY", "AAPL"];
    const report = await runBacktest({ symbols: requested, timeframe: "15Min" });
    expect(report.symbols.length + report.skipped.length).toBe(requested.length);
  });

  it("keeps the ATR bands a partition of the attributed bucket", async () => {
    const report = await runBacktest({ symbols: ["SPY"], timeframe: "15Min" });
    const banded = report.atrBands.reduce((n, b) => n + b.trades, 0);
    const execute = report.buckets.find((b) => b.bucket === "Execute")!;
    expect(banded).toBe(execute.trades);
  });
});

/**
 * `since` is what lets the period be held still while the timeframe moves, so
 * the thing worth pinning is that the window it reports is the window it
 * replayed — a start that is silently ignored would label two years of trades
 * as two months.
 */
describe("runBacktest with a pinned start", () => {
  const full = () => runBacktest({ symbols: ["SPY"], timeframe: "15Min" });

  it("starts the window no earlier than the requested instant", async () => {
    const baseline = await full();
    // Halfway through whatever the lookback returned, so the trim is real on
    // any day this runs rather than pegged to a date that ages out.
    const from = Date.parse(baseline.window.from!);
    const to = Date.parse(baseline.window.to!);
    const since = new Date(from + (to - from) / 2).toISOString();

    const trimmed = await runBacktest({ symbols: ["SPY"], timeframe: "15Min", since });

    expect(Date.parse(trimmed.window.from!)).toBeGreaterThanOrEqual(Date.parse(since));
    expect(Date.parse(baseline.window.from!)).toBeLessThan(Date.parse(since));
    expect(trimmed.overall.trades).toBeLessThanOrEqual(baseline.overall.trades);
  });

  it("leaves the run untouched when the start precedes the data", async () => {
    const baseline = await full();
    const pinned = await runBacktest({
      symbols: ["SPY"],
      timeframe: "15Min",
      since: "1970-01-01T00:00:00Z",
    });

    expect(pinned.window).toEqual(baseline.window);
    expect(pinned.overall.trades).toBe(baseline.overall.trades);
  });

  it("skips a symbol whose bars all precede the start, rather than reporting an empty run", async () => {
    const report = await runBacktest({
      symbols: ["SPY"],
      timeframe: "15Min",
      since: "2999-01-01T00:00:00Z",
    });

    expect(report.symbols).toEqual([]);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].reason).toContain("2999-01-01");
  });

  it("throws on an unparseable start instead of replaying everything", async () => {
    await expect(
      runBacktest({ symbols: ["SPY"], timeframe: "15Min", since: "last tuesday" }),
    ).rejects.toThrow(/Invalid 'since'/);
  });
});
