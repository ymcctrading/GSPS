import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const fetchBars = vi.hoisted(() => vi.fn());
// A live provider, so the equity feed's 15-minute delay applies.
vi.mock("@/lib/data/provider", () => ({ getMarketDataProvider: () => ({ fetchBars, isLive: true, name: "alpaca" }) }));

import { readEntryConfirmationNow } from "../confirmNow";

const bar = (t: string, o: number, h: number, l: number, c: number): Bar => ({ t, o, h, l, c, v: 1000 });

describe("placement under the feed's delay: the stop is read on every closed bar (DATA-DELAY-001 review)", () => {
  // Entry 101, stop 97: the crossing line is 103.
  const crossing = bar("2026-10-14T19:45:00Z", 103, 103.4, 102.5, 103.2);
  const reaction = bar("2026-10-15T14:30:00Z", 103, 102.4, 100.9, 101.2); // closes 14:45, usable 15:00
  const throughStop = bar("2026-10-15T14:45:00Z", 101.2, 101.3, 95.5, 96); // closes 15:00, usable 15:15
  const now = new Date("2026-10-15T15:00:30Z");
  const ask = () =>
    readEntryConfirmationNow({ symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: 101, stopPrice: 97, now });

  it("is ready on the usable bars when nothing has closed through the stop", async () => {
    fetchBars.mockResolvedValue([crossing, reaction]);
    expect((await ask()).ready).toBe(true);
  });

  it("is dead once a close through the stop is received, even inside the delay", async () => {
    fetchBars.mockResolvedValue([crossing, reaction, throughStop]);
    expect(await ask()).toMatchObject({ ready: false, stage: "dead" });
  });

  it("does not read a bar still forming", async () => {
    fetchBars.mockResolvedValue([crossing, reaction, bar("2026-10-15T15:00:00Z", 101.2, 101.3, 95.5, 96)]);
    expect((await ask()).ready).toBe(true);
  });
});
