/**
 * The rotation is a wheel, not a queue -- these assertions exist specifically
 * to catch a regression back toward linear "drain and stop" behavior, and to
 * prove the phase-resumption property the module's header claims: a missed
 * or delayed tick must resolve to the chunk that clock time actually implies,
 * not to whatever the previous call happened to leave off at.
 */

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chunkUniverse,
  resolveDiscoveryAndTrackingSymbols,
  resolveRotationChunk,
  resolveTrackedSymbols,
  ROTATION_INTERVAL_MINUTES,
} from "@/lib/scan/universe-rotation";

const UNIVERSE = Array.from({ length: 10 }, (_, i) => `SYM${i}`);

// A Tuesday, ET = UTC-4 in September (EDT). Takes minutes-since-midnight-ET
// directly so callers can add multiples of ROTATION_INTERVAL_MINUTES without
// manually carrying overflow into the hour field -- Date.UTC normalizes an
// out-of-range minutes value itself.
const etDate = (minutesSinceMidnightEt: number): Date => new Date(Date.UTC(2026, 8, 22, 4, minutesSinceMidnightEt));

describe("chunkUniverse", () => {
  it("splits into fixed-size chunks, preserving order", () => {
    expect(chunkUniverse(UNIVERSE, 4)).toEqual([
      ["SYM0", "SYM1", "SYM2", "SYM3"],
      ["SYM4", "SYM5", "SYM6", "SYM7"],
      ["SYM8", "SYM9"],
    ]);
  });

  it("rejects a non-positive chunk size", () => {
    expect(() => chunkUniverse(UNIVERSE, 0)).toThrow();
  });
});

describe("resolveRotationChunk", () => {
  it("returns null for an empty universe", () => {
    expect(resolveRotationChunk([], 4, etDate(10 * 60))).toBeNull();
  });

  it("advances one chunk per rotation interval", () => {
    const first = resolveRotationChunk(UNIVERSE, 4, etDate(9 * 60 + 30));
    const second = resolveRotationChunk(UNIVERSE, 4, etDate(9 * 60 + 30 + ROTATION_INTERVAL_MINUTES));
    expect(first?.chunkIndex).not.toBe(second?.chunkIndex);
  });

  // A minutes-since-midnight value whose tick (minutes / ROTATION_INTERVAL_MINUTES)
  // is itself an exact multiple of chunkCount -- i.e. chunkIndex 0 -- so the
  // offsets below land on the chunk index their comment claims rather than
  // an arbitrary phase.
  const chunkZeroAnchor = (chunkCount: number): number => {
    const rawTick = Math.floor((9 * 60 + 30) / ROTATION_INTERVAL_MINUTES);
    const tick0 = Math.ceil(rawTick / chunkCount) * chunkCount;
    return tick0 * ROTATION_INTERVAL_MINUTES;
  };

  it("wraps back to chunk 0 after the last chunk -- a cycle, not a queue that empties", () => {
    // 3 chunks over a 10-symbol universe of size 4; the last tick before a
    // wrap resolves to the final chunk, and the very next tick must resolve
    // to chunk 0 again, not "done".
    const chunkCount = chunkUniverse(UNIVERSE, 4).length;
    const anchor = chunkZeroAnchor(chunkCount);
    const lastChunkTick = etDate(anchor + ROTATION_INTERVAL_MINUTES * (chunkCount - 1));
    const wrapTick = etDate(anchor + ROTATION_INTERVAL_MINUTES * chunkCount);
    const last = resolveRotationChunk(UNIVERSE, 4, lastChunkTick);
    const wrapped = resolveRotationChunk(UNIVERSE, 4, wrapTick);
    expect(last?.chunkIndex).toBe(chunkCount - 1);
    expect(wrapped?.chunkIndex).toBe(0);
  });

  it("resumes the correct phase after a gap, rather than drifting from a missed tick", () => {
    // No call was made for the ticks in between -- there is no counter to
    // have missed an increment on. The chunk resolved for a given clock time
    // is identical whether or not earlier ticks were ever resolved.
    const chunkCount = chunkUniverse(UNIVERSE, 4).length;
    const anchor = chunkZeroAnchor(chunkCount);
    const farTick = etDate(anchor + ROTATION_INTERVAL_MINUTES * (chunkCount * 5 + 1));
    const resolved = resolveRotationChunk(UNIVERSE, 4, farTick);
    expect(resolved?.chunkIndex).toBe(1 % chunkCount);
  });

  it("is deterministic for the same clock time", () => {
    const t = etDate(11 * 60 + 15);
    const a = resolveRotationChunk(UNIVERSE, 4, t);
    const b = resolveRotationChunk(UNIVERSE, 4, t);
    expect(a).toEqual(b);
  });

  it("returns the chunk's actual symbols, not just its index", () => {
    const resolved = resolveRotationChunk(UNIVERSE, 4, etDate(9 * 60 + 30));
    expect(resolved?.symbols.length).toBeGreaterThan(0);
    expect(resolved?.symbols.every((s) => UNIVERSE.includes(s))).toBe(true);
  });
});

function fakeClient(result: { data: { symbol: string }[] | null; error: { message: string } | null }) {
  return {
    from(_table: string) {
      return {
        select() {
          return {
            eq: () => Promise.resolve(result),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("resolveTrackedSymbols", () => {
  it("reads today's published daily_scans symbols, deduped and uppercased", async () => {
    const client = fakeClient({ data: [{ symbol: "aapl" }, { symbol: "MSFT" }, { symbol: "aapl" }], error: null });
    const tracked = await resolveTrackedSymbols(client, "2026-09-23");
    expect(tracked.sort()).toEqual(["AAPL", "MSFT"]);
  });

  it("degrades to an empty list on a read error, rather than throwing", async () => {
    const client = fakeClient({ data: null, error: { message: "boom" } });
    await expect(resolveTrackedSymbols(client, "2026-09-23")).resolves.toEqual([]);
  });
});

describe("resolveDiscoveryAndTrackingSymbols", () => {
  it("unions the tracked shortlist with the current rotation chunk", async () => {
    const client = fakeClient({ data: [{ symbol: "AAPL" }], error: null });
    const combined = await resolveDiscoveryAndTrackingSymbols(client, "2026-09-23", UNIVERSE, 4, etDate(9 * 60 + 30));
    expect(combined).toContain("AAPL");
    const chunk = resolveRotationChunk(UNIVERSE, 4, etDate(9 * 60 + 30));
    for (const s of chunk?.symbols ?? []) {
      expect(combined).toContain(s);
    }
  });

  it("still returns the discovery chunk when the tracked read fails", async () => {
    const client = fakeClient({ data: null, error: { message: "boom" } });
    const combined = await resolveDiscoveryAndTrackingSymbols(client, "2026-09-23", UNIVERSE, 4, etDate(9 * 60 + 30));
    const chunk = resolveRotationChunk(UNIVERSE, 4, etDate(9 * 60 + 30));
    expect(combined).toEqual(chunk?.symbols);
  });
});
