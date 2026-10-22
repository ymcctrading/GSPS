import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBars } from "@/lib/data/alpaca";
import { __resetMarketDataCache } from "@/lib/data/http";

describe("fetchBars request window", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    __resetMarketDataCache();
    process.env.ALPACA_API_KEY = "k";
    process.env.ALPACA_API_SECRET = "s";
    fetchMock.mockReset();
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ bars: { AAPL: [{ t: "2026-10-22T14:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("floors start and end to the minute, so two loads inside a minute share one read", async () => {
    const a = new Date("2026-10-22T15:30:12.345Z");
    const b = new Date("2026-10-22T15:30:21.987Z");
    await fetchBars("AAPL", "15Min", a, a, "us_equity", 100);
    await fetchBars("AAPL", "15Min", b, b, "us_equity", 100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("start")).toBe("2026-10-22T15:30:00.000Z");
    expect(url.searchParams.get("end")).toBe("2026-10-22T15:30:00.000Z");
  });

  it("reads again in the next minute", async () => {
    await fetchBars("AAPL", "15Min", new Date("2026-10-22T15:30:59.000Z"), null, "us_equity", 100);
    await fetchBars("AAPL", "15Min", new Date("2026-10-22T15:31:00.000Z"), null, "us_equity", 100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
