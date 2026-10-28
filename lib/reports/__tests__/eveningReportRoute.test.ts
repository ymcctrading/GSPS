import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ cron: false, seeded: false, user: null as null | { email: string; email_confirmed_at: string | null } }));

/** A PostgREST-shaped builder: every method chains, awaiting it resolves the table's rows. */
function builder(table: string) {
  let rows: unknown[] =
    table === "daily_scans"
      ? [{ symbol: "AAA", direction: "bullish", output_state: "Watch", score: 7, entry: 10, stop_loss: 9, take_profit_1: 12, master_profit: 14, detail: { scannedAt: "2999-01-01T00:00:00Z" }, scan_date: "2026-10-26" }]
      : [];
  let error: { message: string } | null = null;
  if (state.seeded) {
    // AAPL rose on Oct 27; the only plan standing was a short Execute, and the
    // only system detection was bearish, on a 5-minute bar opening 10:00 ET.
    if (table === "daily_scans") {
      rows = [{ symbol: "AAPL", direction: "bearish", output_state: "Execute", score: 8, entry: 99, stop_loss: 102, take_profit_1: 95, master_profit: 90, detail: { scannedAt: "2999-01-01T00:00:00Z" }, scan_date: "2026-10-26" }];
    }
    if (table === "intraday_system_alerts") {
      rows = [{ symbol: "AAPL", signal_id: "old_level_cross", signal_type: "bearish", poll_cycle_timestamp: "2026-10-27T14:20:00Z", created_at: "2026-10-27T14:20:01Z", metadata: { dataTimestamp: "2026-10-27T14:00:00Z", barIntervalMinutes: 5 } }];
    }
    if (table === "universe_sweep") error = { message: "sweep unread" };
  }
  const result = { data: error ? null : rows, error, count: 0 };
  const b: Record<string, unknown> = {};
  const chain = new Proxy(b, {
    get(_t, prop) {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => resolve(result);
      if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve({ data: rows[0] ?? null, error: null });
      return () => chain;
    },
  });
  return chain;
}

vi.mock("@/lib/cron-auth", () => ({ isCronAuthorized: () => state.cron }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
  createServiceClient: () => ({ from: (t: string) => builder(t) }),
}));
vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({
    name: "alpaca",
    isLive: true,
    fetchBarsBatch: async (symbols: string[], tf: string) =>
      state.seeded && tf === "1Day" && symbols.includes("AAPL")
        ? new Map([
            [
              "AAPL",
              [
                { t: "2026-10-26T04:00:00Z", o: 100, h: 101, l: 99, c: 100, v: 1e6 },
                { t: "2026-10-27T04:00:00Z", o: 101, h: 111, l: 100, c: 110, v: 2e6 },
              ],
            ],
          ])
        : new Map(),
  }),
}));
vi.mock("@/lib/data/feed-mode", () => ({ MARKET_DATA_UNAVAILABLE: "x", syntheticDataRefusal: () => null }));

import { GET } from "@/app/api/evening-report/route";

const req = (q: string) => new NextRequest(`https://example.com/api/evening-report${q}`);

describe("/api/evening-report access", () => {
  beforeEach(() => {
    state.cron = false;
    state.seeded = false;
    state.user = null;
    delete process.env.RESEND_API_KEY;
  });

  it("answers 404 to anyone without the cron secret or an owner session", async () => {
    expect((await GET(req("?dry=1&late=1"))).status).toBe(404);
    expect((await GET(req(""))).status).toBe(404);
    state.user = { email: "member@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
    expect((await GET(req("?dry=1&late=1"))).status).toBe(404);
  });

  it("an owner session reads dry only, never sends, and needs a confirmed address", async () => {
    state.user = { email: "ymcctrading@gmail.com", email_confirmed_at: null };
    expect((await GET(req("?dry=1&late=1"))).status).toBe(404);
    state.user = { email: "ymcctrading@gmail.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
    expect((await GET(req("?late=1"))).status).toBe(404);
    const res = await GET(req("?dry=1&late=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coverage.priceData).toBeDefined();
    expect(body.coverage.selected.value).toBeNull();
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("the cron run reaches every read without a runtime error", async () => {
    state.cron = true;
    const res = await GET(req("?dry=1&late=1"));
    expect(res.status).toBe(200);
  });

  describe("attribution on seeded records", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-27T22:30:00Z"));
      state.cron = true;
      state.seeded = true;
    });
    afterEach(() => vi.useRealTimers());

    it("a rising mover with only a short plan and a bearish detection is offered against the move, timed on the 5-minute bar", async () => {
      const res = await GET(req("?dry=1"));
      expect(res.status).toBe(200);
      const body = await res.json();
      const a = body.attribution.AAPL;
      expect(a.outcome).toBe("offered_against");
      expect(a.line).toMatch(/an Execute plan stood against the move/);
      // Bar 10:00-10:05 ET, plus the 15-minute delay: usable 10:20 ET.
      expect(a.line).toMatch(/data usable from 10:20 AM ET/);
      expect(a.line).toMatch(/first \(against the move\)/);
      // A table that failed to read is "not recorded", never 0.
      expect(body.coverage.evaluated.value).toBeNull();
      expect(body.coverage.detected.value).toBe(1);
    });
  });
});
