/**
 * DATA-DELAY-001: an intraday decision reads only observations usable when it
 * is evaluated (close + delay, and receipt where recorded). Changing any bar
 * or quote that was not yet usable must not change a single output, on the
 * symbol itself or on another symbol in the same scan.
 */

import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { DEFAULT_CONFIG, scanIntraday, usableInput, type DailyPlanLevels, type SymbolInput } from "@/lib/scanner/intraday";

// One-minute bars from the 9:30 ET open on Wednesday 2026-10-28 (EDT).
const OPEN = Date.parse("2026-10-28T13:30:00Z");
const bar = (i: number, c: number, o = c): Bar => ({
  t: new Date(OPEN + i * 60_000).toISOString(),
  o,
  h: Math.max(o, c) + 0.05,
  l: Math.min(o, c) - 0.05,
  c,
  v: 200_000,
});

function series(n: number, base: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) bars.push(bar(i, base + Math.sin(i / 4) * 2 + i * 0.05, base + Math.sin((i - 1) / 4) * 2 + (i - 1) * 0.05));
  return bars;
}

const plan: DailyPlanLevels = { direction: "up", entry: 101, stop: 97, tp1: 112, mtp: 120, verdict: "Execute", awaitsCrossing: false };
const DELAY = 15 * 60_000;

function input(symbol: string, bars: Bar[], over: Partial<SymbolInput> = {}): SymbolInput {
  const last = bars[bars.length - 1];
  return {
    symbol,
    kind: "equity",
    bars,
    barIntervalMinutes: 1,
    prevClose: 100,
    quote: { price: last.c, at: new Date(Date.parse(last.t) + 60_000).toISOString() },
    volumeBaseline: null,
    dailyAtr: 3,
    dailyPlan: plan,
    feedDelayMs: DELAY,
    feed: "delayed",
    ...over,
  };
}

/** Bars whose close + delay is after `now` get wild prices; the rest are untouched. */
function scramble(bars: Bar[], now: Date): Bar[] {
  return bars.map((b) => (Date.parse(b.t) + 60_000 + DELAY > now.getTime() ? { ...b, o: 1, h: 999, l: 0.5, c: 500, v: 9e9 } : b));
}

describe("no look-ahead in the intraday scan", () => {
  const now = new Date(OPEN + 90 * 60_000); // 11:00 ET
  const a = series(90, 100);
  const b = series(90, 50);

  it("drops every bar and the quote not usable at evaluation", () => {
    const u = usableInput(input("AAA", a), now);
    const lastClose = Date.parse(u.bars[u.bars.length - 1].t) + 60_000;
    expect(lastClose + DELAY).toBeLessThanOrEqual(now.getTime());
    expect(u.bars.length).toBe(a.length - 15); // bar i is usable at open + i + 16 minutes
    expect(u.quote).toBeNull();
  });

  it("the 9:30-9:45 candle is usable at 10:00, and at 10:00:08 when it arrived then", () => {
    const fifteen: Bar[] = [{ t: new Date(OPEN).toISOString(), o: 1, h: 1, l: 1, c: 1, v: 1 }];
    const at = (iso: string, received?: string) =>
      usableInput({ ...input("AAA", fifteen), barIntervalMinutes: 15, receivedAt: received }, new Date(iso)).bars.length;
    expect(at("2026-10-28T13:59:59Z")).toBe(0);
    expect(at("2026-10-28T14:00:00Z")).toBe(1);
    expect(at("2026-10-28T14:00:05Z", "2026-10-28T14:00:08Z")).toBe(0);
    expect(at("2026-10-28T14:00:08Z", "2026-10-28T14:00:08Z")).toBe(1);
  });

  it("outputs are identical when unusable observations change, on the symbol and across symbols", () => {
    const base = scanIntraday([input("AAA", a), input("BBB", b)], DEFAULT_CONFIG, now);
    const changed = scanIntraday(
      [input("AAA", scramble(a, now), { quote: { price: 777, at: now.toISOString() } }), input("BBB", scramble(b, now))],
      DEFAULT_CONFIG,
      now,
    );
    expect(JSON.stringify(changed)).toBe(JSON.stringify(base));
  });

  it("without the delay filter the same change does move the output (the test can see a leak)", () => {
    const strip = (i: SymbolInput): SymbolInput => ({ ...i, feedDelayMs: undefined });
    const base = scanIntraday([strip(input("AAA", a))], DEFAULT_CONFIG, now);
    const changed = scanIntraday([strip(input("AAA", scramble(a, now)))], DEFAULT_CONFIG, now);
    expect(JSON.stringify(changed)).not.toBe(JSON.stringify(base));
  });

  it("live and replay read the same: the live fetch's later bars change nothing against the replay's cut at the usable bar", () => {
    // The replay hands the scan bars through the last usable one and evaluates
    // at its close + delay (replayIntradayAlerts); the live route hands every
    // bar received and the scan drops the rest (usableInput).
    const usable = a.filter((x) => Date.parse(x.t) + 60_000 + DELAY <= now.getTime());
    const last = usable[usable.length - 1];
    const replay = scanIntraday([input("AAA", usable, { quote: { price: last.c, at: new Date(Date.parse(last.t) + 60_000).toISOString() } })], DEFAULT_CONFIG, now);
    const live = scanIntraday([input("AAA", a, { quote: { price: last.c, at: new Date(Date.parse(last.t) + 60_000).toISOString() } })], DEFAULT_CONFIG, now);
    expect(JSON.stringify(live)).toBe(JSON.stringify(replay));
  });

  it("each alert records the data's time, its availability and the evaluation clock in order", () => {
    const out = scanIntraday([input("AAA", a), input("BBB", b)], DEFAULT_CONFIG, now);
    expect(out.alerts.length + out.heldAlerts.length).toBeGreaterThan(0);
    for (const al of [...out.alerts, ...out.heldAlerts]) {
      const t = al.timeliness!;
      expect(Date.parse(t.dataAsOf) + t.delayMs).toBeLessThanOrEqual(Date.parse(t.usableAt));
      expect(Date.parse(t.usableAt)).toBeLessThanOrEqual(Date.parse(t.evaluatedAt));
      expect(t.actionable).toBe(false);
      expect(t.authorizationId).toBeNull();
    }
  });
});

