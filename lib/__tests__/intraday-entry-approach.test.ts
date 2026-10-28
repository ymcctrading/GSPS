import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { DEFAULT_CONFIG, scanIntraday, type DailyPlanLevels, type SymbolInput } from "@/lib/scanner/intraday";
import { buildIntradayCardModel } from "@/lib/setups/intraday";

// 10:00 ET on 2026-10-27 (EDT): one-minute bars from the open.
const OPEN = Date.parse("2026-10-27T13:30:00Z");
const bar = (i: number, c: number, o = c): Bar => ({
  t: new Date(OPEN + i * 60_000).toISOString(),
  o,
  h: Math.max(o, c) + 0.05,
  l: Math.min(o, c) - 0.05,
  c,
  v: 200_000,
});

/** Up from 502 to 506 over 30 bars, then back down 0.1 a bar for `down` bars. */
function reaction(down = 20): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i <= 30; i++) bars.push(bar(i, 502 + (i * 4) / 30));
  for (let i = 1; i <= down; i++) bars.push(bar(30 + i, 506 - i * 0.1, 506 - (i - 1) * 0.1));
  return bars;
}

function input(bars: Bar[], plan: DailyPlanLevels | null, overrides: Partial<SymbolInput> = {}): SymbolInput {
  const last = bars[bars.length - 1];
  return {
    symbol: "LLY",
    kind: "equity",
    bars,
    barIntervalMinutes: 1,
    prevClose: 502,
    quote: { price: last.c, at: last.t },
    volumeBaseline: null,
    dailyAtr: 6,
    dailyPlan: plan,
    ...overrides,
  };
}
const nowAfter = (bars: Bar[], minutes = 1) => new Date(Date.parse(bars[bars.length - 1].t) + minutes * 60_000);

const plan: DailyPlanLevels = { direction: "up", entry: 501, stop: 497, tp1: 512, mtp: 520, verdict: "Execute", awaitsCrossing: false };

