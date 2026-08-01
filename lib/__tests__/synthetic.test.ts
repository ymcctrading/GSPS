import { describe, expect, it } from "vitest";
import {
  syntheticProvider,
  simulateOptionChain,
  simulateLevel2,
} from "@/lib/data/synthetic";
import { TF_INTERVAL_MS, TIMEFRAMES, startOfCandle } from "@/lib/timeframe";

describe("syntheticProvider.fetchBars", () => {
  it("returns enough well-formed bars for the scan pipeline on every timeframe", async () => {
    const start = new Date(Date.now() - 3650 * 24 * 3600 * 1000);
    const end = new Date();
    for (const tf of TIMEFRAMES) {
      const bars = await syntheticProvider.fetchBars("AAPL", tf, start, end, "us_equity");
      // The scan pipeline needs >=30 daily and >=10 intraday bars; we keep a
      // healthy floor on every timeframe.
      expect(bars.length).toBeGreaterThanOrEqual(30);
      for (const b of bars) {
        expect(b.h).toBeGreaterThanOrEqual(b.l);
        expect(b.h).toBeGreaterThanOrEqual(Math.max(b.o, b.c) - 1e-9);
        expect(b.l).toBeLessThanOrEqual(Math.min(b.o, b.c) + 1e-9);
        expect(b.o).toBeGreaterThan(0);
        expect(Number.isFinite(b.c)).toBe(true);
      }
    }
  });

  it("spaces every candle one full interval apart, aligned to the interval grid", async () => {
    const start = new Date(Date.now() - 3650 * 24 * 3600 * 1000);
    const end = new Date();
    for (const tf of TIMEFRAMES) {
      const bars = await syntheticProvider.fetchBars("AAPL", tf, start, end, "us_equity");
      const times = bars.map((b) => Date.parse(b.t));

      // Each bar opens exactly where the previous one closed — no half-width
      // candles, no overlaps, no gaps.
      for (let i = 1; i < times.length; i++) {
        const gap = times[i] - times[i - 1];
        if (tf === "1Month" || tf === "1Year") {
          // Calendar periods vary in length; bound them instead.
          expect(gap).toBeGreaterThan(TF_INTERVAL_MS[tf] * 0.85);
          expect(gap).toBeLessThan(TF_INTERVAL_MS[tf] * 1.15);
        } else {
          expect(gap).toBe(TF_INTERVAL_MS[tf]);
        }
        // ...and sits on a real boundary for its timeframe.
        expect(startOfCandle(times[i], tf)).toBe(times[i]);
      }
    }
  });

  it("ends on the current candle rather than a stale bucket", async () => {
    const start = new Date(Date.now() - 3650 * 24 * 3600 * 1000);
    for (const tf of TIMEFRAMES) {
      const end = new Date();
      const bars = await syntheticProvider.fetchBars("AAPL", tf, start, end, "us_equity");
      const last = Date.parse(bars[bars.length - 1].t);
      expect(last).toBe(startOfCandle(end.getTime(), tf));
    }
  });

  it("is deterministic for a given symbol + timeframe", async () => {
    const start = new Date(Date.now() - 365 * 24 * 3600 * 1000);
    const end = new Date(Date.now() - 60_000);
    const a = await syntheticProvider.fetchBars("TSLA", "1Day", start, end, "us_equity");
    const b = await syntheticProvider.fetchBars("TSLA", "1Day", start, end, "us_equity");
    expect(a.map((x) => x.c)).toEqual(b.map((x) => x.c));
  });

  it("keeps a realistic price range over a year (no runaway drift)", async () => {
    const start = new Date(Date.now() - 365 * 24 * 3600 * 1000);
    for (const sym of ["SPY", "AAPL", "NVDA", "ZZZZ"]) {
      const bars = await syntheticProvider.fetchBars(sym, "1Day", start, new Date(), "us_equity");
      const closes = bars.map((b) => b.c);
      const ratio = Math.max(...closes) / Math.min(...closes);
      // A year of daily bars should stay within a sane band, not a 5x move.
      expect(ratio).toBeLessThan(3);
    }
  });

  it("anchors the latest bar near the live price", async () => {
    const start = new Date(Date.now() - 365 * 24 * 3600 * 1000);
    const bars = await syntheticProvider.fetchBars("SPY", "1Day", start, new Date(), "us_equity");
    const lastClose = bars[bars.length - 1].c;
    const price = await syntheticProvider.fetchLatestPrice("SPY", "us_equity");
    // Live price wobbles < 1% around the anchor the final bar is scaled to.
    expect(Math.abs(price - lastClose) / lastClose).toBeLessThan(0.02);
  });
});

describe("simulated extended data", () => {
  it("builds a balanced option chain straddling the money", () => {
    const chain = simulateOptionChain("AAPL", 224);
    expect(chain.simulated).toBe(true);
    const calls = chain.contracts.filter((c) => c.type === "call");
    const puts = chain.contracts.filter((c) => c.type === "put");
    expect(calls.length).toBe(puts.length);
    expect(calls.length).toBeGreaterThan(0);
    // Bids never exceed asks.
    for (const c of chain.contracts) expect(c.ask).toBeGreaterThanOrEqual(c.bid);
    // ITM flags are internally consistent.
    for (const c of calls) expect(c.inTheMoney).toBe(c.strike < chain.underlyingPrice);
    for (const p of puts) expect(p.inTheMoney).toBe(p.strike > chain.underlyingPrice);
  });

  it("builds a descending/ascending Level II ladder with a positive spread", () => {
    const book = simulateLevel2("NVDA", 128);
    expect(book.simulated).toBe(true);
    expect(book.bids.length).toBe(10);
    expect(book.asks.length).toBe(10);
    expect(book.asks[0].price).toBeGreaterThan(book.bids[0].price);
    for (let i = 1; i < book.bids.length; i++) {
      expect(book.bids[i].price).toBeLessThan(book.bids[i - 1].price);
      expect(book.asks[i].price).toBeGreaterThan(book.asks[i - 1].price);
    }
  });
});