describe("a fresh quote cannot launder stale bars (dependency freshness)", () => {
  // Real-time feed, one-minute bars. The quote is current; the bars stop early.
  const now = new Date(OPEN + 90 * 60_000);
  const rt = (bars: Bar[], quoteAt: Date) =>
    input("BTCX", bars, { feedDelayMs: 0, feed: "realtime", quote: { price: bars[bars.length - 1].c, at: quoteAt.toISOString() } });

  it("records the bars' own as-of beside the quote's", async () => {
    const { alertTimeliness } = await import("@/lib/scanner/intraday");
    const bars = series(90, 100); // last bar 10:59-11:00, closed at now
    const t = alertTimeliness(rt(bars, now), { dataTimestamp: now.toISOString() }, "old_level_cross", "up", now);
    expect(t.structureAsOf).toBe(now.toISOString());
    expect(t.actionable).toBe(true);
  });

  it("is not actionable when a newer bar was usable that the decision did not read", async () => {
    const { alertTimeliness } = await import("@/lib/scanner/intraday");
    const stale = series(60, 100); // bars end at 10:30 while the quote reads 11:00
    const t = alertTimeliness(rt(stale, now), { dataTimestamp: now.toISOString() }, "old_level_cross", "up", now);
    expect(t.dataAsOf).toBe(now.toISOString());
    expect(t.structureAsOf).toBe(new Date(OPEN + 60 * 60_000).toISOString());
    expect(t.actionable).toBe(false);
    expect(t.authorizationId).toBeNull();
  });

  it("is judged at the fetch clock, so a scan just past a bar boundary does not demote complete bars", async () => {
    const { alertTimeliness } = await import("@/lib/scanner/intraday");
    const bars = series(90, 100); // last bar closes at 11:00
    const later = new Date(now.getTime() + 65_000); // scan runs at 11:01:05
    const fetched = rt(bars, now);
    const t = alertTimeliness({ ...fetched, receivedAt: new Date(now.getTime() + 5_000).toISOString() }, { dataTimestamp: now.toISOString() }, "old_level_cross", "up", later);
    expect(t.actionable).toBe(true);
    // Without a receipt time the scan's own clock is the reference, and the 11:01 bar existed.
    expect(alertTimeliness(fetched, { dataTimestamp: now.toISOString() }, "old_level_cross", "up", later).actionable).toBe(false);
  });
});
