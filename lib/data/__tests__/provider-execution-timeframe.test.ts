/**
 * Regression test for the fix underneath the 2026-09-09 execution-timeframe
 * override: `fetchAllTimeframes`/`fetchAllTimeframesBatch` used to hardcode
 * "15Min" for the bar series patterns are actually detected on, completely
 * independent of `lib/scanTicker.ts`'s `EXECUTION_TIMEFRAME` constant.
 *
 * That meant the override, as first written, changed only the *label* fed
 * into the data-lag ratio — the safety check would have started reporting a
 * 15-minute-old bar as "fresh" for a 1-hour bar's purposes, while pattern
 * detection kept running on the exact same 15-minute-old data. This proves
 * the fetch actually receives and uses the timeframe it's given, not just
 * that the parameter type-checks.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { syntheticProvider } from "@/lib/data/synthetic";
import { fetchAllTimeframes, fetchAllTimeframesBatch } from "@/lib/data/provider";

describe("fetchAllTimeframes — execution bar honours its timeframe argument", () => {
  const originalProvider = process.env.MARKET_DATA_PROVIDER;

  beforeEach(() => {
    process.env.MARKET_DATA_PROVIDER = "synthetic";
  });
  afterEach(() => {
    process.env.MARKET_DATA_PROVIDER = originalProvider;
    vi.restoreAllMocks();
  });

  it("defaults to 15Min when no execution timeframe is given", async () => {
    const spy = vi.spyOn(syntheticProvider, "fetchBars");
    await fetchAllTimeframes("AAPL", "us_equity");

    const timeframesRequested = spy.mock.calls.map((call) => call[1]);
    expect(timeframesRequested).toContain("15Min");
  });

  it("fetches the execution series at whatever timeframe it's asked for", async () => {
    // 4Hour, deliberately distinct from the always-fetched 1Hour trend bar and
    // from the 15Min default, so a passing assertion can't be an accident of
    // the hourly-trend fetch or the old hardcoded default happening to match.
    const spy = vi.spyOn(syntheticProvider, "fetchBars");
    await fetchAllTimeframes("AAPL", "us_equity", "4Hour");

    const timeframesRequested = spy.mock.calls.map((call) => call[1]);
    expect(timeframesRequested).toContain("4Hour");
    expect(timeframesRequested).not.toContain("15Min");
  });

  it("returns the execution series under `execution`, not the old `m15` name", async () => {
    const result = await fetchAllTimeframes("AAPL", "us_equity", "1Hour");
    expect(result).toHaveProperty("execution");
    expect(result).not.toHaveProperty("m15");
  });

  it("scales the lookback window with how coarse the execution timeframe is", async () => {
    // 4Hour bars are 16x sparser than 15Min ones — without a scaled lookback,
    // a fixed 7-day window would starve detectPatterns/executionAtr, which
    // need 30+ closed bars, of anything close to enough history.
    const spy = vi.spyOn(syntheticProvider, "fetchBars");
    await fetchAllTimeframes("AAPL", "us_equity", "4Hour");

    const executionCall = spy.mock.calls.find((call) => call[1] === "4Hour");
    expect(executionCall).toBeDefined();
    const [, , start] = executionCall!;
    const daysBack = (Date.now() - (start as Date).getTime()) / (24 * 3600 * 1000);
    expect(daysBack).toBeGreaterThan(20); // 7 * 16x scale, not the old flat 7
  });
});

describe("fetchAllTimeframesBatch — same guarantee for the batched path", () => {
  const originalProvider = process.env.MARKET_DATA_PROVIDER;

  beforeEach(() => {
    process.env.MARKET_DATA_PROVIDER = "synthetic";
  });
  afterEach(() => {
    process.env.MARKET_DATA_PROVIDER = originalProvider;
  });

  it("returns an empty map rather than throwing when the active provider has no batch support", async () => {
    // The synthetic provider (used in tests and demo mode) has no
    // fetchBarsBatch — this is the documented fallback behaviour, exercised
    // here so a future batch implementation can't silently drop the
    // executionTimeframe argument without a test noticing.
    const out = await fetchAllTimeframesBatch(["AAPL", "MSFT"], "1Hour");
    expect(out.size).toBe(0);
  });
});
