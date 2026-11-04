import { describe, expect, it } from "vitest";
import {
  buildRobustness,
  DEFAULT_STRESS_WINDOWS,
  marketDrawdownByDate,
  marketTrendByDate,
  marketSwingTrendByDate,
  nyDate,
  openSpan,
  quarterOf,
  quarterStart,
  regimeSplit,
  stressWindows,
  walkForward,
  type MarketTrend,
  type RobustTrade,
} from "@/lib/backtest/robustness";
import type { Bar } from "@/lib/types";

const trade = (
  date: string,
  r: number,
  score?: number,
  direction: RobustTrade["direction"] = "bullish",
  closed: string = date,
): RobustTrade => ({
  openedAt: `${date}T15:00:00Z`,
  closedAt: `${closed}T20:00:00Z`,
  rMultiple: r,
  direction,
  score,
});

describe("dates", () => {
  it("reads the New York date, not the UTC one", () => {
    // 01:30 UTC on Jan 2 is 8:30 PM New York on Jan 1.
    expect(nyDate("2024-01-02T01:30:00Z")).toBe("2024-01-01");
    expect(quarterOf("2024-11-30")).toBe("2024-Q4");
    expect(quarterOf("2024-01-01")).toBe("2024-Q1");
    expect(quarterStart("2024-Q3")).toBe("2024-07-01");
    expect(quarterStart("2024-Q1")).toBe("2024-01-01");
  });
});

describe("walkForward", () => {
  it("chooses each quarter's cutoff only from trades closed before it", () => {
    const trades: RobustTrade[] = [];
    // Q1: high scores win, low scores lose (30 of each, the in-sample minimum).
    for (let i = 0; i < 30; i++) trades.push(trade("2024-02-01", 1, 8), trade("2024-02-01", -1, 5));
    // Q2: the reverse. A cutoff chosen with Q2 in view would differ.
    for (let i = 0; i < 30; i++) trades.push(trade("2024-05-01", -1, 8), trade("2024-05-01", 1, 5));
    const wf = walkForward(trades);
    expect(wf.windows.map((w) => w.window)).toEqual(["2024-Q1", "2024-Q2"]);
    expect(wf.windows[0].chosenCutoff).toBeNull();
    // Q1 alone favours 8 (and 9 has no trades), so Q2 is measured at 8: all losers.
    expect(wf.windows[1].chosenCutoff).toBe(8);
    expect(wf.windows[1].chosen?.expectancyR).toBe(-1);
    expect(wf.outOfSample.n).toBe(30);
    expect(wf.fixedOnSameWindows.n).toBe(30); // score >= 7 in Q2
  });

  it("does not use a trade that closed inside the quarter being chosen for", () => {
    const trades: RobustTrade[] = [];
    // Opened in Q1 but closed in Q2: not known when Q2 began.
    for (let i = 0; i < 40; i++) trades.push(trade("2024-03-20", 1, 8, "bullish", "2024-04-15"));
    trades.push(trade("2024-05-01", 1, 8));
    expect(walkForward(trades).windows[1].chosenCutoff).toBeNull();
    // Closed in Q1, they are known.
    const known = trades.map((t, i) => (i < 40 ? { ...t, closedAt: "2024-03-29T20:00:00Z" } : t));
    expect(walkForward(known).windows[1].chosenCutoff).toBe(8);
  });

  it("never takes a trade open at the end or without a close stamp in sample", () => {
    const open = Array.from({ length: 40 }, () => ({ ...trade("2024-02-01", 1, 8), exitReason: "open_at_end" }));
    const unstamped = Array.from({ length: 40 }, () => ({ ...trade("2024-02-01", 1, 8), closedAt: undefined }));
    expect(walkForward([...open, trade("2024-05-01", 1, 8)]).windows[1].chosenCutoff).toBeNull();
    expect(walkForward([...unstamped, trade("2024-05-01", 1, 8)]).windows[1].chosenCutoff).toBeNull();
  });

  it("ignores a non-finite R when choosing", () => {
    const trades = Array.from({ length: 30 }, () => trade("2024-02-01", 1, 8));
    trades.push(trade("2024-02-01", NaN, 8), trade("2024-05-01", 1, 8));
    expect(walkForward(trades).windows[1].chosenCutoff).toBe(8);
  });

  it("counts positive quarters and the longest run at or below zero", () => {
    const wf = walkForward([trade("2023-01-10", 1), trade("2023-04-10", -1), trade("2023-07-10", -0.5), trade("2023-10-10", 2)]);
    expect(wf.positiveWindows).toEqual({ positive: 2, of: 4 });
    expect(wf.longestLosingRun).toBe(2);
  });

  it("keeps the score filter and the Execute verdict apart, and derived trades out of both", () => {
    const wf = walkForward([
      { ...trade("2024-02-01", 3, 9), derived: "reversal" },
      { ...trade("2024-02-01", 1, 9), outputState: "Execute" },
      // Scored 8 but held to Watch by a rule other than the cutoff.
      { ...trade("2024-02-01", -1, 8), outputState: "Watch" },
    ]);
    expect(wf.windows[0].n).toBe(3);
    expect(wf.windows[0].fixedCutoff.n).toBe(2);
    expect(wf.windows[0].execute.n).toBe(1);
  });
});

