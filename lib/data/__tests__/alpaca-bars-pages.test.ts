import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBarsBatch } from "@/lib/data/alpaca";
import { __resetMarketDataCache } from "@/lib/data/http";

const bar = (t: string) => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1 });
const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

describe("fetchBarsBatch page log", () => {
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
    vi.restoreAllMocks();
  });

  it("logs the pages and bars when a chunk took more than one page", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchMock.mockImplementation((u: string) =>
      new URL(String(u)).searchParams.get("page_token")
        ? json({ bars: { AAA: [bar("2026-10-01T00:00:00Z")] }, next_page_token: null })
        : json({ bars: { AAA: [bar("2026-10-02T00:00:00Z")], BBB: [bar("2026-10-02T00:00:00Z")] }, next_page_token: "p2" }),
    );
    const out = await fetchBarsBatch(["AAA", "BBB"], "1Day", new Date("2026-09-01T00:00:00Z"), null, "us_equity");
    expect(out.get("AAA")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("2 symbols in 1 chunks of 100 took 2 pages, 3 bars"));
  });

  it("logs nothing when each chunk took one page", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchMock.mockImplementation(() => json({ bars: { AAA: [bar("2026-10-02T00:00:00Z")] }, next_page_token: null }));
    await fetchBarsBatch(["AAA"], "1Day", new Date("2026-09-01T00:00:00Z"), null, "us_equity");
    expect(log).not.toHaveBeenCalled();
  });
});
