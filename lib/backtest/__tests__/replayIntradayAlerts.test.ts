import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { replay, type SessionDailyPlan } from "@/lib/backtest/replay";
import {
  ALERT_FEED_DELAY_BARS,
  ALERT_SCAN_MINUTES,
  asDailyPlanLevels,
  replayIntradayAlerts,
  type AlertTrade,
} from "@/lib/backtest/replayIntradayAlerts";
import { summariseAlertTrades } from "@/lib/backtest/alertSummary";
import { etDateKey, etParts } from "@/lib/market/session";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { DEFAULT_COST_PER_SHARE_USD } from "@/lib/trade/friction";
import { volumeBaseline } from "@/lib/scanner/intraday";

/**
 * The alert replay on seeded random walks that arm real daily plans: it walks
 * the live scan at its cadence, fills after the feed delay inside the session,
 * holds one position at a time across sessions, reads the regular session
 * only (pre-market bars are in the fixture), never enters a warning, and the
 * daily plans it reads are priced from earlier sessions only. None of this
 * says whether the alerts have an edge; that is the run's job.
 */

const rng = (seed: number) => {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
};

function weekdays(from: number, n: number): string[] {
  const out: string[] = [];
  for (let d = 0; out.length < n; d++) {
    const x = new Date(from + d * 86_400_000);
    if (x.getUTCDay() % 6 !== 0) out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

/** The UTC instant of an ET wall-clock minute on a date (EDT or EST). */
function etInstant(date: string, etMinute: number): string {
  for (const offset of [4, 5]) {
    const t = new Date(Date.parse(`${date}T00:00:00Z`) + (etMinute + offset * 60) * 60_000);
    if (etParts(t).minutes === etMinute && etDateKey(t) === date) return t.toISOString();
  }
  throw new Error("no ET instant");
}

interface Fixture {
  daily: Bar[];
  m5: Bar[];
  m15: Bar[];
}

/**
 * A seeded walk: 200 daily sessions, then 40 sessions with five-minute bars
 * from 8:00 ET (pre-market from 8:00 to 9:30) to 16:00, spanning the end of
 * daylight time (2025-11-02), rolled up to fifteen-minute and daily bars.
 */
function fixture(seed: number): Fixture {
  const r = rng(seed);
  const days = weekdays(Date.UTC(2025, 0, 2), 240);
  const daily: Bar[] = [];
  const m5: Bar[] = [];
  const m15: Bar[] = [];
  let p = 50;
  days.forEach((d, i) => {
    const o = p;
    if (i < 200) {
      const c = Math.max(1, o * (1 + (r() - 0.5) * 0.04));
      daily.push({ t: `${d}T00:00:00Z`, o, h: Math.max(o, c) * (1 + r() * 0.01), l: Math.min(o, c) * (1 - r() * 0.01), c, v: 2e6 });
      p = c;
      return;
    }
    let c = o;
    let h = o;
    let l = o;
    let v = 0;
    let quarter: Bar | null = null;
    for (let m = 8 * 60; m < 16 * 60; m += 5) {
      const regular = m >= 9 * 60 + 30;
      const bo = c;
      const bc = Math.max(1, bo * (1 + (r() - 0.5) * (regular ? 0.006 : 0.001)));
      const bar = {
        t: etInstant(d, m),
        o: bo,
        h: Math.max(bo, bc) * (1 + r() * 0.0015),
        l: Math.min(bo, bc) * (1 - r() * 0.0015),
        c: bc,
        v: regular ? 20_000 + r() * 30_000 : 2_000,
      };
      m5.push(bar);
      c = bc;
      if (!regular) continue;
      h = Math.max(h, bar.h);
      l = Math.min(l, bar.l);
      v += bar.v;
      if ((m - (9 * 60 + 30)) % 15 === 0) {
        quarter = { ...bar };
        m15.push(quarter);
      } else if (quarter) {
        quarter.h = Math.max(quarter.h, bar.h);
        quarter.l = Math.min(quarter.l, bar.l);
        quarter.c = bar.c;
        quarter.v += bar.v;
      }
    }
    daily.push({ t: `${d}T00:00:00Z`, o, h, l, c, v });
    p = c;
  });
  return { daily, m5, m15 };
}

function plansFor(f: Fixture): Map<string, SessionDailyPlan | null> {
  const plans = new Map<string, SessionDailyPlan | null>();
  replay("TEST", f.m15, { targetR: 2, dailyBars: f.daily, sessionPlans: plans, plansOnly: true });
  return plans;
}

const plan = (over: Partial<SessionDailyPlan> = {}): SessionDailyPlan => ({
  direction: "up",
  verdict: "Execute",
  entry: 100,
  stop: 95,
  tp1: 110,
  mtp: 120,
  awaitsCrossing: false,
  ...over,
});

describe("asDailyPlanLevels", () => {
  it("hands the scan only an Execute or Watch plan with its stop on the right side", () => {
    expect(asDailyPlanLevels(plan())).toMatchObject({ direction: "up", verdict: "Execute", entry: 100, stop: 95, tp1: 110, mtp: 120 });
    expect(asDailyPlanLevels(plan({ verdict: "Watch" }))?.verdict).toBe("Watch");
    expect(asDailyPlanLevels(plan({ verdict: "Reject" }))).toBeNull();
    expect(asDailyPlanLevels(plan({ stop: 101 }))).toBeNull();
    expect(asDailyPlanLevels(plan({ direction: "down", stop: 95 }))).toBeNull();
    expect(asDailyPlanLevels(null)).toBeNull();
  });
});

describe("replay sessionPlans", () => {
  const f = fixture(1);
  const plans = plansFor(f);
  const priced = [...plans.entries()].filter((e): e is [string, SessionDailyPlan] => e[1] !== null);

  it("collects real plans, their stops on the right side, and trades nothing with plansOnly", () => {
    expect(priced.filter(([, p]) => p.verdict === "Execute" || p.verdict === "Watch").length).toBeGreaterThan(10);
    for (const [, p] of priced) {
      expect(p.direction === "up" ? p.stop < p.entry : p.stop > p.entry).toBe(true);
      expect(["crossing", "oldLevel", "hold"]).toContain(p.entryKind);
    }
  }, 60_000);

  it("prices a session's plan from the sessions before it only", () => {
    // Change every bar from the session on: its plan must not move, and later
    // plans must (so the change reaches what the replay reads at all).
    const date = priced[Math.floor(priced.length / 2)][0];
    const shift = (b: Bar): Bar => ({ ...b, o: b.o * 1.3, h: b.h * 1.3, l: b.l * 1.3, c: b.c * 1.3 });
    const changed: Fixture = {
      ...f,
      daily: f.daily.map((b) => (b.t.slice(0, 10) >= date ? shift(b) : b)),
      m15: f.m15.map((b) => (etDateKey(new Date(b.t)) >= date ? shift(b) : b)),
    };
    const after = plansFor(changed);
    expect(after.get(date)).toEqual(plans.get(date));
    const later = priced.filter(([d]) => d > date);
    expect(later.some(([d, p]) => JSON.stringify(after.get(d)) !== JSON.stringify(p))).toBe(true);
  }, 60_000);
});

describe("replayIntradayAlerts", () => {
  const runs = [1, 2, 3].map((seed) => {
    const f = fixture(seed);
    const plans = plansFor(f);
    return { f, plans, result: replayIntradayAlerts({ symbol: "TEST", kind: "equity", bars: f.m5, dailyBars: f.daily, plans }) };
  });
  const all = runs.flatMap((r) => r.result.trades);
  const regular = (bars: Bar[]) => bars.filter((b) => {
    const m = etParts(new Date(b.t)).minutes;
    return m >= 9 * 60 + 30 && m < 16 * 60;
  });

  it("enters several alerts, in daylight and in standard time", () => {
    expect(all.length).toBeGreaterThan(10);
    expect(all.some((t) => t.session < "2025-11-03")).toBe(true);
    expect(all.some((t) => t.session >= "2025-11-03")).toBe(true);
  });

  it("fills the open the feed delay after a scan on the live cadence, in the regular session", () => {
    for (const { f, result } of runs) {
      const bars = regular(f.m5);
      for (const t of result.trades) {
        const i = bars.findIndex((b) => b.t === t.openedAt);
        expect(i).toBeGreaterThan(ALERT_FEED_DELAY_BARS);
        expect(t.entry).toBe(bars[i].o);
        const scanned = bars[i - 1 - ALERT_FEED_DELAY_BARS];
        const scannedAt = new Date(Date.parse(scanned.t) + 5 * 60_000);
        expect(etParts(scannedAt).minutes % ALERT_SCAN_MINUTES).toBe(0);
        // Same session, and the stop did not trade between the scan and the fill.
        expect(etDateKey(new Date(scanned.t))).toBe(t.session);
        for (let j = i - ALERT_FEED_DELAY_BARS; j < i; j++) {
          expect(t.direction === "bullish" ? bars[j].l > t.stop : bars[j].h < t.stop).toBe(true);
        }
        expect(t.direction === "bullish" ? t.stop < t.entry : t.stop > t.entry).toBe(true);
      }
    }
  });

  it("measures R from the fill to the alert's stop, after costs", () => {
    for (const t of all) {
      const dir = t.direction === "bullish" ? 1 : -1;
      const expected = (dir * (t.exitPrice! - t.entry) - DEFAULT_COST_PER_SHARE_USD) / Math.abs(t.entry - t.stop);
      expect(t.rMultiple).toBeCloseTo(expected, 9);
    }
  });

  it("holds one position at a time, across sessions", () => {
    for (const { result } of runs) {
      const sorted = [...result.trades].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
      for (let k = 1; k < sorted.length; k++) expect(sorted[k].openedAt > sorted[k - 1].closedAt!).toBe(true);
    }
    expect(all.some((t) => t.closedAt && etDateKey(new Date(t.closedAt)) !== t.session)).toBe(true);
  });

  it("never enters a warning to stand aside", () => {
    expect(all.some((t) => t.signal === "reversal_risk")).toBe(false);
    const { f, plans } = runs[0];
    const days = new Set(runs[0].result.trades.slice(0, 3).map((t) => t.session));
    const only = replayIntradayAlerts({ symbol: "TEST", kind: "equity", bars: f.m5, dailyBars: f.daily, plans, sessions: days, signals: new Set(["reversal_risk"]) });
    expect(only.trades).toHaveLength(0);
  }, 60_000);

  it("walks only the sessions and signals asked for, and counts refusals", () => {
    const { f, plans } = runs[0];
    const day = all.find((t) => t.symbol === "TEST")!.session;
    const one = replayIntradayAlerts({ symbol: "TEST", kind: "equity", bars: f.m5, dailyBars: f.daily, plans, sessions: new Set([day]) });
    expect(one.trades.every((t: AlertTrade) => t.session === day)).toBe(true);
    const none = replayIntradayAlerts({ symbol: "TEST", kind: "equity", bars: f.m5, dailyBars: f.daily, plans: new Map(), sessions: new Set([day]), signals: new Set(["plan_level_held"]) });
    expect(none.trades).toHaveLength(0);
    const refusals = runs.reduce((n, r) => n + Object.values(r.result.refused).reduce((a, b) => a + (b ?? 0), 0), 0);
    expect(refusals).toBeGreaterThan(0);
  }, 60_000);

  it("takes no alert the live panel offers no trade on: no first target, or one that doesn't pay the risk (M-K5)", () => {
    for (const t of all) expect(Number.isFinite(t.target)).toBe(true);
    const unpaid = runs.reduce((n, r) => n + (r.result.refused.target_unpaid ?? 0), 0);
    expect(unpaid).toBeGreaterThan(0);
  });

  it("summarises a cell", () => {
    const s = summariseAlertTrades(all);
    expect(s.n).toBe(all.length);
    expect(s.halves.first.n + s.halves.second.n).toBe(all.length);
    expect(Object.values(s.bySignal).reduce((a, g) => a + g.n, 0)).toBe(all.length);
    expect(Object.keys(s.bySignal).length).toBeGreaterThan(1);
    const rs = all.map((t) => t.rMultiple).sort((a, b) => a - b);
    const mid = rs.length / 2;
    expect(s.medianR).toBeCloseTo(rs.length % 2 ? rs[Math.floor(mid)] : (rs[mid - 1] + rs[mid]) / 2, 9);
    expect(summariseAlertTrades([]).expectancyR).toBeNull();
  });
});

describe("plan_level_held, replayed", () => {
  // A session that dips to the daily plan's entry, holds, and turns back up
  // through it: the alert fires, and its stop is 3 Gann points under the day's
  // low, never past the plan's own stop (NSTD p.20, Rule 3(b) p.46).
  const date = "2025-12-03";
  const prior = weekdays(Date.UTC(2025, 6, 1), 120).filter((d) => d < date);
  const dailyBars: Bar[] = prior.map((d, i) => {
    const c = 101 + Math.sin(i / 4) * 2;
    return { t: `${d}T00:00:00Z`, o: c - 0.3, h: c + 1, l: c - 1, c, v: 3e6 };
  });
  const path = [
    101.6, 101.4, 101.2, 101.0, 100.8, 100.6, 100.4, 100.25, 100.15, 100.3, 100.5, 100.7, 100.9, 101.1, 101.3, 101.5,
    101.7, 101.9, 102.1, 102.3, 102.5, 102.6, 102.8, 103.0, 103.2, 103.3, 103.5, 103.6, 103.8, 104.0,
  ];
  const sessions = weekdays(Date.parse(`${date}T00:00:00Z`) - 14 * 86_400_000, 11).filter((d) => d <= date);
  const bars: Bar[] = [];
  for (const d of sessions) {
    for (let k = 0; k < 78; k++) {
      const c = d === date ? path[Math.min(k, path.length - 1)] + (k >= path.length ? (k - path.length) * 0.01 : 0) : 101 + Math.sin(k / 6) * 0.4;
      const o = bars.length > 0 && etDateKey(new Date(bars[bars.length - 1].t)) === d ? bars[bars.length - 1].c : c;
      bars.push({ t: etInstant(d, 9 * 60 + 30 + k * 5), o, h: Math.max(o, c) + 0.05, l: Math.min(o, c) - 0.05, c, v: 40_000 });
    }
  }
  const plans = new Map<string, SessionDailyPlan | null>([[date, plan({ entry: 100.2, stop: 97, tp1: 108, mtp: 115 })]]);
  const { trades } = replayIntradayAlerts({
    symbol: "TEST", kind: "equity", bars, dailyBars, plans, sessions: new Set([date]), signals: new Set(["plan_level_held"]), feedDelayBars: 0,
  });

  it("enters the alert with the day's stop, inside the plan's", () => {
    expect(trades.length).toBeGreaterThan(0);
    const t = trades[0];
    expect(t.signal).toBe("plan_level_held");
    expect(t.planVerdict).toBe("Execute");
    const sessionLow = Math.min(...bars.filter((b) => etDateKey(new Date(b.t)) === date && b.t < t.openedAt).map((b) => b.l));
    expect(t.stop).toBeCloseTo(Math.max(97, sessionLow - gannThreePoints(sessionLow)), 9);
  });

  it("records how the daily plan was armed, and the summary splits on it", () => {
    const held = new Map<string, SessionDailyPlan | null>([[date, plan({ entry: 100.2, stop: 97, tp1: 108, mtp: 115, entryKind: "oldLevel" })]]);
    const run = replayIntradayAlerts({
      symbol: "TEST", kind: "equity", bars, dailyBars, plans: held, sessions: new Set([date]), signals: new Set(["plan_level_held"]), feedDelayBars: 0,
    });
    expect(run.trades.length).toBeGreaterThan(0);
    expect(run.trades.every((x) => x.entryKind === "oldLevel")).toBe(true);
    const s = summariseAlertTrades(run.trades);
    expect(s.byPlanEntryKind.oldLevel.n).toBe(run.trades.length);
    // A plan with no recorded kind reads "unknown", never a guessed kind.
    expect(Object.keys(summariseAlertTrades(trades).byPlanEntryKind)).toEqual(["unknown"]);
    // Other signals stay out of the split, even with a kind recorded.
    const other = { ...run.trades[0], signal: "trend_continuation" as const };
    expect(summariseAlertTrades([...run.trades, other]).byPlanEntryKind.oldLevel.n).toBe(run.trades.length);
  });
});

describe("volumeBaseline, regular session only", () => {
  it("leaves pre-market prints out of an equity's baseline, as the numerator does", () => {
    const days = ["2025-12-01", "2025-12-02"];
    const bars: Bar[] = days.flatMap((d) => [
      { t: etInstant(d, 8 * 60), o: 1, h: 1, l: 1, c: 1, v: 5_000 },
      { t: etInstant(d, 9 * 60 + 30), o: 1, h: 1, l: 1, c: 1, v: 1_000 },
    ]);
    expect(volumeBaseline(bars, 10 * 60, "2025-12-03")).toBe(6_000);
    expect(volumeBaseline(bars, 10 * 60, "2025-12-03", 2, true)).toBe(1_000);
  });
});
