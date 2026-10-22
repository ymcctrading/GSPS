import { describe, expect, it, vi } from "vitest";

// Every bar read fails, as a vendor 429 or the synthetic-feed guard would.
vi.mock("@/lib/data/feed-mode", () => ({
  assertLiveMarketData: () => {
    throw new Error("no live data");
  },
}));

import { readLiveGannExit } from "@/lib/trade/gann-exit-live";

const base = {
  symbol: "AAPL",
  side: "long" as const,
  entryPrice: 100,
  initialStop: 98,
  openedAt: "2026-10-21T14:00:00Z", // 10:00 New York
  best: null,
  style: "intraday" as const,
};

describe("the Intraday style's session close when the bars can't be read", () => {
  it("still closes from the clock", async () => {
    const reading = await readLiveGannExit({ ...base, closeAtSessionEnd: true, now: new Date("2026-10-21T19:50:00Z") });
    expect(reading?.exit?.reason).toBe("session_close");
    expect(reading?.stop).toBe(98);
  });
  it("reads nothing before the close, held overnight, or for crypto", async () => {
    expect(await readLiveGannExit({ ...base, closeAtSessionEnd: true, now: new Date("2026-10-21T18:00:00Z") })).toBeNull();
    expect(await readLiveGannExit({ ...base, closeAtSessionEnd: false, now: new Date("2026-10-21T19:50:00Z") })).toBeNull();
    expect(await readLiveGannExit({ ...base, symbol: "BTC/USD", closeAtSessionEnd: true, now: new Date("2026-10-21T19:50:00Z") })).toBeNull();
  });
});
