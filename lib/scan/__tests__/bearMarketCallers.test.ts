/**
 * Every surface prices its buying point the way the scan does (item 6 second
 * review F2/F3): through `gannEntryOf`, so the bear-market rally sale
 * (A-ENTRY-18) is read off the main trend everywhere, the graduation exam and
 * the live exit manager included. No product file may call `selectGannEntry`
 * itself and fall back on its default.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const dirs: Record<string, "bullish" | "bearish" | "sideways"> = {};
vi.mock("@/lib/analysis/trend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analysis/trend")>();
  return {
    ...actual,
    readTrend: (bars: Bar[], tf: string) => {
      const r = actual.readTrend(bars, tf as never);
      return dirs[tf] ? { ...r, direction: dirs[tf] } : r;
    },
  };
});

const { trendsFromBars } = await import("@/lib/scan/entrySelection");

const ROOT = process.cwd();

describe("who prices a buying point", () => {
  it("goes through gannEntryOf on every product surface", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__" && e.name !== "node_modules") walk(p);
        } else if (/\.(ts|tsx)$/.test(p)) files.push(p);
      }
    };
    for (const d of ["lib", "app", "components"]) walk(path.join(ROOT, d));
    const callers = files
      .filter((f) => /\bselectGannEntry\(/.test(readFileSync(f, "utf8").replace(/export function selectGannEntry\(/, "")))
      .map((f) => path.relative(ROOT, f));
    expect(callers).toEqual(["lib/scan/entrySelection.ts"]);
  });
});

describe("trendsFromBars", () => {
  const bars = (n: number): Bar[] =>
    Array.from({ length: n }, (_, i) => ({ t: new Date(Date.UTC(2024, 0, 1 + i)).toISOString(), o: 100, h: 101, l: 99, c: 100, v: 1e6 }));

  it("reads the monthly, the weekly rolled from the daily, and the daily", () => {
    Object.assign(dirs, { "1Month": "bearish", "1Week": "bullish", "1Day": "bullish" });
    const months = Array.from({ length: 24 }, (_, i) => ({ ...bars(1)[0], t: new Date(Date.UTC(2022, i, 1)).toISOString() }));
    expect(trendsFromBars(bars(200), months).map((t) => [t.timeframe, t.direction])).toEqual([
      ["1Month", "bearish"],
      ["1Week", "bullish"],
      ["1Day", "bullish"],
    ]);
    expect(trendsFromBars(bars(200), []).map((t) => t.timeframe)).toEqual(["1Week", "1Day"]);
  });
});
