/**
 * The step 4 review (S1-S7): a held bottom is bought once, the record low has
 * to hold for weeks from the day price came back to it, the days form holds
 * through the third day, a level the price already stood over is not crossed
 * again by a dip, and the replay buys a level crossed again after a break.
 */
import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

vi.mock("@/lib/scan/entrySelection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scan/entrySelection")>("@/lib/scan/entrySelection");
  // One bullish reversion a session, nothing with the trend: these reviews read the long side alone.
  return {
    ...actual,
    preferredEntryDirection: () => "bullish",
    reversionEntry: (_t: unknown, entryOf: (d: "bullish") => unknown) => entryOf("bullish"),
    armSessionEntries: (_t: unknown, entryOf: (d: "bullish") => unknown) => {
      const trigger = entryOf("bullish");
      return trigger ? [{ setupKind: "reversion", trigger }] : [];
    },
  };
});

import {
  computeGannEntryTrigger,
  computeGannHoldEntry,
  selectGannEntry,
  HOLD_RECORD_MIN_DAYS,
  type GannEntryTrigger,
  type OlderGannLevel,
} from "@/lib/gann/entryTrigger";
import { entryChart } from "@/lib/scan/entrySelection";
import { threePoints } from "@/lib/gann/pointScale";
import { replay } from "@/lib/backtest/replay";
import { examKeyedOlderLevel } from "@/lib/school/graduationExam";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
const flat = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? hi : lo));
function daily(closes: number[], start = "2026-03-02", half = 0.3): Bar[] {
  const t0 = Date.parse(`${start}T04:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}
function monthly(from: string, n: number, hl: (month: string) => [number, number]): Bar[] {
  const [y0, m0] = from.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const y = y0 + Math.floor((m0 - 1 + i) / 12);
    const month = `${y}-${String(((m0 - 1 + i) % 12) + 1).padStart(2, "0")}`;
    const [h, l] = hl(month);
    return { t: `${month}-01T05:00:00Z`, o: (h + l) / 2, h, l, c: (h + l) / 2, v: 1e8 };
  });
}
const zig = (lo: number, hi: number, times: number) => Array.from({ length: times }, () => [...leg(lo, hi, 5), ...leg(hi, lo, 5)]).flat();
const rec = (price: number): OlderGannLevel => ({ price, kind: "bottom", source: "allTime", formedAt: "2019-03-01T05:00:00Z", crossFrom: "2026-03-02" });
const nextDay = (bars: Bar[], o: number, l: number, h: number, c: number): Bar[] => [
  ...bars,
  { t: new Date(Date.parse(bars[bars.length - 1].t) + DAY).toISOString(), o, h, l, c, v: 1e6 },
];

describe("the record low has held for weeks (S2, A-ENTRY-10)", () => {
  const pts = threePoints(50);

  it("counts from the day price came back to the record, not from an earlier visit", () => {
    // Near 50 for three days, a rally to 80, and a fall that comes back
    // within 3 points of 50 (lows at 53.30 or under) only on the last bar.
    const bars = daily([52, 51.5, 52, ...leg(52, 80, 60), ...leg(80, 54, 39), 51.2], "2025-09-01");
    expect(bars.slice(63, -1).every((b) => b.l > 50 + pts)).toBe(true);
    expect(computeGannHoldEntry(bars, "bullish", [rec(50)])?.holdBasis).not.toBe("record");
  });

  // The fall from 70 comes within 3 points of the record (lows at 53.30 or
  // under) on its last four bars, so the stay is `days` + 3 calendar days long
  // and the hold is first offered on the last bar (it is bought once, S3).
  const stayed = (days: number) => daily([...leg(70, 51.4, 30), ...flat(51.0, 51.4, days)], "2026-01-05");

  it("asks four weeks within 3 points of the record, and buys at the close with the stop 3 points under it", () => {
    expect(HOLD_RECORD_MIN_DAYS).toBe(28);
    const t = computeGannHoldEntry(stayed(25), "bullish", [rec(50)]);
    expect(t).toMatchObject({ kind: "hold", holdBasis: "record", level: 50 });
    expect(t!.reactionEntry).toBe(stayed(25).at(-1)!.c);
    expect(t!.reactionStop).toBeCloseTo(50 - pts, 8);
    expect(computeGannHoldEntry(stayed(24), "bullish", [rec(50)])?.holdBasis).not.toBe("record");
  });

  it("counts a stay whose lows are within 3 points of the record, not only at it", () => {
    // Lows 1.5 over the record, never at it; the stay is `days` + 2 days long.
    const lo = 51.5;
    const bars = daily([...leg(70, lo + 0.3, 30), ...flat(lo + 0.3, lo + 0.4, 26)], "2026-01-05", 0.3);
    expect(bars.every((b) => b.l > 50)).toBe(true);
    expect(computeGannHoldEntry(bars, "bullish", [rec(50)])?.holdBasis).toBe("record");
  });

  it("is not offered when the close is more than 5 points over the stop", () => {
    // Lows within 3 points of the record; closes 2.9 points over it, 5.9 over
    // the stop. The stay reaches four weeks on the last bar.
    const c = 50 + (2.9 / 3) * pts;
    const bars = daily([...leg(70, c, 30), ...Array.from({ length: 25 }, () => c)], "2026-01-05", (1.5 / 3) * pts);
    expect(computeGannHoldEntry(bars, "bullish", [rec(50)])?.holdBasis).not.toBe("record");
  });
});

describe("a held bottom is bought once (S3)", () => {
  const D0 = daily([...leg(140, 90, 25), ...leg(90, 110, 10), ...leg(110, 100, 5), ...flat(100.6, 101.4, 9)]);
  const T0 = computeGannHoldEntry(D0, "bullish")!;

  it("is not offered again once a later session traded to its buy, and the old bottom is then the buy", () => {
    expect(T0.kind).toBe("hold");
    const D1 = nextDay(D0, 101.4, T0.reactionEntry - 0.4, 101.6, 101.0);
    const again = computeGannHoldEntry(D1, "bullish");
    expect(again?.formedAt === T0.formedAt).toBe(false);
    expect(selectGannEntry(D1, "bullish")?.kind).not.toBe("hold");
  });

  it("is still offered while price stays over its buy", () => {
    const D1 = nextDay(D0, T0.reactionEntry + 0.5, T0.reactionEntry + 0.2, T0.reactionEntry + 0.9, T0.reactionEntry + 0.6);
    expect(computeGannHoldEntry(D1, "bullish")).toMatchObject({ kind: "hold", formedAt: T0.formedAt });
  });

  it("is offered on a new low after the one bought", () => {
    const D1 = nextDay(D0, 101.4, T0.reactionEntry - 0.4, 101.6, 101.0);
    // A new low under the one bought, and nine days over it.
    const D2 = daily([...D1.map((b) => b.c), ...leg(101, 99.5, 3), ...flat(100.0, 100.4, 9)]);
    const t = computeGannHoldEntry(D2, "bullish");
    expect(t?.kind).toBe("hold");
    expect(t!.formedAt > T0.formedAt).toBe(true);
  });
});

describe("the days form (A-ENTRY-08)", () => {
  // A bull market with 4-day reactions, then a 10-day reaction to 100.
  const BULL = [...leg(60, 80, 8), ...leg(80, 72, 4), ...leg(72, 92, 8), ...leg(92, 84, 4), ...leg(84, 110, 10)];

  it("holds through the third day of the hold, not only the second", () => {
    expect(computeGannHoldEntry(daily([...BULL, ...leg(110, 100, 10), 100.8, 101.2]), "bullish")?.holdBasis).toBe("days");
    expect(computeGannHoldEntry(daily([...BULL, ...leg(110, 100, 10), 100.8, 101.2, 101.6]), "bullish")?.holdBasis).toBe("days");
  });

  it("buys only after a reaction of 2-3 weeks, not a longer one", () => {
    // A 24-day reaction, low held two days.
    expect(computeGannHoldEntry(daily([...BULL, ...leg(110, 100, 24), 100.8, 101.2]), "bullish")?.holdBasis).not.toBe("days");
  });

  it("buys only in a bull market", () => {
    // A bear market with 4-day rallies, then a 10-day reaction from a rally top.
    const BEAR = [...leg(200, 170, 10), ...leg(170, 178, 4), ...leg(178, 150, 10), ...leg(150, 158, 4), ...leg(158, 130, 10), ...leg(130, 142, 6)];
    expect(computeGannHoldEntry(daily([...BEAR, ...leg(142, 128, 10), 128.8, 129.2]), "bullish")?.holdBasis).not.toBe("days");
  });
});

describe("the 5-point cap on a held bottom", () => {
  // A top at 110 and a reaction to a low of L, then nine days over it, the
  // last close `over` points over the stop.
  const held = (over: number) => {
    const L = 100;
    const p = threePoints(L);
    const stop = L - p;
    const close = stop + (over / 3) * threePoints(stop + (over / 3) * p);
    return daily([...leg(140, 90, 25), ...leg(90, 115, 10), ...leg(115, L + 0.3, 5), ...flat(L + 0.6, L + 0.9, 8), close]);
  };

  it("buys at 4.8 points of risk and not at 5.2", () => {
    const ok = computeGannHoldEntry(held(4.8), "bullish");
    expect(ok?.kind).toBe("hold");
    expect(computeGannHoldEntry(held(5.2), "bullish")).toBeNull();
  });
});

describe("a level the price already stood over (S4)", () => {
  it("is not crossed again by a dip that stays over its break", () => {
    // 2018's top is 50, the record; the window opens at 56 and dips to 50.8.
    const M = monthly("2016-01", 125, (m) => (m === "2018-03" ? [50, 40] : [45, 30]));
    const D = daily([...zig(55, 60, 6), ...leg(55, 50.8, 4), ...leg(50.8, 57, 4), 56.5, 57, 56.8], "2026-01-05");
    const chart = entryChart(D, M, "2026-06-01");
    const t = computeGannEntryTrigger(chart.bars, "bullish", undefined, undefined, true, chart.older);
    expect(t?.level === 50 && t.held).toBe(false);
  });

  it("is crossed again after a close 3 points back under it", () => {
    const M = monthly("2016-01", 125, (m) => (m === "2018-03" ? [50, 40] : [45, 30]));
    const D = daily([...zig(55, 60, 6), ...leg(55, 45, 6), ...leg(45, 54, 5), ...leg(54, 52, 3)], "2026-01-05");
    const chart = entryChart(D, M, "2026-06-01");
    expect(computeGannEntryTrigger(chart.bars, "bullish", undefined, undefined, true, chart.older)).toMatchObject({ held: true, level: 50 });
  });
});

/** Execution candles from each daily bar: the open, the low, the high and the close. */
function sessions(D: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of D) {
    const day = b.t.slice(0, 10);
    [b.o, b.l, b.h, b.c].forEach((p, i) =>
      out.push({ t: `${day}T${14 + Math.floor((30 + 15 * i) / 60)}:${String((30 + 15 * i) % 60).padStart(2, "0")}:00Z`, o: p, h: p + 0.01, l: p - 0.01, c: p, v: 1000 }),
    );
  }
  return out;
}

describe("the replay buys a level crossed again after a break (S1)", () => {
  // 2025's top is 100. Crossed in February and bought, broken to 90, then
  // crossed again in May and reacting toward the buy.
  const M = monthly("2016-01", 125, (m) => (m === "2025-06" ? [100, 92] : m < "2025-01" ? [80, 70] : [95, 88]));
  const D = daily(
    [...zig(88, 94, 4), ...leg(94, 98, 3), ...leg(98, 106, 6), ...leg(106, 90, 12), ...zig(90, 96, 6), ...leg(90, 107, 10), ...leg(107, 103.5, 3), 103.4, 101.2, 103, 104, 104],
    "2026-01-05",
    // Both advances that cross 100 run on heavier volume, as a breakaway must (A-VOLUME-10).
  ).map((b, i) => ((i >= 43 && i < 49) || (i >= 121 && i < 131) ? { ...b, v: 2e6 } : b));

  it("is offered live on the second crossing", () => {
    const asOf = D[D.length - 4].t.slice(0, 10);
    const chart = entryChart(D, M, asOf);
    const live = computeGannEntryTrigger(chart.bars, "bullish", undefined, undefined, true, chart.older) as GannEntryTrigger;
    expect(live).toMatchObject({ held: true, level: 100 });
    expect(live.crossedAt! > "2026-04-01").toBe(true);
  });

  it("buys it in the replay as well as the first crossing", () => {
    const r = replay("TEST", sessions(D), { targetR: 2, dailyBars: D, monthlyBars: M, entryRule: "reaction", warmupBars: 4 * 32 });
    // Both buys of 2025's top carry its stop, 3 points under 100.
    const at100 = r.trades.filter((t) => t.entryKind === "crossing" && Math.abs(t.stop - (100 - threePoints(100))) < 0.01);
    expect(at100.length).toBeGreaterThanOrEqual(2);
    expect(at100[at100.length - 1].openedAt > "2026-04-01").toBe(true);
  });
});

describe("the exam's skip for a level it does not draw (S7)", () => {
  const base = { reactionEntry: 51, reactionStop: 47, level: 50 } as const;
  it("covers a held record low as it covers an older level crossed", () => {
    expect(examKeyedOlderLevel({ ...base, kind: "hold", holdBasis: "record", source: "allTime" } as GannEntryTrigger)).toBe(50);
    expect(examKeyedOlderLevel({ ...base, kind: "crossing", source: "priorYear" } as GannEntryTrigger)).toBe(50);
    expect(examKeyedOlderLevel({ ...base, kind: "crossing", source: "swing" } as GannEntryTrigger)).toBeNull();
    expect(examKeyedOlderLevel({ ...base, kind: "hold", holdBasis: "weeks", source: "swing" } as GannEntryTrigger)).toBeNull();
  });
});
