import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ cron: false, touched: false }));

vi.mock("@/lib/cron-auth", () => ({ isCronAuthorized: () => state.cron }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => {
    state.touched = true;
    throw new Error("no database in this test");
  },
}));
vi.mock("@/lib/data/provider", () => ({ getMarketDataProvider: () => ({ isLive: true, name: "alpaca", fetchBarsBatch: async () => new Map() }) }));
vi.mock("@/lib/data/feed-mode", () => ({ MARKET_DATA_UNAVAILABLE: "x", syntheticDataRefusal: () => null }));

import { GET } from "@/app/api/pre-open-lines/route";

const req = (q = "") => new NextRequest(`https://example.com/api/pre-open-lines${q}`);

describe("/api/pre-open-lines", () => {
  afterEach(() => {
    vi.useRealTimers();
    state.cron = false;
    state.touched = false;
  });

  it("refuses a caller without the cron secret", async () => {
    expect((await GET(req())).status).toBe(401);
  });

  it("does nothing outside 8:30 to the 9:30 open, New York time", async () => {
    state.cron = true;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T13:50:00Z")); // 9:50 EDT: the other season's run
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toMatch(/outside the pre-open window/);
    expect(state.touched).toBe(false);
  });
});
