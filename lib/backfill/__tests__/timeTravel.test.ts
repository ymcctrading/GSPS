import { describe, expect, it, vi } from "vitest";
import {
  backfillClock,
  barVisible,
  installFakeClock,
  intradayBarMs,
  makeTimeTravelFetch,
  nextDay,
  splitSince,
  splitSinceDay,
  tradingDaysBetween,
} from "@/lib/backfill/timeTravel";

const CLOCK = backfillClock("2026-11-02"); // 19:00 EST = 2026-11-03T00:00Z
const DB = "https://example.supabase.co";

function fakeUpstream(body: unknown, status = 200) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: new URL(String(input instanceof Request ? input.url : input)), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe("the backfill clock", () => {
  it("runs each day at 19:00 ET, in either season", () => {
    expect(CLOCK.toISOString()).toBe("2026-11-03T00:00:00.000Z");
    expect(backfillClock("2026-07-01").toISOString()).toBe("2026-07-01T23:00:00.000Z");
    expect(() => backfillClock("11/02/2026")).toThrow();
  });

  it("lists NYSE trading days only: no weekends, no Thanksgiving", () => {
    const days = tradingDaysBetween("2026-10-31", "2026-11-30");
    expect(days[0]).toBe("2026-11-02");
    expect(days).not.toContain("2026-11-07");
    expect(days).not.toContain("2026-11-26");
    expect(days).toContain("2026-11-27");
    expect(days.at(-1)).toBe("2026-11-30");
    expect(days).toHaveLength(20);
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
  });

  it("moves new Date() and Date.now() to the clock and puts them back", () => {
    const restore = installFakeClock(CLOCK);
    try {
      expect(Math.abs(Date.now() - CLOCK.getTime())).toBeLessThan(5_000);
      expect(Math.abs(new Date().getTime() - CLOCK.getTime())).toBeLessThan(5_000);
      expect(new Date(0).getTime()).toBe(0);
      expect(new Date("2026-01-01T00:00:00Z").toISOString()).toBe("2026-01-01T00:00:00.000Z");
    } finally {
      restore();
    }
    expect(Math.abs(Date.now() - CLOCK.getTime())).toBeGreaterThan(60_000);
  });
});

describe("which bars the scan may see", () => {
  it("reads intraday spans", () => {
    expect(intradayBarMs("15Min")).toBe(900_000);
    expect(intradayBarMs("1Hour")).toBe(3_600_000);
    expect(intradayBarMs("1T")).toBe(60_000);
    expect(intradayBarMs("1Day")).toBeNull();
  });

  it("keeps an intraday bar once closed and a day bar once opened", () => {
    expect(barVisible("2026-11-02T23:45:00Z", "15Min", CLOCK)).toBe(true);
    expect(barVisible("2026-11-02T23:50:00Z", "15Min", CLOCK)).toBe(false);
    expect(barVisible("2026-11-02T05:00:00Z", "1Day", CLOCK)).toBe(true);
    expect(barVisible("2026-11-03T05:00:00Z", "1Day", CLOCK)).toBe(false);
    expect(barVisible("not a date", "1Day", CLOCK)).toBe(false);
  });
});

