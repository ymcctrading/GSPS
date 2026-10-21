import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { replay, type SessionDailyPlan } from "@/lib/backtest/replay";
import { ALERT_SCAN_MINUTES, asDailyPlanLevels, replayIntradayAlerts } from "@/lib/backtest/replayIntradayAlerts";
import { summariseAlertTrades } from "@/lib/backtest/alertSummary";
import { etParts } from "@/lib/market/session";

/**
 * Structural tests on synthetic bars: the alert replay walks the live scan at
 * its cadence, enters on the next bar's open with the alert's own stop, holds
 * one position at a time, reads only the sessions asked for, and the daily
 * plans it reads are priced from earlier sessions only. None of this says
 * whether the alerts have an edge; that is the run's job.
 */

const day = (i: number) => new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10);

/** Bars of `minutes` from 9:30 ET (13:30Z in June) for `days` days, zig-zagging up. */
function zigzag(days: number, minutes: number, perDay: number, start = 100): Bar[] {
  const out: Bar[] = [];
  let price = start;
  let n = 0;
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < perDay; k++) {
      const leg = Math.floor(n / 12) % 3;
      const pct = leg === 2 ? -0.25 : 0.2;
      const o = price;
      const c = o * (1 + pct / 100);
      const mins = 13 * 60 + 30 + k * minutes;
      const t = `${day(d)}T${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00Z`;
      out.push({ t, o, h: Math.max(o, c) * 1.0005, l: Math.min(o, c) * 0.9995, c, v: 200_000 });
      price = c;
      n++;
    }
  }
  return out;
}

function dailyFor(bars: Bar[], history = 60): Bar[] {
  const before: Bar[] = Array.from({ length: history }, (_, i) => {
    const t = new Date(Date.UTC(2026, 2, 1 + i)).toISOString().slice(0, 10);
    const c = 80 + i * 0.3;
    return { t: `${t}T00:00:00Z`, o: c - 0.4, h: c + 1, l: c - 1.2, c, v: 8_000_000 };
  });
  const byDay = new Map<string, Bar[]>();
  for (const b of bars) byDay.set(b.t.slice(0, 10), [...(byDay.get(b.t.slice(0, 10)) ?? []), b]);
  const own = [...byDay].map(([d, bs]) => ({
    t: `${d}T00:00:00Z`,
    o: bs[0].o,
    h: Math.max(...bs.map((b) => b.h)),
    l: Math.min(...bs.map((b) => b.l)),
    c: bs[bs.length - 1].c,
    v: 8_000_000,
  }));
  return [...before, ...own];
}

const plan = (over: Partial<SessionDailyPlan> = {}): SessionDailyPlan => ({
  direction: "up",
  verdict: "Execute",
  entry: 100,
  stop: 95,
  tp1: 110,
  mtp: 120,
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

describe("replayIntradayAlerts", () => {
  const bars = zigzag(8, 5, 78);
  const dailyBars = dailyFor(bars);
  const plans = new Map<string, SessionDailyPlan | null>();
  const all = replayIntradayAlerts({ symbol: "TEST", kind: "equity", bars, dailyBars, plans });

  it("enters each alert at the next bar's open, after a scan on the live cadence", () => {
    expect(all.length).toBeGreaterThan(0);
    for (const t of all) {
      const i = bars.findIndex((b) => b.t === t.openedAt);
      expect(i).toBeGreaterThan(0);
      expect(t.entry).toBe(bars[i].o);
      const scannedAt = new Date(Date.parse(bars[i - 1].t) + 5 * 60_000);
      expect(etParts(scannedAt).minutes % ALERT_SCAN_MINUTES).toBe(0);
      expect(t.direction === "bullish" ? t.stop < t.entry : t.stop > t.entry).toBe(true);
      expect(Number.isFinite(t.rMultiple)).toBe(true);
    }
  });

  it("holds one position at a time", () => {
    const sorted = [...all].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
    for (let k = 1; k < sorted.length; k++) expect(sorted[k].openedAt > sorted[k - 1].closedAt!).toBe(true);
  });

  it("walks only the sessions and signals asked for", () => {
    const one = replayIntradayAlerts({ symbol: "TEST", kind: "equity", bars, dailyBars, plans, sessions: new Set([day(5)]) });
    expect(one.every((t) => t.session === day(5))).toBe(true);
    // No daily plan stands, so the plan's own alert never fires.
    const held = replayIntradayAlerts({ symbol: "TEST", kind: "equity", bars, dailyBars, plans, signals: new Set(["plan_level_held"]) });
    expect(held).toHaveLength(0);
  });

  it("summarises a cell", () => {
    const s = summariseAlertTrades(all);
    expect(s.n).toBe(all.length);
    expect(s.halves.first.n + s.halves.second.n).toBe(all.length);
    expect(Object.values(s.bySignal).reduce((a, g) => a + g.n, 0)).toBe(all.length);
  });
});

describe("replay sessionPlans", () => {
  it("collects one plan per session from the sessions before it, and trades nothing with plansOnly", () => {
    const bars = zigzag(10, 15, 26);
    const dailyBars = dailyFor(bars, 120);
    const plans = new Map<string, SessionDailyPlan | null>();
    const result = replay("TEST", bars, { targetR: 2, dailyBars, sessionPlans: plans, plansOnly: true });
    expect(result.trades).toHaveLength(0);
    expect(plans.size).toBeGreaterThan(0);
    for (const p of plans.values()) {
      if (!p) continue;
      expect(p.direction === "up" ? p.stop < p.entry : p.stop > p.entry).toBe(true);
    }
    // No look-ahead: cutting the bars after a session leaves its plan unchanged.
    const date = [...plans.keys()][Math.floor(plans.size / 2)];
    const cut = bars.filter((b) => b.t.slice(0, 10) <= date);
    const cutPlans = new Map<string, SessionDailyPlan | null>();
    replay("TEST", cut, { targetR: 2, dailyBars: dailyBars.filter((b) => b.t.slice(0, 10) <= date), sessionPlans: cutPlans, plansOnly: true });
    expect(cutPlans.get(date)).toEqual(plans.get(date));
  });
});
