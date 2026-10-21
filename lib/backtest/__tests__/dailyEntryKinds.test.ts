import { describe, expect, it } from "vitest";
import { byEntryKind, replay } from "@/lib/backtest/replay";
import type { Bar } from "@/lib/types";

/** A seeded random walk of weekday daily bars. */
function walk(seed: number, n: number, start: number): Bar[] {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out: Bar[] = [];
  let p = start;
  const d0 = Date.UTC(2019, 0, 2);
  for (let day = 0; out.length < n; day++) {
    const d = new Date(d0 + day * 86_400_000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const o = p;
    const c = Math.max(1, o * (1 + (rnd() - 0.5) * 0.04));
    const h = Math.max(o, c) * (1 + rnd() * 0.01);
    const l = Math.min(o, c) * (1 - rnd() * 0.01);
    out.push({ t: `${d.toISOString().slice(0, 10)}T05:00:00Z`, o, h, l, c, v: 1e6 * (0.5 + rnd()) });
    p = c;
  }
  return out;
}

// 2026-10-21: the six-year 1Day universe run put all 4,479 trades under
// "hold". On daily bars the replay tested each closed bar against the plan
// priced from that same bar, so a crossing or an old level the bar had traded
// into was already spent and left no plan to fill, and a held bottom's entry
// (that bar's own close) was always traded into.
describe("1Day reaction replay", () => {
  const daily = walk(1, 260, 40);
  const run = () =>
    replay("TEST", daily, {
      targetR: 2, dailyBars: daily, usePlanLevels: true, entryRule: "reaction", exitRule: "gann", maxBarsHeld: 10, warmupBars: 60,
    });

  it("fills crossings and old levels, not only held bottoms", () => {
    const kinds = byEntryKind(run());
    expect(kinds.crossing.trades.length).toBeGreaterThan(0);
    expect(kinds.oldLevel.trades.length).toBeGreaterThan(0);
  }, 60_000);

  it("fills a held bottom only after a later session trades back to its close", () => {
    // The entry is the close before the plan's session; the session's bar
    // must trade to it, and the fill is the next session's open.
    const holds = run().trades.filter((t) => !t.derived && t.entryKind === "hold" && t.openedAt);
    expect(holds.length).toBeGreaterThan(0);
    for (const t of holds) {
      const i = daily.findIndex((b) => b.t === t.openedAt);
      expect(i).toBeGreaterThan(1);
      expect(t.entry).toBe(daily[i].o);
      const zone = daily[i - 2].c;
      const closed = daily[i - 1];
      expect(t.direction === "bullish" ? closed.l <= zone : closed.h >= zone).toBe(true);
    }
  }, 60_000);
});

/**
 * The same walk with an occasional deep wick (15% of sessions reach up to 12%
 * beyond the body), so a bar can trade into the buy zone and through the stop
 * and still close above the stop.
 */
function wickWalk(seed: number, n: number, start: number): Bar[] {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out: Bar[] = [];
  let p = start;
  const d0 = Date.UTC(2019, 0, 2);
  for (let day = 0; out.length < n; day++) {
    const d = new Date(d0 + day * 86_400_000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const o = p;
    const c = Math.max(1, o * (1 + (rnd() - 0.5) * 0.04));
    const deep = rnd() < 0.15;
    const h = Math.max(o, c) * (1 + rnd() * 0.01 + (deep ? 0.12 : 0) * rnd());
    const l = Math.min(o, c) * (1 - rnd() * 0.01 - (deep ? 0.12 : 0) * rnd());
    out.push({ t: `${d.toISOString().slice(0, 10)}T05:00:00Z`, o, h, l, c, v: 1e6 * (0.5 + rnd()) });
    p = c;
  }
  return out;
}

// Review of #386: on daily bars the session's closed bar is also the bar a
// reaction entry fires on. When it traded into the zone and through the stop
// the same day, which came first cannot be told, so the plan is not retired
// before the entry. Retiring it dropped exactly the trades stopped out the
// same day (on these seeds, 1 such trade before the fix, 4 after). Review of
// #412: those trades are booked at the reaction entry on the firing bar and
// stopped there, a full loss, never filled at the next open with the stop
// already passed.
describe("1Day reaction replay, a firing bar that also reached the stop", () => {
  it("books the entry and its stop on that bar, a loss of at least 1R", () => {
    let sameDay = 0;
    for (const seed of [40, 54, 67]) {
      const bars = wickWalk(seed, 260, 40);
      const trades = replay("TEST", bars, {
        targetR: 2, dailyBars: bars, usePlanLevels: true, entryRule: "reaction", exitRule: "gann", maxBarsHeld: 10, warmupBars: 60,
      }).trades.filter((t) => !t.derived && t.openedAt);
      for (const t of trades) {
        const at = bars.findIndex((b) => b.t === t.openedAt);
        const fireBar = bars[at - 1];
        // A trade filled at the next open whose firing bar had already reached its stop.
        expect(t.direction === "bullish" ? fireBar.l <= t.stop : fireBar.h >= t.stop).toBe(false);
        if (t.barsHeld === 1 && t.closedAt === t.openedAt && t.ambiguous) {
          const bar = bars[at];
          const long = t.direction === "bullish";
          expect(long ? bar.l <= t.stop : bar.h >= t.stop).toBe(true);
          // Filled no better than the open, on the right side of the stop.
          expect(long ? t.entry > t.stop && t.entry <= bar.o : t.entry < t.stop && t.entry >= bar.o).toBe(true);
          expect(t.exitPrice).toBe(t.stop);
          expect(t.outcome).toBe("loss");
          expect(t.rMultiple).toBeLessThan(0);
          sameDay++;
        }
      }
    }
    expect(sameDay).toBeGreaterThanOrEqual(3);
  }, 120_000);

  // Review of #412: a close through the stop on the firing bar is that day's
  // stop-out, not an entry called off, since live the order filled in the
  // session before the close. The same bar, closed through the stop instead
  // of back above it, still books the trade and its loss.
  it("books the trade when the firing bar also closed through the stop", () => {
    const bars = wickWalk(40, 260, 40);
    const opts = { targetR: 2, dailyBars: bars, usePlanLevels: true, entryRule: "reaction", exitRule: "gann", maxBarsHeld: 10, warmupBars: 60 } as const;
    const sameDay = replay("TEST", bars, opts).trades.find((t) => !t.derived && t.barsHeld === 1 && t.closedAt === t.openedAt && t.ambiguous);
    expect(sameDay).toBeDefined();
    const at = bars.findIndex((b) => b.t === sameDay!.openedAt);
    const long = sameDay!.direction === "bullish";
    const through = bars.map((b, j) => {
      if (j !== at) return b;
      const c = long ? sameDay!.stop - 0.01 : sameDay!.stop + 0.01;
      return { ...b, c, l: Math.min(b.l, c), h: Math.max(b.h, c) };
    });
    const again = replay("TEST", through, { ...opts, dailyBars: through }).trades.find((t) => !t.derived && t.openedAt === sameDay!.openedAt);
    expect(again).toBeDefined();
    expect(again!.exitPrice).toBe(again!.stop);
    expect(again!.outcome).toBe("loss");
  }, 120_000);
});