describe("stressWindows", () => {
  it("starts every default window the session after a high close", () => {
    const starts = Object.fromEntries(DEFAULT_STRESS_WINDOWS.map((w) => [w.label, w.from]));
    expect(starts["2020 crash"]).toBe("2020-02-20");
    expect(starts["2025 tariff decline"]).toBe("2025-02-20");
    expect(starts["March 2023 bank stress"]).toBe("2023-03-07");
  });


  it("takes trades opened inside each window, by side", () => {
    const rows = stressWindows(
      [trade("2020-03-01", -1), trade("2020-03-02", 2, undefined, "bearish"), trade("2020-07-01", 5)],
      [{ label: "crash", from: "2020-02-19", to: "2020-03-23" }],
    );
    expect(rows[0].n).toBe(2);
    expect(rows[0].longs.totalR).toBe(-1);
    expect(rows[0].shorts.totalR).toBe(2);
  });
});

/** Daily bars stamped after the New York close, as the report script stamps them. */
function walk(n: number, step: number, start = 100): Bar[] {
  const bars: Bar[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    // A swinging rise (or fall): five bars with the move, three against,
    // so the 3-Day Chart completes swings that step the same way.
    p += i % 8 < 5 ? step : -step * 0.6;
    const t = new Date(Date.UTC(2022, 0, 3, 20) + i * 86400000).toISOString();
    bars.push({ t, o: p, h: p + 0.5, l: p - 0.5, c: p, v: 1000 });
  }
  return bars;
}

