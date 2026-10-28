import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_EMAIL_DAILY_BUDGET, emailCeiling } from "@/lib/notifications/email-budget";
import { DIGEST_SIGNAL_LIMIT, digestSignalLines } from "@/lib/notifications/digestSignals";
import { signalSection } from "@/lib/notifications/resend-handler";
import { executeEmailedToday, heldSymbolKey, holdsSymbol } from "@/lib/entitlements/delivery";

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({}) }));

/** A query chain whose every filter returns itself and which resolves to `result`. */
function chainClient(result: { data: unknown; error: { message: string } | null }) {
  const filters: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "gte", "limit", "in"]) {
    chain[m] = (...args: unknown[]) => {
      filters.push([m, args]);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { client: { from: () => chain } as unknown as SupabaseClient, filters };
}

describe("emailCeiling", () => {
  it("gives a member's own trades and ops 15 more than alerts and digests", () => {
    expect(emailCeiling("alert", undefined)).toBe(DEFAULT_EMAIL_DAILY_BUDGET);
    expect(emailCeiling("digest", undefined)).toBe(80);
    expect(emailCeiling("trade", undefined)).toBe(95);
    expect(emailCeiling("ops", undefined)).toBe(95);
  });

  it("reads EMAIL_DAILY_BUDGET and ignores a value that isn't a positive whole number", () => {
    expect(emailCeiling("alert", "40")).toBe(40);
    expect(emailCeiling("trade", "40")).toBe(55);
    expect(emailCeiling("alert", "0")).toBe(80);
    expect(emailCeiling("alert", "lots")).toBe(80);
  });
});

describe("digestSignalLines", () => {
  // 2026-10-27 18:00 ET = 22:00 UTC.
  const now = new Date("2026-10-27T22:00:00Z");

  it("lists today's New York signals oldest first with their time, leaving out yesterday's and the entry notices", () => {
    const { lines, more } = digestSignalLines(
      [
        { title: "AAPL intraday, up: Breakout", created_at: "2026-10-27T15:00:00Z" },
        { title: "SPY intraday, down: Breakout", created_at: "2026-10-27T14:36:00Z" },
        // 8:30 PM ET on the 26th: yesterday in New York, though inside 30 hours.
        { title: "QQQ intraday, up: Breakout", created_at: "2026-10-27T00:30:00Z" },
        { title: "NVDA buy: Nearing the plan's entry", created_at: "2026-10-27T16:00:00Z" },
      ],
      now,
    );
    expect(lines).toEqual(["10:36 AM SPY intraday, down: Breakout", "11:00 AM AAPL intraday, up: Breakout"]);
    expect(more).toBe(0);
  });

  it("caps the list and counts the rest", () => {
    const rows = Array.from({ length: DIGEST_SIGNAL_LIMIT + 4 }, (_, i) => ({
      title: `S${i} intraday, up: Breakout`,
      created_at: new Date(Date.parse("2026-10-27T14:00:00Z") + i * 60_000).toISOString(),
    }));
    const { lines, more } = digestSignalLines(rows, now);
    expect(lines).toHaveLength(DIGEST_SIGNAL_LIMIT);
    expect(more).toBe(4);
  });
});

describe("signalSection", () => {
  it("is empty with no signals, and escapes the titles it lists", () => {
    expect(signalSection(undefined)).toBe("");
    expect(signalSection({ lines: [], more: 0 })).toBe("");
    const html = signalSection({ lines: ["10:36 AM A&B <up>"], more: 2 });
    expect(html).toContain("A&amp;B &lt;up&gt;");
    expect(html).toContain("And 2 more in the app.");
  });
});

describe("holdsSymbol", () => {
  it("is true only with an open position in the symbol, however the ledger spells it", async () => {
    const held = chainClient({ data: [{ symbol: "MSFT" }, { symbol: "BTCUSD" }, { symbol: "AAPL251121C00200000" }], error: null });
    expect(await holdsSymbol(held.client, "u1", "aapl")).toBe(true);
    expect(await holdsSymbol(held.client, "u1", "BTC/USD")).toBe(true);
    expect(await holdsSymbol(held.client, "u1", "NVDA")).toBe(false);
    expect(held.filters).toContainEqual(["eq", ["closed", false]]);
    expect(await holdsSymbol(chainClient({ data: [], error: null }).client, "u1", "AAPL")).toBe(false);
  });

  it("reads an unreadable ledger as held, so the email still goes", async () => {
    expect(await holdsSymbol(chainClient({ data: null, error: { message: "down" } }).client, "u1", "AAPL")).toBe(true);
  });

  it("keys a symbol without the pair's slash and an option by its underlying", () => {
    expect(heldSymbolKey("btc/usd")).toBe("BTCUSD");
    expect(heldSymbolKey("AAPL251121C00200000")).toBe("AAPL");
    expect(heldSymbolKey("BRK.B")).toBe("BRK.B");
  });
});

describe("executeEmailedToday", () => {
  const now = new Date("2026-10-27T18:00:00Z");

  it("finds another Execute email for the symbol sent today in New York", async () => {
    const { client } = chainClient({
      data: [{ payload: { symbol: "AAPL", verdict: "Execute" }, created_at: "2026-10-27T14:00:00Z" }],
      error: null,
    });
    expect(await executeEmailedToday(client, "u1", "AAPL", "d2", now)).toBe(true);
  });

  it("ignores yesterday's, another symbol's and a broken plan's", async () => {
    const { client } = chainClient({
      data: [
        { payload: { symbol: "AAPL", verdict: "Execute" }, created_at: "2026-10-27T01:00:00Z" },
        { payload: { symbol: "MSFT", verdict: "Execute" }, created_at: "2026-10-27T14:00:00Z" },
        { payload: { symbol: "AAPL", verdict: "INVALIDATED" }, created_at: "2026-10-27T15:00:00Z" },
      ],
      error: null,
    });
    expect(await executeEmailedToday(client, "u1", "AAPL", "d2", now)).toBe(false);
  });

  it("sends when the log can't be read", async () => {
    expect(await executeEmailedToday(chainClient({ data: null, error: { message: "down" } }).client, "u1", "AAPL", "d2", now)).toBe(false);
  });
});
