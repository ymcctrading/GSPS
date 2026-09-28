/**
 * The mega-cap universe reaches the live scan's rotation (2026-09-26,
 * project-owner direction) without adding symbols to any single run.
 */
import { describe, expect, it } from "vitest";
import {
  DIVERSIFIED_BACKTEST_SAMPLE,
  LARGE_CAP_UNIVERSE,
  MEGA_CAP_UNIVERSE,
  SCAN_DISCOVERY_UNIVERSE,
} from "@/lib/scan/large-cap-universe";
import { DISCOVERY_CHUNK_SIZE, chunkUniverse } from "@/lib/scan/universe-rotation";

describe("SCAN_DISCOVERY_UNIVERSE", () => {
  it("contains every mega-cap and every large-cap, once each", () => {
    const set = new Set(SCAN_DISCOVERY_UNIVERSE);
    expect(set.size).toBe(SCAN_DISCOVERY_UNIVERSE.length);
    for (const s of [...MEGA_CAP_UNIVERSE, ...LARGE_CAP_UNIVERSE]) expect(set.has(s)).toBe(true);
    // The names that had been reaching the coarse gate only incidentally.
    for (const s of ["NFLX", "COST", "WMT", "PLTR"]) expect(set.has(s)).toBe(true);
  });

  it("keeps the rotation at the same chunk count as the large-cap band alone", () => {
    // A run scans one chunk, so the per-run symbol count is capped by the
    // chunk size either way. If this fails, a list change has lengthened the
    // cycle: fine to accept, but say so and re-time the scan.
    const before = chunkUniverse(LARGE_CAP_UNIVERSE, DISCOVERY_CHUNK_SIZE).length;
    const after = chunkUniverse(SCAN_DISCOVERY_UNIVERSE, DISCOVERY_CHUNK_SIZE);
    expect(after.length).toBe(before);
    for (const chunk of after) expect(chunk.length).toBeLessThanOrEqual(DISCOVERY_CHUNK_SIZE);
  });
});

describe("DIVERSIFIED_BACKTEST_SAMPLE", () => {
  it("is drawn entirely from the large-cap universe", () => {
    const lc = new Set(LARGE_CAP_UNIVERSE);
    for (const s of DIVERSIFIED_BACKTEST_SAMPLE) expect(lc.has(s)).toBe(true);
  });
});
