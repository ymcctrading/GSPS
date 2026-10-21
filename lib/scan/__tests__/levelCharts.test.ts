import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { levelCharts, mondayOf, WEEKLY_CHART_YEARS } from "@/lib/scan/levelCharts";

const DAY = 86_400_000;
/** Weekday sessions from 2014-01-06 to `last` (inclusive), each at 05:00Z. */
function sessions(last: string): Bar[] {
  const out: Bar[] = [];
  for (let t = Date.UTC(2014, 0, 6, 5); t <= Date.parse(`${last}T05:00:00Z`); t += DAY) {
    const d = new Date(t).getUTCDay();
    if (d === 0 || d === 6) continue;
    const i = out.length;
    const c = 100 + 20 * Math.sin(i / 17) + i * 0.01;
    out.push({ t: new Date(t).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1000 + (i % 7) });
  }
  return out;
}
/** A provider-style roll-up: one bar per key, the key's first bar's time. */
function roll(bars: Bar[], key: (b: Bar) => string): Bar[] {
  const out: Bar[] = [];
  let k = "";
  for (const b of bars) {
    const kb = key(b);
    const cur = out[out.length - 1];
    if (cur && kb === k) {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.v += b.v;
    } else {
      out.push({ ...b, t: `${kb.length === 7 ? `${kb}-01` : kb}T04:00:00.000Z` });
      k = kb;
    }
  }
  return out;
}

describe("one level-chart window on both surfaces (item 9 step 4)", () => {
  // Wednesday 2026-10-14, the session still trading.
  const asOf = "2026-10-14";
  const all = sessions(asOf);
  const live = {
    // The live feed: a year of daily bars with today's forming one, 5 years of
    // weeks and 13 of months, each with the bar in progress.
    daily: all.filter((b) => b.t.slice(0, 10) >= "2025-10-14"),
    weekly: roll(all.filter((b) => b.t.slice(0, 10) >= "2021-10-14"), (b) => mondayOf(b.t.slice(0, 10))),
    monthly: roll(all.filter((b) => b.t.slice(0, 10) >= "2013-10-01"), (b) => b.t.slice(0, 7)),
  };
  const replay = {
    // The replay: six years of completed sessions, closed months only, no weeks.
    daily: all.filter((b) => b.t.slice(0, 10) >= "2020-10-14" && b.t.slice(0, 10) < asOf),
    weekly: null,
    monthly: roll(all.filter((b) => b.t.slice(0, 7) < "2026-10"), (b) => b.t.slice(0, 7)),
  };

  it("gives the live scan and the replay the same daily, weekly and monthly charts", () => {
    expect(levelCharts(live, asOf)).toEqual(levelCharts(replay, asOf));
  });

  it("reads completed sessions only, 52 weeks of days, 5 years of weeks, 10 calendar years of months", () => {
    const c = levelCharts(live, asOf);
    expect(c.daily.every((b) => b.t.slice(0, 10) < asOf)).toBe(true);
    expect(c.daily[0].t.slice(0, 10) >= "2025-10-15").toBe(true);
    // The week in progress is built from Monday and Tuesday only.
    const week = c.weekly[c.weekly.length - 1];
    expect(week.t.slice(0, 10)).toBe("2026-10-12");
    const monTue = all.filter((b) => ["2026-10-12", "2026-10-13"].includes(b.t.slice(0, 10)));
    expect(week.c).toBe(monTue[1].c);
    expect(week.v).toBe(monTue[0].v + monTue[1].v);
    expect(c.weekly[0].t.slice(0, 10) >= `${2026 - WEEKLY_CHART_YEARS}-10-14`).toBe(true);
    // Months from January 2016, the month in progress from completed sessions.
    expect(c.monthly[0].t.slice(0, 7)).toBe("2016-01");
    const month = c.monthly[c.monthly.length - 1];
    expect(month.t.slice(0, 7)).toBe("2026-10");
    expect(month.c).toBe(monTue[1].c);
  });

  it("finds a week's Monday", () => {
    expect(mondayOf("2026-10-14")).toBe("2026-10-12");
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(mondayOf("2026-10-18")).toBe("2026-10-12");
    expect(mondayOf("2026-03-01")).toBe("2026-02-23");
  });
});

describe("both surfaces read their levels from the level charts", () => {
  it("wires the trends, the target angles, the retracements, the percentages and the disclosed rules to them", async () => {
    const fs = await import("node:fs");
    const live = fs.readFileSync("lib/scanTicker.ts", "utf8");
    const replay = fs.readFileSync("lib/backtest/replay.ts", "utf8");
    for (const src of [live, replay]) {
      expect(src).toMatch(/levelCharts\(\{ daily, weekly(: priorWeekly)?, monthly: /);
      expect(src).toMatch(/readTrend\(charts\.daily, "1Day"\)/);
      expect(src).toMatch(/computeFanLines\(charts\.daily, /);
      expect(src).toMatch(/recentSquareOf9Levels\(charts\.daily, /);
      expect(src).toMatch(/computeRetracementLevels\(charts\.daily, /);
      // The percentage levels are read inside buildStructuralLevels (below) since 2026-10-21.
      expect(src).toMatch(/buildStructuralLevels\(\{\n\s+trends: \{ daily: dailyTrend, weekly: weeklyTrend, monthly: monthlyTrend \},\n\s+charts,/);
    }
    expect(fs.readFileSync("lib/scan/structuralLevels.ts", "utf8")).toMatch(/majorPricePercentageLevels\(\[\.\.\.charts\.monthly, \.\.\.charts\.daily\]\)/);
    expect(live).toMatch(/readTrend\(charts\.monthly, "1Month"\)/);
    expect(live).toMatch(/readTrend\(charts\.weekly, "1Week"\)/);
    expect(live).toMatch(/dailyBars: charts\.daily,/);
    expect(replay).toMatch(/const weekly = charts\.weekly;/);
    expect(replay).toMatch(/const monthly = charts\.monthly;/);
    expect(replay).toMatch(/readDisclosedRules\(charts\.daily, /);
  });
});
