/**
 * Every surface reads the scored volume rule on completed sessions and closed
 * months (item 8 review M1): the live scan and the replay hand
 * `computeVolumeClimax` the session being read (`asOf`) and the monthly bars;
 * the coarse pass, the confluence card and the context reading hand it `asOf`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";
import type { VolumeClimaxOptions } from "@/lib/gann/volumeClimax";

const seen = vi.hoisted(() => ({ opts: [] as VolumeClimaxOptions[] }));
vi.mock("@/lib/gann/volumeClimax", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gann/volumeClimax")>("@/lib/gann/volumeClimax");
  return {
    ...actual,
    computeVolumeClimax: (...args: Parameters<typeof actual.computeVolumeClimax>) => {
      seen.opts.push(args[2] ?? {});
      return actual.computeVolumeClimax(...args);
    },
  };
});

import { scanTicker } from "@/lib/scanTicker";
import { buildMacroContext } from "@/lib/backtest/replay";

const DAY = 86_400_000;
function daily(n: number, end: string): Bar[] {
  const t1 = Date.parse(`${end}T05:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + 10 * Math.sin(i / 9);
    return { t: new Date(t1 - (n - 1 - i) * DAY).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1e6 };
  });
}

describe("the scored volume rule's inputs", () => {
  const original = process.env.MARKET_DATA_PROVIDER;
  beforeEach(() => {
    seen.opts.length = 0;
  });
  afterEach(() => {
    process.env.MARKET_DATA_PROVIDER = original;
  });

  it("the replay passes the session's date and the months closed before it", () => {
    const d = daily(300, "2026-06-12");
    const monthly: Bar[] = [{ t: "2026-05-01T04:00:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 }];
    const asOf = new Date("2026-06-15T12:00:00Z");
    buildMacroContext(d, d[d.length - 1].c, asOf, monthly);
    expect(seen.opts.some((o) => o.asOf === asOf && o.monthly === monthly)).toBe(true);
  });

  it("the live scan passes the scan's time and the monthly bars", async () => {
    process.env.MARKET_DATA_PROVIDER = "synthetic";
    await scanTicker("AAPL");
    expect(seen.opts.length).toBeGreaterThan(0);
    // Every reading on the scan is of completed sessions.
    expect(seen.opts.every((o) => o.asOf instanceof Date)).toBe(true);
    expect(seen.opts.some((o) => Array.isArray(o.monthly) && o.monthly.length > 0)).toBe(true);
    // The scored reading is the scan's own; the confluence card's call carries the monthly bars too.
    expect(readFileSync(path.resolve(__dirname, "../../scanTicker.ts"), "utf8")).toMatch(/computeVolumeClimax\(daily, undefined, \{ asOf: new Date\(scannedAt\), monthly \}\)/);
  }, 30_000);

  it("the coarse pass, the confluence card and the context reading pass the session being read", () => {
    const src = (f: string) => readFileSync(path.resolve(__dirname, "../../", f), "utf8");
    expect(src("marketScan.ts")).toMatch(/computeVolumeClimax\(daily, undefined, \{ asOf: new Date\(\) \}\)/);
    expect(src("signals/confluence/gann.ts")).toMatch(/computeVolumeClimax\(inputs\.dailyBars, undefined, \{ asOf: new Date\(\), monthly: inputs\.instrument\?\.monthly \?\? null \}\)/);
    expect(src("gann/disclosedRules.ts")).toMatch(/computeVolumeClimax\(dailyBars, undefined, \{ asOf \}\)/);
    // The shares-per-point reading too (item 8 review M3).
    expect(src("gann/disclosedRules.ts")).toMatch(/readSharesPerPoint\(dailyBars, campaign, asOf\)/);
  });

  it("holds a long on a standing breakdown after a lower top on the live scan and in the replay (A-VOLUME-03)", () => {
    const src = (f: string) => readFileSync(path.resolve(__dirname, "../../", f), "utf8");
    expect(src("scanTicker.ts")).toMatch(/const distributionStanding = readDistributionStanding\(daily, new Date\(scannedAt\)\)/);
    expect(src("scanTicker.ts")).toMatch(/applyDistributionBreakdownHold\(applyMonthlyBreakHold\(/);
    expect(src("scanTicker.ts")).toMatch(/monthlyWarning, scoreDirection\), distributionStanding, scoreDirection\)/);
    expect(src("backtest/replay.ts")).toMatch(/applyDistributionBreakdownHold\(applyMonthlyBreakHold\(/);
    expect(src("backtest/replay.ts")).toMatch(/context\.disclosedRules\.distributionStanding \?\? null, gannTrigger\.direction\)/);
    expect(src("gann/disclosedRules.ts")).toMatch(/distributionStanding: readDistributionStanding\(dailyBars, asOf\)/);
    // Review M5 (BV14): the replay's volume test reads the scan's 52-week entry
    // chart of sessions before the day, never the whole series (no lookahead).
    expect(src("backtest/replay.ts")).toMatch(/const entryDaily = chart\.bars;/);
    expect(src("backtest/replay.ts")).toMatch(/breakawayVolumeMet\(entryDaily, trigger\.direction, gannBreakLine\(trigger\.reactionEntry, trigger\.reactionStop\)\)/);
    // Review M2: the replay enters no long while one stands, as placement refuses it.
    expect(src("backtest/replay.ts")).toMatch(/if \(trigger\.direction === "bullish" && arm\.context\.disclosedRules\.distributionStanding\) continue;/);
  });
});
