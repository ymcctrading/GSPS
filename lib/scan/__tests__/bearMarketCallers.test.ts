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
/** The monthly bars each readTrend call saw, last call last. */
const monthlySeen: Bar[][] = [];
const weeklySeen: Bar[][] = [];
vi.mock("@/lib/analysis/trend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analysis/trend")>();
  return {
    ...actual,
    readTrend: (bars: Bar[], tf: string) => {
      if (tf === "1Month") monthlySeen.push(bars);
      if (tf === "1Week") weeklySeen.push(bars);
      const r = actual.readTrend(bars, tf as never);
      return dirs[tf] ? { ...r, direction: dirs[tf] } : r;
    },
  };
});

const { trendsFromBars } = await import("@/lib/scan/entrySelection");
const { entryCrossedLevel } = await import("@/lib/trade/gann-exit-live");
const { buildScenario } = await import("@/lib/school/graduationExam");

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
    // The weekly is rolled from the daily: about a seventh as many bars, each spanning its week.
    const weeks = weeklySeen[weeklySeen.length - 1];
    expect(weeks.length).toBeGreaterThanOrEqual(28);
    expect(weeks.length).toBeLessThanOrEqual(30);
  });
});

describe("the monthly trend an entry is priced with (item 7 review M2)", () => {
  // Daily sessions Jan 2023 to Apr 2024; the provider's March 2024 bar (dated the 1st)
  // carries a high made after the day being read.
  const daily: Bar[] = Array.from({ length: 480 }, (_, i) => {
    const c = 100 + Math.sin(i / 9) * 5 + i * 0.02;
    return { t: new Date(Date.UTC(2023, 0, 1 + i)).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1e6 };
  });
  const monthly: Bar[] = Array.from({ length: 40 }, (_, i) => ({
    t: new Date(Date.UTC(2021, i, 1)).toISOString(), o: 100, h: i === 38 ? 999 : 110, l: 90, c: 100, v: 1e6,
  }));
  const day = "2024-03-10";
  const lastSeen = () => monthlySeen[monthlySeen.length - 1];

  it("keeps months before the day's month and rolls that month from the sessions before the day, in the live exit check", () => {
    monthlySeen.length = 0;
    entryCrossedLevel("long", 105, `${day}T15:00:00Z`, daily, monthly);
    const seen = lastSeen();
    expect(seen[seen.length - 1].t.slice(0, 7)).toBe("2024-03");
    expect(seen.some((b) => b.h === 999)).toBe(false);
    const sessions = daily.filter((b) => b.t.slice(0, 7) === "2024-03" && b.t.slice(0, 10) < day);
    expect(seen[seen.length - 1].h).toBe(Math.max(...sessions.map((b) => b.h)));
  });

  it("does the same in the graduation exam", () => {
    monthlySeen.length = 0;
    buildScenario("TEST", day, daily, 1, monthly);
    const seen = lastSeen();
    expect(seen).toBeDefined();
    expect(seen.some((b) => b.h === 999)).toBe(false);
    expect(seen[seen.length - 1].t.slice(0, 7)).toBe("2024-03");
  });
});
