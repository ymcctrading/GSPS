import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNews } from "@/lib/data/alpaca";
import { __resetMarketDataCache } from "@/lib/data/http";

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

describe("fetchNews", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    __resetMarketDataCache();
    process.env.ALPACA_API_KEY = "k";
    process.env.ALPACA_API_SECRET = "s";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes on only https links, and the publisher when named", async () => {
    fetchMock.mockImplementation(() =>
      json({
        news: [
          { created_at: "2026-10-27T15:00:00Z", headline: "Safe", source: "wire", url: "https://example.com/a" },
          { created_at: "2026-10-27T14:00:00Z", headline: "Plain http", url: "http://example.com/b" },
          { created_at: "2026-10-27T13:00:00Z", headline: "Script", url: "javascript:alert(1)" },
          { created_at: "2026-10-27T12:00:00Z" },
        ],
      }),
    );
    const items = await fetchNews("AAPL", new Date("2026-10-20T00:00:00Z"), 12);
    expect(items).toEqual([
      { createdAt: "2026-10-27T15:00:00Z", headline: "Safe", source: "wire", url: "https://example.com/a" },
      { createdAt: "2026-10-27T14:00:00Z", headline: "Plain http" },
      { createdAt: "2026-10-27T13:00:00Z", headline: "Script" },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("symbols")).toBe("AAPL");
    expect(url.searchParams.get("limit")).toBe("12");
  });
});
