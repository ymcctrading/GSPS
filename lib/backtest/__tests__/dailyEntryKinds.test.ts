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