describe("regimes", () => {
  it("reads a rising market as up and a falling one as down", () => {
    const last = (m: Map<string, MarketTrend>) => [...m.values()].at(-1);
    expect(last(marketTrendByDate(walk(200, 1)))).toBe("up");
    expect(last(marketTrendByDate(walk(200, -1, 400)))).toBe("down");
    // The first session has no bars before it, so it has no reading.
    expect(marketTrendByDate(walk(200, 1)).has(nyDate(walk(1, 1)[0].t))).toBe(false);
  });

  it("reads each date on the sessions before it, never that session's own bar", () => {
    const bars = walk(200, 1);
    const i = 150;
    const date = nyDate(bars[i].t);
    const crashed = bars.map((b, k) => (k === i ? { ...b, o: 1, h: 1, l: 1, c: 1 } : b));
    expect(marketTrendByDate(crashed).get(date)).toBe(marketTrendByDate(bars).get(date));
    expect(marketDrawdownByDate(crashed).get(date)).toBe(false);
    // The session after it sees the crash.
    expect(marketDrawdownByDate(crashed).get(nyDate(bars[i + 1].t))).toBe(true);
  });

  it("marks a correction 10% under the prior year's high close", () => {
    const bars = [...walk(20, 1), ...walk(20, -2, 120)].map((b, i) => ({
      ...b,
      t: new Date(Date.UTC(2022, 0, 3, 20) + i * 86400000).toISOString(),
    }));
    const dd = marketDrawdownByDate(bars);
    expect([...dd.values()].some(Boolean)).toBe(true);
    expect(dd.get(nyDate(bars[5].t))).toBe(false);
  });

  it("splits trades with and against the market's trend", () => {
    const trend = new Map<string, MarketTrend>([
      ["2024-01-02", "up"],
      ["2024-01-03", "down"],
      ["2024-01-04", "none"],
    ]);
    const split = regimeSplit(
      [
        trade("2024-01-02", 1),
        trade("2024-01-03", 2, undefined, "bearish"),
        trade("2024-01-03", -1),
        trade("2024-01-04", 3),
        trade("2024-01-05", 4),
      ],
      trend,
    );
    expect(split.withMarket.with.totalR).toBe(3);
    expect(split.withMarket.against.totalR).toBe(-1);
    expect(split.withMarket.none.totalR).toBe(7);
    expect(split.byTrend.unknown.n).toBe(1);
    expect(split.byCorrection.unknown.n).toBe(5);
  });

  it("splits longs and shorts by each market reading and by corrections", () => {
    const trend = new Map<string, MarketTrend>([
      ["2024-01-02", "up"],
      ["2024-01-03", "down"],
    ]);
    const swing = new Map<string, MarketTrend>([
      ["2024-01-02", "up"],
      ["2024-01-03", "up"],
    ]);
    const correction = new Map<string, boolean>([
      ["2024-01-02", false],
      ["2024-01-03", true],
    ]);
    const split = regimeSplit(
      [
        trade("2024-01-02", 1),
        trade("2024-01-03", -2),
        trade("2024-01-03", 3, undefined, "bearish"),
        trade("2024-01-05", 4, undefined, "bearish"),
      ],
      trend,
      correction,
      swing,
    );
    expect(split.bySide.long.totalR).toBe(-1);
    expect(split.bySide.short.totalR).toBe(7);
    expect(split.sideByTrend["long:up"].totalR).toBe(1);
    expect(split.sideByTrend["long:down"].totalR).toBe(-2);
    expect(split.sideByTrend["short:down"].totalR).toBe(3);
    // A date with no reading joins "none" on its side.
    expect(split.sideByTrend["short:none"].totalR).toBe(4);
    expect(split.sideBySwingTrend?.["long:up"].n).toBe(2);
    expect(split.sideBySwingTrend?.["short:up"].totalR).toBe(3);
    expect(split.sideByCorrection["long:correction"].totalR).toBe(-2);
    expect(split.sideByCorrection["long:normal"].totalR).toBe(1);
    expect(split.sideByCorrection["short:unknown"].totalR).toBe(4);
    expect(regimeSplit([trade("2024-01-02", 1)], trend).sideBySwingTrend).toBeNull();
  });

  it("reads the market's swing trend only where the 3-Day and weekly charts agree", () => {
    const last = (m: Map<string, MarketTrend>) => [...m.values()].at(-1);
    expect(last(marketSwingTrendByDate(walk(200, 1)))).toBe("up");
    expect(last(marketSwingTrendByDate(walk(200, -1, 400)))).toBe("down");
    expect(marketSwingTrendByDate(walk(200, 1)).has(nyDate(walk(1, 1)[0].t))).toBe(false);
  });
});

describe("buildRobustness", () => {
  it("reads the closed armed trades, counts the open ones and keeps derived trades apart", () => {
    const rep = buildRobustness([
      trade("2024-02-01", 1, 8),
      { ...trade("2024-02-02", 5, 8), exitReason: "open_at_end" },
      { ...trade("2024-02-03", -1), derived: "reversal" },
    ]);
    expect(rep.n).toBe(1);
    expect(rep.openAtEnd).toBe(1);
    expect(rep.derived.n).toBe(1);
    expect(rep.walkForward.windows[0].n).toBe(1);
    expect(rep.regimes).toBeNull();
  });

  it("counts the trades ended at the session limit, which every section values at the bar's close", () => {
    const rep = buildRobustness([trade("2024-02-01", 1, 8), { ...trade("2024-02-02", 0.4, 8), exitReason: "held_to_limit" }]);
    expect(rep.n).toBe(2);
    expect(rep.heldToLimit).toBe(1);
  });

  it("reads the market only over the trades' own dates", () => {
    const market = walk(200, 1);
    const trades = [trade(nyDate(market[150].t), 1, 8), trade(nyDate(market[160].t), 1, 8)];
    expect(openSpan(trades)).toEqual({ from: nyDate(market[150].t), to: nyDate(market[160].t) });
    const span = openSpan(trades)!;
    const trimmed = marketTrendByDate(market, 520, span);
    expect(trimmed.size).toBe(11);
    // Each date still reads its whole lookback before it.
    expect(trimmed.get(span.from)).toBe(marketTrendByDate(market).get(span.from));
    expect(marketDrawdownByDate(market, 0.1, 252, span).size).toBe(11);
  });

  it("splits by regime when market bars are given", () => {
    const market = walk(200, 1);
    const rep = buildRobustness([trade(nyDate(market[190].t), 1, 8)], market);
    expect(rep.regimes?.byTrend.up.n).toBe(1);
  });
});
