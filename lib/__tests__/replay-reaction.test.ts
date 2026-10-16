/**
 * Gann's crossing rule as an entry (W006 pp.20, 46-47; PLAN.md item 4): an old
 * top L is crossed when a close clears it by 3 points; buy the reaction at
 * L + 1 point (down to just under L), stop 3 points under L. Never risk more
 * than 5 points. Points are price-scaled (lib/gann/pointScale.ts). Shorts
 * mirror it.
 */
import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

// These tests read the reaction rule on the reversion side alone; the buying
// point with the trend (item 6 step 11) is covered in replay.test.ts.
vi.mock("@/lib/scan/entrySelection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scan/entrySelection")>("@/lib/scan/entrySelection");
  return {
    ...actual,
    armSessionEntries: (...args: Parameters<typeof actual.armSessionEntries>) =>
      actual.armSessionEntries(...args).filter((a) => a.setupKind === "reversion"),
  };
});
import {
  computeGannEntryTrigger,
  computeGannOldLevelEntry,
  selectGannEntry,
  type GannEntryTrigger,
} from "@/lib/gann/entryTrigger";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { reversionEntry } from "@/lib/scan/entrySelection";
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

/**
 * The last day trades back down to the latest completed bottom and closes
 * where it opened, so that bottom has had its test and is not a resting buy
 * (PLAN.md item 5, step 2). The crossing is then the only buying point, which
 * is what these tests exercise.
 */
function withBottomTested(daily: Bar[]): Bar[] {
  const lastBottom = computeGannOldLevelEntry(daily, "bullish");
  if (!lastBottom) return daily;
  const last = daily[daily.length - 1];
  const t = new Date(Date.parse(last.t) + 86_400_000).toISOString();
  return [...daily, { t, o: last.c, h: last.c * 1.001, l: lastBottom.level * 0.999, c: last.c, v: 1000 }];
}

const FIXTURES = [
  {
    name: "a short below an old bottom",
    // No trend, so the nearer side arms (item 6 step 11, fork F4 a): 304
    // sessions end the oscillation at its low, where the short is nearer.
    daily: dailyHistory(304, DAY),
    expect: "bearish",
  },
  {
    name: "a long above an old top",
    daily: withBottomTested(fallingHistory(299, "2026-06-14")),
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
  // The side the scan and the replay arm (`reversionEntry`, item 6 step 11).
  const T: GannEntryTrigger = reversionEntry(
    buildMacroContext(DAILY, DAILY[DAILY.length - 1].c).macroTrends,
    (d) => computeGannEntryTrigger(DAILY, d),
    DAILY[DAILY.length - 1].c,
  )!;
  const S = T.direction === "bullish" ? 1 : -1;
  const L = T.pivot.price;
  const P = gannThreePoints(L);
  const opts = { targetR: 2, dailyBars: DAILY, entryRule: "reaction" as const };
  const sess = (tail: Array<Omit<Bar, "t" | "v">>) => session(L, S, P, tail);

  it("arms in the fixture's direction", () => {
    expect(T.direction).toBe(direction);
    // The crossing is the buying point the replay selects here.
    expect(selectGannEntry(DAILY, T.direction)?.kind).toBe("crossing");
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

describe("replay entryRule: reaction on a level the daily chart already crossed", () => {
  // The fixture's old bottom, broken by 3 points on the last two days before
  // the session and reacting short of the sell 1 point under it: a held level.
  const base = dailyHistory(300, DAY).slice(0, -3);
  const first = computeGannEntryTrigger(base, "bearish")!;
  const L = first.level;
  const P = gannThreePoints(L);
  const lastT = Date.parse(base[base.length - 1].t);
  const extra = [L - (P + 1), L - (P + 0.5), L - (P / 3 + 1.5)].map((c, i) =>
    dayBar(new Date(lastT + (i + 1) * 86_400_000).toISOString().slice(0, 10), c),
  );
  const DAILY = [...base, ...extra];
  const T = computeGannEntryTrigger(DAILY, "bearish")!;

  it("sells the reaction in the session without a fresh crossing there", () => {
    expect(T.held).toBe(true);
    expect(T.level).toBe(L);
    const below = at(T.reactionEntry - 1);
    const head = Array.from({ length: 44 }, () => below);
    const r = replay("TEST", intraday([...head, at(T.reactionEntry - 0.1, 0.4), below]), { targetR: 2, dailyBars: DAILY, entryRule: "reaction" });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].entry).toBeCloseTo(T.reactionEntry, 8);
    expect(r.trades[0].stop).toBeCloseTo(T.reactionStop, 8);
  });
});


describe("replay entryRule: reaction at an old bottom (double or triple bottom)", () => {
  // The falling fixture's latest bottom is untested, so it is the nearer
  // buying point and the order rests at it.
  const DAILY = fallingHistory(300, DAY);
  const T = selectGannEntry(DAILY, "bullish")!;
  const L = T.level;
  const P = gannThreePoints(L);
  const above = at(L + P / 2);
  const head = Array.from({ length: 44 }, () => above);

  it("selects the old bottom", () => {
    expect(T.kind).toBe("oldLevel");
    expect(T.reactionEntry).toBe(L);
    expect(T.reactionStop).toBeCloseTo(L - P, 8);
  });

  it("buys when price comes down to the old bottom, with the stop 3 points under it", () => {
    const r = replay("TEST", intraday([...head, at(L + 0.05, 0.2), above]), { targetR: 2, dailyBars: DAILY });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].entry).toBeCloseTo(L, 8);
    expect(r.trades[0].stop).toBeCloseTo(L - P, 8);
  });

  it("does not buy while price stays above the old bottom", () => {
    const r = replay("TEST", intraday([...head, above, above]), { targetR: 2, dailyBars: DAILY });
    expect(r.trades).toHaveLength(0);
  });

  it("buys on the first candle of the session the level first arms on", () => {
    // The warm-up candles sit on a date with too little daily history to arm,
    // so the old bottom is first offered on DAY, whose first candle already
    // trades under it (above the stop). The resting order is filled there.
    const stamp = (date: string, hour: number, i: number) => {
      const m = i * 15;
      return `${date}T${String(hour + Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00Z`;
    };
    const early: Bar[] = Array.from({ length: 44 }, (_, i) => ({ ...above, t: stamp("2025-08-25", 0, i), v: 1000 }));
    const day: Bar[] = Array.from({ length: 6 }, (_, i) => ({ ...at(L - P / 4, 0.05), t: stamp(DAY, 14, i), v: 1000 }));
    const r = replay("TEST", [...early, ...day], { targetR: 2, dailyBars: DAILY });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].entry).toBeLessThanOrEqual(L);
  });
});
