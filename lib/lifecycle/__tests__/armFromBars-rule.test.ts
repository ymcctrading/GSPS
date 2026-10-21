/**
 * Review finding R-014: the portfolio manager arms a plan on its own entry
 * rule (Gann's crossing line from the entry and stop), the same rule the
 * scan-driven advance and placement read, not the retest-and-hold sequence.
 */
import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const bars: Bar[] = [];
vi.mock("@/lib/data/provider", () => ({ getMarketDataProvider: () => ({ fetchBars: async () => bars }) }));
const events: { type: string }[] = [];
const plans: unknown[] = [];
vi.mock("@/lib/lifecycle/store", () => ({
  listTradePlans: async () => plans,
  applyEventAndPersist: async (_s: unknown, _u: unknown, _p: unknown, e: { type: string }) => {
    events.push(e);
    return { ok: true, plan: {} };
  },
}));

import { armConfirmedPlansFromBars } from "@/lib/lifecycle/armFromBars";

const generatedAt = "2026-10-20T14:00:00.000Z";
const plan = {
  planId: "p1", signalId: "scan:1", instrument: "AAPL", market: "us_equity", direction: "bullish",
  generatedAt, expiresAt: "2026-10-20T20:00:00.000Z",
  coordinates: { entryTrigger: 101, invalidation: 97 },
};
// The crossing line is 101 + (101 - 97) / 2 = 103.
const at = (i: number) => new Date(Date.parse(generatedAt) + i * 15 * 60_000).toISOString();
const b = (i: number, h: number, l: number, c: number): Bar => ({ t: at(i), o: c, h, l, c, v: 1000 });
const now = new Date(Date.parse(generatedAt) + 10 * 15 * 60_000);

describe("armConfirmedPlansFromBars reads the plan's own rule", () => {
  it("does not arm on a retest of the entry while price never closed past the crossing line", async () => {
    // Touch 101, close above it, retest it, close above the retest: the old
    // sequence's arm, all below 103.
    bars.splice(0, bars.length, b(0, 101.2, 100.5, 100.8), b(1, 102, 101, 101.6), b(2, 101.8, 100.9, 101.3), b(3, 102.4, 101.2, 102.2));
    plans.splice(0, plans.length, plan);
    events.length = 0;
    const r = await armConfirmedPlansFromBars({} as never, "u1", { now });
    expect(r.armed).toEqual([]);
    expect(events).toHaveLength(0);
  });

  it("arms once a closed bar closes past the crossing line", async () => {
    bars.splice(0, bars.length, b(0, 101.2, 100.5, 100.8), b(1, 103.6, 101, 103.2));
    plans.splice(0, plans.length, plan);
    events.length = 0;
    const r = await armConfirmedPlansFromBars({} as never, "u1", { now });
    expect(r.armed).toEqual(["p1"]);
    expect(events.map((e) => e.type)).toEqual(["record_confirmation_evidence", "arm"]);
  });
});
