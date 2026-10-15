/**
 * Gann's crossing rule as an entry (W006 pp.20, 46-47; PLAN.md item 4): an old
 * top L is crossed when a close clears it by 3 points; buy the reaction at
 * L + 1 point (down to just under L), stop 3 points under L. Never risk more
 * than 5 points. Points are price-scaled (lib/gann/pointScale.ts). Shorts
 * mirror it.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  computeGannEntryTrigger,
  type GannEntryTrigger,
} from "@/lib/gann/entryTrigger";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { preferredEntryDirection } from "@/lib/scan/entrySelection";
import { buildMacroContext, replay } from "@/lib/backtest/replay";
import { buildReport } from "@/lib/backtest/run";

const DAY = "2026-06-15";
function dayBar(date: string, c: number): Bar {
  return { t: `${date}T00:00:00Z`, o: c, h: c + 1, l: c - 1, c, v: 1000 };
}
function dailyHistory(count: number, before: string): Bar[] {
  const out: Bar[] = [];
  const end = new Date(`${before}T00:00:00Z`).getTime();
  for (let i = count; i >= 1; i--) {
    const d = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const phase = (count - i) % 8;
    const step = phase < 4 ? phase : 7 - phase;
    out.push(dayBar(d, 96 + step * 2));
  }
  return out;
}
/**
 * A falling market: each leg down is longer than the rally after it, and the
 * rallies shrink in percentage, so the trend reads bearish without a
 * counter-move over-balancing it. The reversion pass then arms a long.
 */
function fallingHistory(count: number, before: string): Bar[] {
  const out: Bar[] = [];
  const end = new Date(`${before}T00:00:00Z`).getTime();
  let c = 300;
  for (let i = count; i >= 1; i--) {
    const d = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const k = count - i;
    c *= k % 10 < 6 ? 0.994 : 1 + 0.004 * (1 - (0.5 * k) / count);
    out.push({
      t: `${d}T00:00:00Z`,
      o: c,
      h: c * 1.002,
      l: c * 0.998,
      c,
      v: 1000,
    });
  }
  return out;
}

const FIXTURES = [
  {
    name: "a short below an old bottom",
    daily: dailyHistory(300, DAY),
    expect: "bearish",
  },
  {
    name: "a long above an old top",
    daily: fallingHistory(300, DAY),
    expect: "bullish",
  },
] as const;

function intraday(bars: Array<Omit<Bar, "t" | "v">>): Bar[] {
  return bars.map((b, i) => {
    const m = i * 15;
    return {
      ...b,
      t: `${DAY}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00Z`,
      v: 1000,
    };
  });
}
/** A bar around `c`, in trade direction terms (c is an offset from L in points-of-3). */
const at = (c: number, half = 0.2) => ({ o: c, h: c + half, l: c - half, c });
/** Warm-up just inside the level, between L and the stop. */
function session(
  L: number,
  S: number,
  P: number,
  tail: Array<Omit<Bar, "t" | "v">>,
): Bar[] {
  const head = Array.from({ length: 44 }, (_, i) =>
    at(L - S * (P / 2) + (i % 2 ? 0.1 : -0.1)),
  );
  return intraday([...head, ...tail]);
}

describe.each(FIXTURES)("$name", ({ daily, expect: direction }) => {
  const DAILY = daily;
  const T: GannEntryTrigger = computeGannEntryTrigger(
    DAILY,
    preferredEntryDirection(
      buildMacroContext(DAILY, DAILY[DAILY.length - 1].c).macroTrends,
    ),
  )!;
  const S = T.direction === "bullish" ? 1 : -1;
  const L = T.pivot.price;
  const P = gannThreePoints(L);
  const opts = { targetR: 2, dailyBars: DAILY, entryRule: "reaction" as const };
  const sess = (tail: Array<Omit<Bar, "t" | "v">>) => session(L, S, P, tail);

  it("arms in the fixture's direction", () => {
    expect(T.direction).toBe(direction);
  });

  describe("computeGannEntryTrigger: the crossing levels", () => {
    it("carries the level, a buy 1 point past it and a stop 3 points the other side", () => {
      expect(T.level).toBe(L);
      expect(T.triggerPrice).toBeCloseTo(L + S * P, 8);
      expect(T.reactionEntry).toBeCloseTo(L + (S * P) / 3, 8);
      expect(T.reactionStop).toBeCloseTo(L - S * P, 8);
      // Never more than 5 points of risk: the reaction buy risks 4.
      expect(Math.abs(T.reactionEntry - T.reactionStop)).toBeCloseTo(
        (4 * P) / 3,
        8,
      );
    });
  });

  describe("replay entryRule: reaction", () => {
    it("buys the reaction to 1 point past the level after a close 3 points beyond it", () => {
      const r = replay(
        "TEST",
        sess([
          at(L + S * (P + 0.5)),
          at(L + S * (P + 0.3)),
          at(L + (S * P) / 3 + S * 0.1, 0.4),
          at(L + S * P),
        ]),
        opts,
      );
      expect(r.trades).toHaveLength(1);
      const t = r.trades[0];
      expect(t.entry).toBeCloseTo(T.reactionEntry, 8);
      expect(t.stop).toBeCloseTo(T.reactionStop, 8);
    });

    it("is the replay's default rule", () => {
      const tail = sess([
        at(L + S * (P + 0.5)),
        at(L + S * (P + 0.3)),
        at(L + (S * P) / 3 + S * 0.1, 0.4),
        at(L + S * P),
      ]);
      const byDefault = replay("TEST", tail, { targetR: 2, dailyBars: DAILY });
      expect(byDefault.trades).toHaveLength(1);
      expect(byDefault.trades[0].entry).toBeCloseTo(T.reactionEntry, 8);
      expect(byDefault.trades).toEqual(replay("TEST", tail, opts).trades);
    });

    it("does not buy when price never closed 3 points beyond the level", () => {
      const r = replay(
        "TEST",
        sess([at(L + S * (P - 0.5)), at(L + (S * P) / 3, 0.4), at(L)]),
        opts,
      );
      expect(r.trades).toHaveLength(0);
    });

    it("refuses a gap through the stop line rather than buying it", () => {
      const gap = at(L - S * (P + 0.5));
      const r = replay("TEST", sess([at(L + S * (P + 0.5)), gap, at(L)]), opts);
      expect(r.trades).toHaveLength(0);
      expect(r.refusedFills).toBe(1);
    });

    it("measures R on the 4 points between the reaction buy and the stop", () => {
      const win = at(L + S * (P / 3 + 2 * ((4 * P) / 3) + 1), 0.1);
      const r = replay(
        "TEST",
        sess([
          at(L + S * (P + 0.5)),
          at(L + S * (P + 0.3)),
          at(L + (S * P) / 3 + S * 0.1, 0.4),
          win,
          at(L),
        ]),
        opts,
      );
      expect(r.trades).toHaveLength(1);
      expect(r.trades[0].outcome).toBe("win");
      expect(r.trades[0].target).toBeCloseTo(
        T.reactionEntry + S * 2 * Math.abs(T.reactionEntry - T.reactionStop),
        8,
      );
    });
  });
});

describe("buildReport", () => {
  it("labels a run with no entry rule as the reaction rule, the replay's default", () => {
    const overall = replay("TEST", [], { targetR: 2, dailyBars: [] });
    const report = buildReport({ source: "synthetic", live: false, timeframe: "15Min", targetR: 2, symbols: [], skipped: [], window: { from: null, to: null }, overall }, { symbols: [] });
    expect(report.entryRule).toBe("reaction");
  });
});
