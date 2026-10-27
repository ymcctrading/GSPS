/**
 * A crossing plan generated after its crossing closed (since 2026-10-27 a
 * crossing reads Execute only once held) arms when the daily chart still
 * holds the crossing, so the reaction into the zone can fill it.
 */
import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const bars: Bar[] = [];
vi.mock("@/lib/data/provider", () => ({ getMarketDataProvider: () => ({ fetchBars: async () => bars }) }));
let held = true;
vi.mock("@/lib/lifecycle/confirmNow", async (orig) => ({
  ...(await orig<typeof import("@/lib/lifecycle/confirmNow")>()),
  crossingHeldNow: async () => held,
}));
const events: { type: string; reason?: string }[] = [];
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
// Level 100, crossed earlier; reaction buy 101, stop 97.
const plan = {
  planId: "p1", signalId: "scan:1", instrument: "AAPL", market: "us_equity", direction: "bullish",
  generatedAt, expiresAt: "2026-10-20T20:00:00.000Z",
  coordinates: { entryTrigger: 101, invalidation: 97, entryKind: "crossing" },
};
const at = (i: number) => new Date(Date.parse(generatedAt) + i * 15 * 60_000).toISOString();
const b = (i: number, h: number, l: number, c: number): Bar => ({ t: at(i), o: c, h, l, c, v: 1000 });
const now = new Date(Date.parse(generatedAt) + 10 * 15 * 60_000);
// Three bars reacting into the zone, none closing past the crossing line (103).
const reaction = [b(0, 102, 100.6, 101.2), b(1, 101.8, 100.4, 100.9), b(2, 101.5, 100.5, 101.1)];

describe("a plan from a held crossing", () => {
  it("arms when the daily chart still holds the crossing", async () => {
    bars.splice(0, bars.length, ...reaction);
    plans.splice(0, plans.length, plan);
    events.length = 0;
    held = true;
    const r = await armConfirmedPlansFromBars({} as never, "u1", { now });
    expect(r.armed).toEqual(["p1"]);
    expect(events.at(-1)?.reason).toMatch(/daily chart still holds it/);
  });

  it("stays unarmed when the crossing is not held", async () => {
    bars.splice(0, bars.length, ...reaction);
    plans.splice(0, plans.length, plan);
    events.length = 0;
    held = false;
    const r = await armConfirmedPlansFromBars({} as never, "u1", { now });
    expect(r.armed).toEqual([]);
  });

  it("stays unarmed once a bar has closed through the stop", async () => {
    bars.splice(0, bars.length, b(0, 101, 96, 96.5));
    plans.splice(0, plans.length, plan);
    events.length = 0;
    held = true;
    const r = await armConfirmedPlansFromBars({} as never, "u1", { now });
    expect(r.armed).toEqual([]);
  });
});
