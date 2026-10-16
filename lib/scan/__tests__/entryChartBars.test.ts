/**
 * One daily window for a buying point on every surface (PLAN.md item 5). The
 * live scan fetches a year of daily bars and the replay holds six, and since
 * step 1 a crossed level stays held until it is bought, so a deeper history
 * could hold a level the scan never sees. Every surface reads the buying point
 * from the 52 weeks of completed sessions before the day, and never from the
 * session still forming.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { ENTRY_CHART_DAYS, entryChartBars } from "@/lib/scan/entrySelection";
import { computeGannEntryTrigger, selectGannEntry } from "@/lib/gann/entryTrigger";
import { heldOnDailyChart } from "@/lib/lifecycle/confirmNow";
import { entryCrossedLevel } from "@/lib/trade/gann-exit-live";

const DAY = 86_400_000;
function series(closes: number[], start = "2024-06-03"): Bar[] {
  const t0 = Date.parse(`${start}T04:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);

// An old top at 50, crossed a little later, and then a straight climb for well
// over a year with no reaction: the level is still held on the whole history,
// but the last 52 weeks hold no completed swing at all.
const OLD = series([...leg(40, 50, 10), ...leg(50, 44, 6), ...leg(44, 56, 8), ...leg(56, 140, 420)]);
const asOf = OLD[OLD.length - 1].t.slice(0, 10);
const tomorrow = new Date(Date.parse(`${asOf}T00:00:00Z`) + DAY).toISOString().slice(0, 10);

describe("entryChartBars", () => {
  it("keeps the 52 weeks of sessions before the day and nothing from the day itself", () => {
    expect(ENTRY_CHART_DAYS).toBe(364);
    const w = entryChartBars(OLD, asOf);
    expect(w[w.length - 1].t.slice(0, 10) < asOf).toBe(true);
    expect(w.some((b) => b.t.slice(0, 10) === asOf)).toBe(false);
    const first = Date.parse(`${w[0].t.slice(0, 10)}T00:00:00Z`);
    expect(Date.parse(`${asOf}T00:00:00Z`) - first).toBeLessThanOrEqual(ENTRY_CHART_DAYS * DAY);
    expect(w.length).toBe(ENTRY_CHART_DAYS);
  });

  it("does not see a level held only on history older than 52 weeks", () => {
    // On the whole history the old top is held; in the window there is no setup.
    expect(computeGannEntryTrigger(OLD, "bullish")?.held).toBe(true);
    expect(selectGannEntry(entryChartBars(OLD, tomorrow), "bullish")).toBeNull();
  });
});

describe("every surface reads the same window", () => {
  const held = computeGannEntryTrigger(OLD, "bullish")!;

  it("confirmation does not find the scan a level it could not have seen", () => {
    const now = new Date(`${tomorrow}T15:00:00Z`);
    expect(heldOnDailyChart(OLD, now, "bullish", held.reactionEntry)).toBe(false);
  });

  it("the live exit recovers no crossed level from history the entry could not see", () => {
    expect(entryCrossedLevel("long", held.reactionEntry, `${tomorrow}T15:00:00Z`, OLD)).toBeNull();
    // A level inside the window is still recovered.
    const recent = series([...leg(40, 50, 10), ...leg(50, 44, 6), ...leg(44, 56, 8), ...leg(56, 53, 4)], "2026-01-05");
    const t = computeGannEntryTrigger(recent, "bullish")!;
    const after = new Date(Date.parse(recent[recent.length - 1].t) + DAY).toISOString();
    expect(entryCrossedLevel("long", t.reactionEntry, after, recent)).toBeCloseTo(t.level, 8);
  });
});
