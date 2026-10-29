import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import type { SessionDailyPlan } from "@/lib/backtest/replay";
import { replayIntradayAlerts } from "@/lib/backtest/replayIntradayAlerts";
import { scoreLineSession, summariseLineNotices, LINE_MOVE_POINTS, type LineSessionRecord } from "@/lib/backtest/lineNotices";
import { crossingLinesFromEntry, pricePoint } from "@/lib/gann/pointScale";
import { etDateKey, etParts } from "@/lib/market/session";

/**
 * The line notices' replay: one record a session the plan's line is ahead,
 * whether a notice fired or not, judged by the close that confirms the
 * crossing, the stop, or neither, over the horizon.
 */

function etInstant(date: string, etMinute: number): string {
  for (const offset of [4, 5]) {
    const t = new Date(Date.parse(`${date}T00:00:00Z`) + (etMinute + offset * 60) * 60_000);
    if (etParts(t).minutes === etMinute && etDateKey(t) === date) return t.toISOString();
  }
  throw new Error("no ET instant");
}

/** A regular session of five-minute bars walking linearly from `open` to `close`. */
function session(date: string, open: number, close: number, wiggle = 0.05): Bar[] {
  const out: Bar[] = [];
  const n = 78;
  for (let i = 0; i < n; i++) {
    const o = open + ((close - open) * i) / n;
    const c = open + ((close - open) * (i + 1)) / n;
    out.push({ t: etInstant(date, 9 * 60 + 30 + i * 5), o, h: Math.max(o, c) + wiggle, l: Math.min(o, c) - wiggle, c, v: 30_000 });
  }
  return out;
}

const DAYS = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];

function priorDaily(): Bar[] {
  const out: Bar[] = [];
  for (let d = 1; d <= 30; d++) {
    const t = new Date(Date.UTC(2026, 8, d));
    if (t.getUTCDay() % 6 === 0) continue;
    out.push({ t: `${t.toISOString().slice(0, 10)}T04:00:00Z`, o: 99, h: 101, l: 97, c: 100, v: 2e6 });
  }
  return out;
}

const plan = (over: Partial<SessionDailyPlan> = {}): SessionDailyPlan => ({
  direction: "up", verdict: "Watch", entry: 101, stop: 95, tp1: 112, mtp: 120, awaitsCrossing: true, ...over,
});

describe("replayIntradayAlerts with collectLineNotices", () => {
  it("records the session the line is ahead, its crossing notice, and the close that confirms it", () => {
    // The day before closes at 100; the session runs to 106, past the confirming close.
    const bars = [...session(DAYS[0], 99.5, 100), ...session(DAYS[1], 100, 106), ...session(DAYS[2], 106, 107)];
    const daily = [...priorDaily(), { t: `${DAYS[0]}T04:00:00Z`, o: 99.5, h: 100.1, l: 99.4, c: 100, v: 2e6 }, { t: `${DAYS[1]}T04:00:00Z`, o: 100, h: 106, l: 100, c: 106, v: 2e6 }, { t: `${DAYS[2]}T04:00:00Z`, o: 106, h: 107, l: 106, c: 107, v: 2e6 }];
    const plans = new Map<string, SessionDailyPlan | null>([[DAYS[1], plan()]]);
    const { lineSessions } = replayIntradayAlerts({ symbol: "TEST", kind: "equity", bars, dailyBars: daily, plans, collectLineNotices: true });
    expect(lineSessions).toHaveLength(1);
    const rec = lineSessions![0];
    expect(rec.session).toBe(DAYS[1]);
    expect(rec.line).toBe(101);
    expect(rec.confirmingClose).toBeCloseTo(crossingLinesFromEntry(101, "bullish").confirmingClose, 6);
    expect(rec.crossed).not.toBeNull();
    expect(rec.outcome?.resolution).toBe("confirmed");
    expect(rec.outcome?.confirmedAfter).toBe(0);
    expect(rec.outcome?.leadMinutes).toBeGreaterThan(0);
  });

  it("records nothing without the flag, and no session whose crossing is made", () => {
    const bars = [...session(DAYS[0], 99.5, 100), ...session(DAYS[1], 100, 106)];
    const daily = [...priorDaily(), { t: `${DAYS[0]}T04:00:00Z`, o: 99.5, h: 100.1, l: 99.4, c: 100, v: 2e6 }];
    const without = replayIntradayAlerts({ symbol: "TEST", kind: "equity", bars, dailyBars: daily, plans: new Map([[DAYS[1], plan()]]) });
    expect(without.lineSessions).toBeUndefined();
    const made = replayIntradayAlerts({ symbol: "TEST", kind: "equity", bars, dailyBars: daily, plans: new Map([[DAYS[1], plan({ awaitsCrossing: false })]]), collectLineNotices: true });
    expect(made.lineSessions).toEqual([]);
  });
});