describe("scanIntraday: nearing the plan's entry", () => {
  it("tells how soon price reaches a daily plan's entry at its pace, with the plan's own levels", () => {
    const bars = reaction();
    const out = scanIntraday([input(bars, plan)], DEFAULT_CONFIG, nowAfter(bars));
    const a = out.alerts.find((x) => x.type === "entry_approach")!;
    expect(a).toBeDefined();
    expect(a.direction).toBe("up");
    // 504 to 501 at about 0.1 a bar is about 30 bars; one minute of feed age off.
    expect(a.approach!.etaMinutes).toBeGreaterThan(25);
    expect(a.approach!.etaMinutes).toBeLessThan(35);
    expect(a.continuationPlan.entry).toBe(501);
    expect(a.invalidation).toBe(497);
    expect(a.continuationPlan.firstTarget).toBe(512);
    expect(a.continuationPlan.masterTarget).toBe(520);
    // The card shows the plan's entry, not the price it was flagged at.
    expect(buildIntradayCardModel(a).levels.entry).toBe(501);
    // No feed recorded on an equity reads as delayed: an estimate, never an arrival.
    expect(a.whyThisAppeared).toContain("an estimate from delayed observations, not a live arrival time");
    expect(a.whyThisAppeared).not.toContain("minutes away");
    const live = scanIntraday([input(bars, plan, { feed: "realtime" })], DEFAULT_CONFIG, nowAfter(bars)).alerts.find(
      (x) => x.type === "entry_approach",
    )!;
    expect(live.whyThisAppeared).toContain("minutes away");
  });

  it("is never held back by the cooldown: each scan carries a new time left", () => {
    const bars = reaction();
    const lastAlerts = [{ type: "entry_approach" as const, direction: "up" as const, at: bars[bars.length - 3].t }];
    const out = scanIntraday([input(bars, plan, { lastAlerts })], DEFAULT_CONFIG, nowAfter(bars));
    expect(out.alerts.some((x) => x.type === "entry_approach")).toBe(true);
  });

  it("says price is at the entry once the latest bar trades to it", () => {
    const bars = [...reaction(), bar(51, 501.02, 503.9)];
    const out = scanIntraday([input(bars, plan)], DEFAULT_CONFIG, nowAfter(bars));
    expect(out.alerts.find((x) => x.type === "entry_reached")).toBeDefined();
    expect(out.alerts.find((x) => x.type === "entry_approach")).toBeUndefined();
  });

  it("stays quiet when the entry is too far off at the current pace", () => {
    const bars = reaction();
    const out = scanIntraday([input(bars, { ...plan, entry: 490, stop: 485 })], DEFAULT_CONFIG, nowAfter(bars));
    expect(out.alerts.find((x) => x.type === "entry_approach")).toBeUndefined();
  });

  it("stays quiet on a crossing still to be made, a prior close under the entry, a broken stop or no plan", () => {
    const bars = reaction();
    const types = (p: DailyPlanLevels | null, o: Partial<SymbolInput> = {}) =>
      scanIntraday([input(bars, p, o)], DEFAULT_CONFIG, nowAfter(bars)).alerts.map((x) => x.type);
    expect(types({ ...plan, awaitsCrossing: true })).not.toContain("entry_approach");
    expect(types(plan, { prevClose: 500 })).not.toContain("entry_approach");
    expect(types({ ...plan, stop: 502.5 })).not.toContain("entry_approach");
    expect(types(null)).not.toContain("entry_approach");
  });

  it("stays quiet once price has traded to the entry earlier and moved off (the turn is read elsewhere)", () => {
    const bars = [...reaction(), bar(51, 501.02, 503.9), bar(52, 502.5, 501.02), bar(53, 502.2, 502.5)];
    const out = scanIntraday([input(bars, plan)], DEFAULT_CONFIG, nowAfter(bars));
    expect(out.alerts.find((x) => x.type === "entry_approach" || x.type === "entry_reached")).toBeUndefined();
    expect(out.audit[0].checks.find((c) => c.name === "Nearing the plan's entry")?.detail).toContain("earlier this session");
  });

  it("times a stock only in the regular session, and only an arrival before the close", () => {
    // After the close: the same bars, read at 4:06 PM ET.
    const bars = reaction();
    const after = new Date("2026-10-27T20:06:00Z");
    const fresh = { quote: { price: bars[bars.length - 1].c, at: "2026-10-27T20:05:00Z" } };
    const closed = scanIntraday([input(bars, plan, fresh)], DEFAULT_CONFIG, after);
    expect(closed.alerts.some((x) => x.type === "entry_approach")).toBe(false);
    expect(closed.audit[0].checks.find((c) => c.name === "Nearing the plan's entry")?.detail).toContain("Outside the regular session");
    // Near the close: the same reaction ending at 3:50 PM ET, about 30 minutes off.
    const late = reaction().map((b, i) => ({ ...b, t: new Date(Date.parse("2026-10-27T19:00:00Z") + i * 60_000).toISOString() }));
    const out = scanIntraday([input(late, plan)], DEFAULT_CONFIG, nowAfter(late));
    expect(out.alerts.some((x) => x.type === "entry_approach")).toBe(false);
    expect(out.audit[0].checks.find((c) => c.name === "Nearing the plan's entry")?.detail).toContain("before the close");
  });

  it("mirrors for a short: a rally toward an entry above price", () => {
    const mirror = (b: Bar): Bar => ({ ...b, o: 1000 - b.o, h: 1000 - b.l, l: 1000 - b.h, c: 1000 - b.c });
    const bars = reaction().map(mirror);
    const short: DailyPlanLevels = { direction: "down", entry: 499, stop: 503, tp1: 488, mtp: 480, verdict: "Execute", awaitsCrossing: false };
    const out = scanIntraday([input(bars, short, { prevClose: 498 })], DEFAULT_CONFIG, nowAfter(bars));
    const a = out.alerts.find((x) => x.type === "entry_approach")!;
    expect(a).toBeDefined();
    expect(a.direction).toBe("down");
    expect(a.approach!.etaMinutes).toBeGreaterThan(25);
    expect(a.approach!.etaMinutes).toBeLessThan(35);
  });
});
