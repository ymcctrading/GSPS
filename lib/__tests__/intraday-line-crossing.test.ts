import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { DEFAULT_CONFIG, scanIntraday, type DailyPlanLevels, type SymbolInput } from "@/lib/scanner/intraday";
import { NOTICE_SIGNALS, tradeHold } from "@/lib/scanner/intradayDisplay";
import { crossingLinesFromEntry } from "@/lib/gann/pointScale";
import { buildIntradayBellRow } from "@/lib/notifications/intradayBell";
import { buildIntradayCardModel } from "@/lib/setups/intraday";

// TXN's shape on 2026-10-27: closed 298.02 the session before, the night's
// plan buying beyond 301.86 with its stop at 289.18. One-minute bars from the open.
const OPEN = Date.parse("2026-10-27T13:30:00Z");
const bar = (i: number, c: number, o = c): Bar => ({
  t: new Date(OPEN + i * 60_000).toISOString(),
  o,
  h: Math.max(o, c) + 0.05,
  l: Math.min(o, c) - 0.05,
  c,
  v: 200_000,
});

const plan: DailyPlanLevels = { direction: "up", entry: 301.86, stop: 289.18, tp1: 314.84, mtp: 329.5, verdict: "Watch", awaitsCrossing: true };

/** A dip to 298 then a rise of 0.05 a bar from it. */
function rising(bars = 30, from = 299): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i <= 5; i++) out.push(bar(i, 299.5 - i * 0.3));
  for (let i = 1; i <= bars; i++) out.push(bar(5 + i, from - 0.5 + i * 0.05));
  return out;
}

function input(bars: Bar[], p: DailyPlanLevels | null, overrides: Partial<SymbolInput> = {}): SymbolInput {
  const last = bars[bars.length - 1];
  return {
    symbol: "TXN",
    kind: "equity",
    bars,
    barIntervalMinutes: 1,
    prevClose: 298.02,
    quote: { price: last.c, at: last.t },
    volumeBaseline: null,
    dailyAtr: 9.8,
    dailyPlan: p,
    ...overrides,
  };
}
const nowAfter = (bars: Bar[], minutes = 1) => new Date(Date.parse(bars[bars.length - 1].t) + minutes * 60_000);
const types = (bars: Bar[], p: DailyPlanLevels | null, o: Partial<SymbolInput> = {}) =>
  scanIntraday([input(bars, p, o)], DEFAULT_CONFIG, nowAfter(bars)).alerts.map((x) => x.type);

describe("crossingLinesFromEntry", () => {
  it("recovers the old level 1 point under the entry and the close 3 points past it", () => {
    const { level, confirmingClose } = crossingLinesFromEntry(301.86, "bullish");
    expect(level).toBeCloseTo(298.69, 0);
    expect(confirmingClose - level).toBeCloseTo(3 * (301.86 - level), 6);
    // TXN closed 308.96 on 2026-10-27, past the line, and read Execute that night.
    expect(confirmingClose).toBeLessThan(308.96);
    const short = crossingLinesFromEntry(50, "bearish");
    expect(short.level).toBeGreaterThan(50);
    expect(short.confirmingClose).toBeLessThan(50);
  });
});