describe("the time-travel fetch", () => {
  it("cuts a bars request at the clock and drops bars past it", async () => {
    const up = fakeUpstream({
      bars: {
        BP: [
          { t: "2026-11-02T05:00:00Z", c: 47.89 },
          { t: "2026-11-03T05:00:00Z", c: 47.6 },
        ],
      },
      next_page_token: null,
    });
    const { fetch, stats } = makeTimeTravelFetch(CLOCK, up.fn, { supabaseUrl: DB });
    const res = await fetch("https://data.alpaca.markets/v2/stocks/bars?symbols=BP&timeframe=1Day&start=2026-10-01T00:00:00Z&end=2026-11-09T08:00:00Z");
    const body = await res.json();
    expect(up.calls[0].url.searchParams.get("end")).toBe(CLOCK.toISOString());
    expect(body.bars.BP).toEqual([{ t: "2026-11-02T05:00:00Z", c: 47.89 }]);
    expect(stats.droppedBars).toBe(1);
    expect(stats.barsRequests).toBe(1);
  });

  it("adds an end when the request has none, and keeps an earlier end", async () => {
    const up = fakeUpstream({ bars: [] });
    const { fetch } = makeTimeTravelFetch(CLOCK, up.fn);
    await fetch("https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=BTC/USD&timeframe=1Hour&start=2026-10-01T00:00:00Z");
    await fetch("https://data.alpaca.markets/v2/stocks/bars?symbols=BP&timeframe=1Day&start=2026-10-01T00:00:00Z&end=2026-10-15T00:00:00Z");
    expect(up.calls[0].url.searchParams.get("end")).toBe(CLOCK.toISOString());
    expect(up.calls[1].url.searchParams.get("end")).toBe("2026-10-15T00:00:00Z");
  });

  it("answers a latest trade with the last bar closed by the clock", async () => {
    const up = fakeUpstream({
      bars: {
        BP: [
          { t: "2026-11-03T05:00:00Z", c: 47.6 },
          { t: "2026-11-02T05:00:00Z", c: 47.89 },
          { t: "2026-10-30T04:00:00Z", c: 50.43 },
        ],
      },
    });
    const { fetch, stats } = makeTimeTravelFetch(CLOCK, up.fn);
    const multi = await (await fetch("https://data.alpaca.markets/v2/stocks/trades/latest?symbols=BP&feed=iex")).json();
    expect(multi.trades.BP.p).toBe(47.89);
    const single = await (await fetch("https://data.alpaca.markets/v2/stocks/BP/trades/latest?feed=iex")).json();
    expect(single.trade.p).toBe(47.89);
    expect(up.calls[0].url.pathname).toBe("/v2/stocks/bars");
    expect(up.calls[0].url.searchParams.get("end")).toBe(CLOCK.toISOString());
    // The same adjustment as the scan's bars, so price and bars share units.
    expect(up.calls[0].url.searchParams.get("adjustment")).toBe("split");
    expect(stats.rebuiltTrades).toBe(2);
  });

  it("answers a crypto latest trade from closed minutes", async () => {
    const up = fakeUpstream({
      bars: {
        "BTC/USD": [
          { t: "2026-11-02T23:58:00Z", c: 100 },
          { t: "2026-11-02T23:59:00Z", c: 101 },
          { t: "2026-11-03T00:00:00Z", c: 999 },
        ],
      },
    });
    const { fetch } = makeTimeTravelFetch(CLOCK, up.fn);
    const body = await (await fetch("https://data.alpaca.markets/v1beta3/crypto/us/latest/trades?symbols=BTC/USD")).json();
    expect(up.calls[0].url.pathname).toBe("/v1beta3/crypto/us/bars");
    expect(body.trades["BTC/USD"].p).toBe(101);
  });

  it("refuses reads of the present without retrying", async () => {
    const up = fakeUpstream({});
    const { fetch, stats } = makeTimeTravelFetch(CLOCK, up.fn);
    const screener = await fetch("https://data.alpaca.markets/v1beta1/screener/stocks/most-actives?top=250");
    const snap = await fetch("https://data.alpaca.markets/v2/stocks/snapshots?symbols=BP");
    expect(screener.status).toBe(403);
    expect(snap.status).toBe(403);
    expect(up.calls).toHaveLength(0);
    expect(stats.refusedReads).toEqual(["/v1beta1/screener/stocks/most-actives", "/v2/stocks/snapshots"]);
  });

  it("passes database reads, empties the crypto bar store, and refuses writes", async () => {
    const up = fakeUpstream([{ month: "2026-11" }]);
    const { fetch, stats } = makeTimeTravelFetch(CLOCK, up.fn, { supabaseUrl: DB });
    const read = await (await fetch(`${DB}/rest/v1/universe_strength_months?month=eq.2026-11`)).json();
    expect(read).toEqual([{ month: "2026-11" }]);
    expect(await (await fetch(`${DB}/rest/v1/closed_bars?symbol=eq.BTC`)).json()).toEqual([]);
    const write = await fetch(`${DB}/rest/v1/monthly_bars_closed`, { method: "POST", body: "[]" });
    const del = await fetch(`${DB}/rest/v1/daily_scans?scan_date=eq.2026-11-02`, { method: "DELETE" });
    expect(write.status).toBe(204);
    expect(del.status).toBe(204);
    expect(up.calls).toHaveLength(1);
    expect(stats.refusedWrites).toEqual(["POST /rest/v1/monthly_bars_closed", "DELETE /rest/v1/daily_scans"]);
    expect(stats.dbReads).toEqual(["/rest/v1/universe_strength_months", "/rest/v1/closed_bars"]);
  });

  it("refuses every other host, the broker and email included", async () => {
    const up = fakeUpstream({});
    const { fetch, stats } = makeTimeTravelFetch(CLOCK, up.fn, { supabaseUrl: DB });
    expect((await fetch("https://paper-api.alpaca.markets/v2/assets/BP")).status).toBe(403);
    expect((await fetch("https://api.resend.com/emails", { method: "POST" })).status).toBe(403);
    expect(up.calls).toHaveLength(0);
    expect(stats.refusedHosts).toEqual(["GET paper-api.alpaca.markets/v2/assets/{symbol}", "POST api.resend.com/emails"]);
  });
});

describe("stocks that split after the day", () => {
  const day = (c: number, t = "2026-11-02T05:00:00Z") => [{ t: "2026-10-30T04:00:00Z", c: c * 1.01 }, { t, c }];

  it("flags a stock whose raw and split-adjusted closes differ, and nothing else", () => {
    // NVDA split 4:1 after the day: raw 480, split-adjusted 120. BP did not split.
    const raw = { NVDA: day(480), BP: day(47.89), XOM: [] };
    const split = { NVDA: day(120), BP: day(47.89), XOM: [] };
    expect(splitSince(raw, split)).toEqual(["NVDA"]);
    // A dividend-sized difference is not a split; different last bars are not compared.
    expect(splitSince({ A: day(100) }, { A: day(100.2) })).toEqual([]);
    expect(splitSince({ A: day(100) }, { A: day(50, "2026-10-29T04:00:00Z") })).toEqual([]);
  });

  it("reads both series by the clock, skips crypto, and fails loudly on an error", async () => {
    const calls: URL[] = [];
    const fake = (async (input: RequestInfo | URL) => {
      const u = new URL(String(input));
      calls.push(u);
      const adj = u.searchParams.get("adjustment");
      return new Response(JSON.stringify({ bars: { NVDA: day(adj === "raw" ? 480 : 120), BP: day(47.89) } }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await splitSinceDay(["NVDA", "BP", "BTC/USD", "BP"], CLOCK, fake)).toEqual(["NVDA"]);
    expect(calls).toHaveLength(2);
    expect(calls.map((u) => u.searchParams.get("adjustment")).sort()).toEqual(["raw", "split"]);
    expect(calls[0].searchParams.get("symbols")).toBe("NVDA,BP");
    expect(calls[0].searchParams.get("end")).toBe(CLOCK.toISOString());
    const down = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    await expect(splitSinceDay(["BP"], CLOCK, down)).rejects.toThrow("500");
  });
});