describe("scoreLineSession", () => {
  const bounds = (bars: Bar[][]) => {
    let from = 0;
    return bars.map((b, i) => {
      const out = { date: DAYS[i], from, to: from + b.length };
      from += b.length;
      return out;
    });
  };
  const rec = { direction: "up" as const, stop: 95, confirmingClose: 104, approach: null, crossed: null };

  it("confirms on a later session's close", () => {
    const days = [session(DAYS[0], 100, 102), session(DAYS[1], 102, 105), session(DAYS[2], 105, 105)];
    const out = scoreLineSession(days.flat(), bounds(days), 0, rec);
    expect(out).toMatchObject({ complete: true, resolution: "confirmed", confirmedAfter: 1 });
  });

  it("calls a stop that trades first stopped, and nothing within the horizon faded", () => {
    const stopped = [session(DAYS[0], 100, 94), session(DAYS[1], 94, 106), session(DAYS[2], 106, 106)];
    const out = scoreLineSession(stopped.flat(), bounds(stopped), 0, rec);
    expect(out?.resolution).toBe("stopped");
    // The rally to 106 after the stop is not the plan's move.
    expect(out!.fromOpen.bestPts).toBeLessThan(1);
    const faded = [session(DAYS[0], 100, 102), session(DAYS[1], 102, 101), session(DAYS[2], 101, 100)];
    expect(scoreLineSession(faded.flat(), bounds(faded), 0, rec)).toMatchObject({ complete: true, resolution: "faded", confirmedAfter: null });
  });

  it("is incomplete when the horizon runs past the bars it has and nothing resolved", () => {
    const days = [session(DAYS[0], 100, 101), session(DAYS[1], 101, 102)];
    expect(scoreLineSession(days.flat(), bounds(days), 0, rec)?.complete).toBe(false);
  });

  it("measures the move after the notice in price points at the notice's price", () => {
    const days = [session(DAYS[0], 100, 110, 0), session(DAYS[1], 110, 110, 0), session(DAYS[2], 110, 110, 0)];
    const flat = days.flat();
    const notice = { at: flat[10].t, barIndex: 10, price: flat[10].c };
    const out = scoreLineSession(flat, bounds(days), 0, { ...rec, crossed: notice })!;
    expect(out.fromNotice!.bestPts).toBeCloseTo((110 - notice.price) / pricePoint(notice.price), 6);
    expect(out.fromOpen.bestPts).toBeCloseTo(10 / pricePoint(100), 6);
  });
});

describe("summariseLineNotices", () => {
  const base: LineSessionRecord = {
    symbol: "T", session: DAYS[0], direction: "up", verdict: "Watch", entry: 101, stop: 95, line: 101, confirmingClose: 104, atEntry: true, prevClose: 100,
    approach: null, crossed: null, outcome: null,
  };
  const out = (resolution: "confirmed" | "stopped" | "faded", best: number, complete = true) => ({
    complete, resolution, confirmedAfter: resolution === "confirmed" ? 0 : null, confirmedAt: null,
    fromOpen: { bestPts: best, worstPts: -1 }, fromNotice: { bestPts: best / 2, worstPts: -1 }, leadMinutes: resolution === "confirmed" ? 60 : null,
  });
  const hit = { at: "2026-10-19T15:00:00Z", barIndex: 5, price: 101 };

  it("reads the notices against the base rate and counts only judged records", () => {
    const s = summariseLineNotices([
      { ...base, crossed: hit, outcome: out("confirmed", LINE_MOVE_POINTS + 2) },
      { ...base, crossed: hit, verdict: "Execute", outcome: out("faded", 1) },
      { ...base, outcome: out("stopped", 0) },
      { ...base, outcome: out("faded", 0, false) },
    ]);
    expect(s.eligible).toMatchObject({ n: 3, confirmed: 1, stopped: 1, faded: 1 });
    expect(s.crossed).toMatchObject({ n: 2, confirmed: 1, confirmedRate: 0.5, medianLeadMinutes: 60 });
    expect(s.crossedExecute.n).toBe(1);
    expect(s.noNotice.n).toBe(1);
    expect(s.moves).toEqual({ n: 1, withNotice: 1, medianPtsLeftAfterNotice: (LINE_MOVE_POINTS + 2) / 2 });
  });
});
