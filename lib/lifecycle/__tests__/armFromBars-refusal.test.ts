/**
 * S-14: when the feed is synthetic in production, the arming run records the
 * fixed message, never the refusal's own text (which names the provider and
 * its settings). The portfolio manager's run response carries these reasons.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({ name: "synthetic", isLive: false, fetchBars: async () => [] }),
}));
const plan = {
  planId: "p1", signalId: "scan:1", instrument: "AAPL", market: "us_equity", direction: "bullish",
  generatedAt: "2026-10-20T14:00:00.000Z", expiresAt: "2026-10-20T20:00:00.000Z",
  coordinates: { entryTrigger: 101, invalidation: 97 },
};
vi.mock("@/lib/lifecycle/store", () => ({
  listTradePlans: async () => [plan],
  applyEventAndPersist: async () => ({ ok: true, plan: {} }),
}));

import { armConfirmedPlansFromBars } from "@/lib/lifecycle/armFromBars";
import { MARKET_DATA_UNAVAILABLE } from "@/lib/data/feed-mode";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("armConfirmedPlansFromBars on a synthetic feed", () => {
  it("records the fixed message and keeps the refusal in the log", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await armConfirmedPlansFromBars({} as never, "u1", { now: new Date("2026-10-20T15:00:00.000Z") });
    expect(r.armed).toEqual([]);
    expect(r.errors).toEqual([{ planId: "p1", reason: MARKET_DATA_UNAVAILABLE }]);
    expect(JSON.stringify(r)).not.toMatch(/synthetic|MARKET_DATA_PROVIDER|Alpaca/);
    expect(log.mock.calls.flat().join(" ")).toMatch(/Refused to arm AAPL's plan/);
  });
});