describe("scanIntraday: the plan's line ahead", () => {
  it("says when price traded through the line, names the confirming close, and offers no trade", () => {
    const bars = [...rising(), bar(37, 302.4, 300.5)];
    const out = scanIntraday([input(bars, plan)], DEFAULT_CONFIG, nowAfter(bars));
    const a = out.alerts.find((x) => x.type === "line_crossed")!;
    expect(a).toBeDefined();
    expect(NOTICE_SIGNALS.has(a.type)).toBe(true);
    expect(a.continuationPlan.entry).toBe(301.86);
    expect(a.invalidation).toBe(289.18);
    const { confirmingClose } = crossingLinesFromEntry(301.86, "bullish");
    expect(a.continuationPlan.confirmation).toContain(confirmingClose.toFixed(2));
    expect(a.whyThisAppeared).toContain("not a buy");
    expect(a.whyThisAppeared).toContain("(delayed)");
    expect(tradeHold(a)).toBeNull();
    expect(buildIntradayCardModel(a).levels.entry).toBe(301.86);
    // Not the reaction notices: the prior close is under the entry.
    expect(out.alerts.some((x) => x.type === "entry_reached" || x.type === "entry_approach")).toBe(false);
  });

  it("gives a heads-up while price climbs toward the line at a pace that reaches it soon", () => {
    const bars = rising(40, 299.6);
    const a = scanIntraday([input(bars, plan)], DEFAULT_CONFIG, nowAfter(bars)).alerts.find((x) => x.type === "line_approach")!;
    expect(a).toBeDefined();
    expect(a.approach!.entry).toBe(301.86);
    expect(a.approach!.etaMinutes).toBeGreaterThan(0);
    expect(a.approach!.etaMinutes).toBeLessThan(75);
    expect(a.whyThisAppeared).toContain("not a live arrival time");
  });

  it("stays quiet on a reaction plan, a broken stop, no plan, a line too far off, or outside the session", () => {
    const crossed = [...rising(), bar(37, 302.4, 300.5)];
    expect(types(crossed, plan, { prevClose: 303 })).not.toContain("line_crossed");
    expect(types(crossed, { ...plan, stop: 299 })).not.toContain("line_crossed");
    expect(types(crossed, null)).not.toContain("line_crossed");
    expect(types(rising(30), { ...plan, entry: 330, stop: 280 })).not.toContain("line_approach");
    const after = new Date("2026-10-27T20:06:00Z");
    const closed = scanIntraday([input(crossed, plan, { quote: { price: 302.4, at: "2026-10-27T20:05:00Z" } })], DEFAULT_CONFIG, after);
    expect(closed.alerts.some((x) => x.type === "line_crossed")).toBe(false);
  });

  it("stays quiet on a plan that has made its crossing, and reads the confirming close once the entry is crossed", () => {
    const crossed = [...rising(), bar(37, 302.4, 300.5)];
    expect(types(crossed, { ...plan, awaitsCrossing: false })).not.toContain("line_crossed");
    // Older rows say nothing: read from the prior close alone.
    expect(types(crossed, { ...plan, awaitsCrossing: null })).toContain("line_crossed");
    // Closed 304 the session before (past the entry, short of the confirming
    // close): the line is the confirming close, not the entry.
    const { confirmingClose } = crossingLinesFromEntry(301.86, "bullish");
    const band: Bar[] = [];
    for (let i = 0; i <= 30; i++) band.push(bar(i, 304 + i * 0.1));
    expect(types(band, plan, { prevClose: 304 })).not.toContain("line_crossed");
    band.push(bar(31, confirmingClose + 0.5, 307));
    const a = scanIntraday([input(band, plan, { prevClose: 304 })], DEFAULT_CONFIG, nowAfter(band)).alerts.find((x) => x.type === "line_crossed")!;
    expect(a).toBeDefined();
    expect(a.whyThisAppeared).toContain(confirmingClose.toFixed(2));
    expect(a.whyThisAppeared).toContain("In that data the last price");
  });

  it("mirrors for a sell: traded below a line under the prior close", () => {
    const sell: DailyPlanLevels = { direction: "down", entry: 95, stop: 104, tp1: 88, mtp: 82, verdict: "Watch", awaitsCrossing: true };
    const bars: Bar[] = [];
    for (let i = 0; i <= 30; i++) bars.push(bar(i, 97 - i * 0.08));
    const out = scanIntraday([input(bars, sell, { symbol: "XYZ", prevClose: 97.5, dailyAtr: 3 })], DEFAULT_CONFIG, nowAfter(bars));
    const a = out.alerts.find((x) => x.type === "line_crossed")!;
    expect(a).toBeDefined();
    expect(a.direction).toBe("down");
  });

  it("writes the bell without claiming price is there now on delayed data", () => {
    const bars = [...rising(), bar(37, 302.4, 300.5)];
    const a = scanIntraday([input(bars, plan)], DEFAULT_CONFIG, nowAfter(bars)).alerts.find((x) => x.type === "line_crossed")!;
    const row = buildIntradayBellRow(a, {
      disposition: "informational",
      reason: "delayed_observation",
      dataAsOf: a.dataTimestamp,
      checkedAt: nowAfter(bars).toISOString(),
    });
    expect(row.title).toBe("TXN buy: Through the plan's line");
    expect(row.body).toContain("Not a buy yet");
    expect(row.body).toContain("Based on data through");
    expect(row.body).toContain("had traded above its daily plan's line at 301.86");
    expect(row.body).toContain("has not been verified");
    expect(row.body).not.toMatch(/\bnow\b/i);
    expect(row.body).not.toMatch(/\bis \d|\bis (above|below)/);
  });

  it("writes a realtime notice that has aged as of its data, with no arrival time", () => {
    const bars = rising(40, 299.6);
    const crypto = input(bars, plan, { symbol: "BTC/USD", kind: "crypto", feed: "realtime", feedDelayMs: 0 });
    const a = scanIntraday([crypto], DEFAULT_CONFIG, nowAfter(bars)).alerts.find((x) => x.type === "line_approach")!;
    expect(a).toBeDefined();
    // The scan's own sentence, read live, gives an arrival time.
    expect(a.whyThisAppeared).toMatch(/minutes? away, around/);
    const aged = buildIntradayBellRow(a, {
      disposition: "informational",
      reason: "authorization_expired",
      dataAsOf: a.dataTimestamp,
      checkedAt: new Date(nowAfter(bars).getTime() + 3 * 60_000).toISOString(),
    });
    expect(aged.body).toContain("Based on data through");
    expect(aged.body).toContain("was at");
    expect(aged.body).toContain("That reading has aged");
    expect(aged.body).not.toMatch(/away|around \d|\bnow\b|\bis \d/);
    // Actionable, the scan's own sentence stands.
    const live = buildIntradayBellRow(a, { disposition: "actionable", reason: "current_authorization", dataAsOf: a.dataTimestamp, checkedAt: nowAfter(bars).toISOString(), authorizationId: "a" });
    expect(live.body).toContain(a.whyThisAppeared);
  });
});
