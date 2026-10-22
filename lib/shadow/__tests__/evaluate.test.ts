import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bar } from "@/lib/types";

function bar(t: string, o: number, h: number, l: number, c: number): Bar {
  return { t, o, h, l, c, v: 1_000_000 };
}

const { fetchBarsMock } = vi.hoisted(() => ({ fetchBarsMock: vi.fn() }));
vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({ fetchBars: fetchBarsMock }),
}));
vi.mock("@/lib/data/instrumentReference", () => ({
  getInstrumentReference: () => Promise.resolve(null),
}));

import { SHADOW_EVALUATIONS_PER_PASS, walkShadowTrade, evaluatePendingShadowSignals } from "@/lib/shadow/evaluate";
import { resetGannExitCache } from "@/lib/trade/gann-exit-live";

/** Quiet daily history before the signal, so Gann's exit rules have sessions to read. */
function history(until: string, n = 60, price = 100): Bar[] {
  const end = new Date(`${until}T05:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(end - (n - i) * 86_400_000).toISOString();
    return bar(t, price, price + 0.5, price - 0.5, price);
  });
}

function session(date: string, rows: [number, number, number, number][]): Bar[] {
  return rows.map(([o, h, l, c], i) => {
    const minutes = 14 * 60 + 30 + i * 15;
    const t = `${date}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00Z`;
    return bar(t, o, h, l, c);
  });
}

const base = { direction: "bullish" as const, entry: 100, stopLoss: 96 };

describe("walkShadowTrade (R-032: production's reaction entry and the method's exits)", () => {
  it("never fills a plan whose session passes without a pullback into the zone", () => {
    const sessionBars = session("2026-08-25", [[101, 102, 100.5, 101.5], [101.5, 103, 101, 102.5]]);
    const r = walkShadowTrade({ ...base, sessionBars, sessionComplete: true, dailyBars: history("2026-08-25") });
    expect(r.outcome).toBe("expired");
    expect(r.fillPrice).toBeNull();
  });

  it("stays pending while the session is still open and nothing has happened", () => {
    const sessionBars = session("2026-08-25", [[101, 102, 100.5, 101.5]]);
    expect(walkShadowTrade({ ...base, sessionBars, sessionComplete: false, dailyBars: [] }).outcome).toBe("pending");
  });

  it("retires a plan whose bar closes through the stop before the reaction", () => {
    const sessionBars = session("2026-08-25", [[101, 101, 95, 95.5]]);
    expect(walkShadowTrade({ ...base, sessionBars, sessionComplete: true, dailyBars: [] }).outcome).toBe("retired");
  });

  it("fills at the next bar's open after the reaction, and a stop hit is a loss on the plan's risk", () => {
    const sessionBars = session("2026-08-25", [
      [101, 101.5, 99.8, 100.2], // trades into the zone
      [100.4, 100.6, 95, 95.5], // fills at 100.4, then the stop at 96 is hit
    ]);
    const r = walkShadowTrade({ ...base, sessionBars, sessionComplete: true, dailyBars: history("2026-08-25") });
    expect(r.fillPrice).toBe(100.4);
    expect(r.outcome).toBe("loss");
    expect(r.rMultiple).toBeCloseTo((96 - 100.4) / 4, 6);
    expect(r.barsHeld).toBe(1);
  });

  it("holds with no fixed target: a run far past any target is still open, then marked out at the limit", () => {
    const sessionBars = session("2026-08-25", [[101, 101.5, 99.8, 100.2], [100.4, 101, 100.2, 100.8]]);
    const after = Array.from({ length: 3 }, (_, i) => {
      const p = 104 + i * 4;
      return bar(new Date(Date.UTC(2026, 7, 26 + i, 5)).toISOString(), p, p + 1, p - 0.5, p + 0.5);
    });
    const daily = [...history("2026-08-25"), ...after];
    const open = walkShadowTrade({ ...base, sessionBars, sessionComplete: true, dailyBars: daily, maxHoldDays: 5 });
    expect(open.outcome).toBe("pending");
    const done = walkShadowTrade({ ...base, sessionBars, sessionComplete: true, dailyBars: daily, maxHoldDays: 2 });
    expect(done.outcome).toBe("timeout");
    expect(done.rMultiple!).toBeGreaterThan(0);
  });

  it("mirrors the reaction for a short", () => {
    const sessionBars = session("2026-08-25", [
      [99, 100.3, 98.8, 99.9],
      [99.6, 104.5, 99.5, 104.2],
    ]);
    const r = walkShadowTrade({ direction: "bearish", entry: 100, stopLoss: 104, sessionBars, sessionComplete: true, dailyBars: history("2026-08-25") });
    expect(r.fillPrice).toBe(99.6);
    expect(r.outcome).toBe("loss");
  });
});

describe("evaluatePendingShadowSignals", () => {
  function makeSupabase(pending: Record<string, unknown>[]) {
    const updates: Record<string, unknown>[] = [];
    const read: { or?: string; order: unknown[][]; limit?: number } = { order: [] };
    const query = {
      is: () => query,
      or: (filter: string) => {
        read.or = filter;
        return query;
      },
      order: (...args: unknown[]) => {
        read.order.push(args);
        return query;
      },
      limit: (n: number) => {
        read.limit = n;
        return Promise.resolve({ data: pending, error: null });
      },
    };
    const client = {
      from: () => ({
        select: () => query,
        update: (obj: Record<string, unknown>) => {
          updates.push(obj);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }),
    } as unknown as SupabaseClient;
    return { client, updates, read };
  }

  const row = { id: "s1", symbol: "AAPL", direction: "bullish", entry: 100, stop_loss: 96, scanned_at: "2026-08-25T14:30:00Z" };

  beforeEach(() => {
    fetchBarsMock.mockReset();
    resetGannExitCache();
  });

  function bars(byTimeframe: Record<string, Bar[]>) {
    fetchBarsMock.mockImplementation((_s: string, tf: string) => Promise.resolve(byTimeframe[tf] ?? []));
  }

  it("writes a filled trade's outcome and fill price back", async () => {
    bars({
      "15Min": session("2026-08-25", [[101, 101.5, 99.8, 100.2], [100.4, 100.6, 95, 95.5]]),
      "1Day": history("2026-08-25"),
    });
    const { client, updates } = makeSupabase([row]);
    const outcome = await evaluatePendingShadowSignals(client, new Date("2026-09-05T00:00:00Z"));
    expect(outcome.evaluated).toBe(1);
    expect(updates[0]).toMatchObject({ outcome: "loss", fill_price: 100.4 });
  });

  it("records a plan that never filled in its session as expired", async () => {
    bars({ "15Min": session("2026-08-25", [[101, 102, 100.5, 101.5]]), "1Day": history("2026-08-25") });
    const { client, updates } = makeSupabase([row]);
    await evaluatePendingShadowSignals(client, new Date("2026-09-05T00:00:00Z"));
    expect(updates[0]).toMatchObject({ outcome: "expired", fill_price: null });
  });

  it("walks a signal recorded after the close on the next session, not the rest of its own day", async () => {
    // 4:30 PM ET on Tuesday the 25th: the plan trades Wednesday the 26th.
    const evening = { ...row, scanned_at: "2026-08-25T20:30:00Z" };
    bars({
      "15Min": [
        bar("2026-08-25T20:45:00Z", 100.2, 100.3, 99.5, 99.9), // after hours on the 25th: not the session
        ...session("2026-08-26", [[101, 101.5, 99.8, 100.2], [100.4, 100.6, 95, 95.5]]),
      ],
      "1Day": history("2026-08-26"),
    });
    const { client, updates } = makeSupabase([evening]);
    await evaluatePendingShadowSignals(client, new Date("2026-09-05T00:00:00Z"));
    expect(updates[0]).toMatchObject({ outcome: "loss", fill_price: 100.4 });
  });

  it("reads the stored session when the row has one", async () => {
    bars({
      "15Min": session("2026-08-27", [[101, 101.5, 99.8, 100.2], [100.4, 100.6, 95, 95.5]]),
      "1Day": history("2026-08-27"),
    });
    const { client, updates } = makeSupabase([{ ...row, scanned_at: "2026-08-25T20:30:00Z", session_date: "2026-08-27" }]);
    await evaluatePendingShadowSignals(client, new Date("2026-09-05T00:00:00Z"));
    expect(updates[0]).toMatchObject({ outcome: "loss", fill_price: 100.4 });
  });

  it("never takes a pre-market print as the reaction", async () => {
    // 6:30 AM ET scan; the only trade into the zone is at 8:00 AM ET.
    bars({
      "15Min": [
        bar("2026-08-25T12:00:00Z", 101, 101.2, 99.9, 100.1),
        ...session("2026-08-25", [[101, 102, 100.5, 101.5]]),
      ],
      "1Day": history("2026-08-25"),
    });
    const { client, updates } = makeSupabase([{ ...row, scanned_at: "2026-08-25T10:30:00Z" }]);
    await evaluatePendingShadowSignals(client, new Date("2026-09-05T00:00:00Z"));
    expect(updates[0]).toMatchObject({ outcome: "expired" });
  });

  it("stays pending before the session it trades has opened", async () => {
    bars({ "15Min": [], "1Day": history("2026-08-25") });
    const { client, updates } = makeSupabase([{ ...row, scanned_at: "2026-08-28T20:30:00Z" }]); // Friday evening
    const out = await evaluatePendingShadowSignals(client, new Date("2026-08-30T12:00:00Z")); // Sunday
    expect(out.stillPending).toBe(1);
    expect(updates).toHaveLength(0);
    expect(fetchBarsMock).not.toHaveBeenCalled();
  });

  it("reads sessions begun by today, least recently checked first, a bounded number a pass", async () => {
    bars({ "15Min": [], "1Day": [] });
    const { client, read } = makeSupabase([]);
    await evaluatePendingShadowSignals(client, new Date("2026-09-05T00:00:00Z"));
    expect(read.or).toBe("session_date.lte.2026-09-04,and(session_date.is.null,scanned_at.lte.2026-09-04T00:00:00.000Z)");
    expect(read.order).toEqual([
      ["checked_at", { ascending: true, nullsFirst: true }],
      ["scanned_at", { ascending: true }],
    ]);
    expect(read.limit).toBe(SHADOW_EVALUATIONS_PER_PASS);
  });

  it("keeps a filled trade still held pending, with its fill and the time it was checked", async () => {
    bars({
      "15Min": session("2026-08-25", [[101, 101.5, 99.8, 100.2], [100.4, 100.8, 100.1, 100.6]]),
      "1Day": history("2026-08-25"),
    });
    const { client, updates } = makeSupabase([row]);
    // The evening of the fill: the session is over, the trade is on.
    const out = await evaluatePendingShadowSignals(client, new Date("2026-08-25T22:00:00Z"));
    expect(out.stillPending).toBe(1);
    expect(updates[0]).toEqual({ checked_at: "2026-08-25T22:00:00.000Z", fill_price: 100.4 });
    expect(updates[0]).not.toHaveProperty("outcome");
  });

  it("reads nothing for today's session while it still trades and nothing has filled", async () => {
    const { client, updates } = makeSupabase([{ ...row, session_date: "2026-08-25" }]);
    const out = await evaluatePendingShadowSignals(client, new Date("2026-08-25T18:00:00Z")); // 2 PM ET
    expect(out.stillPending).toBe(1);
    expect(fetchBarsMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("reads a symbol's daily chart once a batch, however many of its rows are pending", async () => {
    bars({ "15Min": session("2026-08-25", [[101, 102, 100.5, 101.5]]), "1Day": history("2026-08-25") });
    const { client } = makeSupabase([row, { ...row, id: "s2" }, { ...row, id: "s3" }]);
    await evaluatePendingShadowSignals(client, new Date("2026-09-05T00:00:00Z"));
    expect(fetchBarsMock.mock.calls.filter((c) => c[1] === "1Day")).toHaveLength(1);
  });

  it("walks every row of a pass larger than one concurrent batch", async () => {
    bars({ "15Min": session("2026-08-25", [[101, 102, 100.5, 101.5]]), "1Day": history("2026-08-25") });
    const many = Array.from({ length: 14 }, (_, i) => ({ ...row, id: `s${i}` }));
    const { client, updates } = makeSupabase(many);
    const out = await evaluatePendingShadowSignals(client, new Date("2026-09-05T00:00:00Z"));
    expect(out.evaluated).toBe(14);
    expect(updates).toHaveLength(14);
  });

  it("counts a per-symbol provider failure without aborting the pass", async () => {
    fetchBarsMock.mockRejectedValue(new Error("provider timeout"));
    const { client } = makeSupabase([row]);
    const outcome = await evaluatePendingShadowSignals(client, new Date("2026-09-05T00:00:00Z"));
    expect(outcome.failed).toBe(1);
    expect(outcome.evaluated).toBe(0);
  });
});
