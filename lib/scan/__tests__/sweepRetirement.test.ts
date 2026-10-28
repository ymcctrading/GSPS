import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pricedInRegularSession, retireSweepFromScan } from "@/lib/scan/sweepRetirement";
import type { ScanResult } from "@/lib/types";

/** Answers the retirement's select with `rows` and records its update. */
function fakeDb(rows: Record<string, unknown>[]) {
  const updates: { patch: Record<string, unknown>; filters: [string, unknown][] }[] = [];
  const db = {
    from: () => {
      const filters: [string, unknown][] = [];
      let patch: Record<string, unknown> | null = null;
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (p: Record<string, unknown>) => ((patch = p), chain),
        eq: (c: string, v: unknown) => (filters.push([c, v]), chain),
        in: (c: string, v: unknown) => (filters.push([c, v]), chain),
        is: (c: string, v: unknown) => (filters.push([c, v]), chain),
        then: (resolve: (v: unknown) => void) => {
          if (patch) {
            updates.push({ patch, filters });
            return resolve({ error: null });
          }
          return resolve({ data: rows, error: null });
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { db, updates };
}

// A Reject read with no plan: the night's buy is no longer read.
const reject = { symbol: "DE", direction: "bullish", decision: { outputState: "Reject" }, levels: null } as unknown as ScanResult;
const output = { equitiesRead: true, stockReads: [reject] };
const rows = [{ symbol: "DE", direction: "bullish" }];
const regular = new Date("2026-10-28T15:00:00Z"); // 11:00 New York
const preMarket = new Date("2026-10-28T12:00:00Z"); // 8:00 New York

describe("retireSweepFromScan", () => {
  it("retires the night's plan a regular-session scan re-read without it", async () => {
    const { db, updates } = fakeDb(rows);
    expect(await retireSweepFromScan(db, "2026-10-28", ["DE"], output, regular)).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ invalidated_at: regular.toISOString() });
    expect(updates[0].filters).toEqual([["basis_date", "2026-10-28"], ["symbol", ["DE"]], ["invalidated_at", null]]);
  });

  it("retires nothing on a pre-market scan, a scan whose stocks were not read, or with no night", async () => {
    for (const [basis, out, now] of [
      ["2026-10-28", output, preMarket],
      ["2026-10-28", { ...output, equitiesRead: false }, regular],
      [null, output, regular],
    ] as const) {
      const { db, updates } = fakeDb(rows);
      expect(await retireSweepFromScan(db, basis, ["DE"], out, now)).toBe(0);
      expect(updates).toHaveLength(0);
    }
  });

  it("leaves a swept symbol the scan did not re-read", async () => {
    const { db, updates } = fakeDb(rows);
    expect(await retireSweepFromScan(db, "2026-10-28", ["XOM"], output, regular)).toBe(0);
    expect(updates).toHaveLength(0);
  });
});

describe("pricedInRegularSession", () => {
  it("waits out the feed's opening lag and ends at an early close", () => {
    expect(pricedInRegularSession(new Date("2026-10-28T13:40:00Z"))).toBe(false); // 9:40, still pre-market prints
    expect(pricedInRegularSession(new Date("2026-10-28T14:00:00Z"))).toBe(true);
    expect(pricedInRegularSession(new Date("2026-11-27T18:30:00Z"))).toBe(false); // 1:30 PM on an early close
    expect(pricedInRegularSession(new Date("2026-11-27T17:30:00Z"))).toBe(true);
  });
});
