import { describe, expect, it } from "vitest";
import { STAGE_KEYS, stage, type CoverageStages } from "../coverage";
import type { Bar } from "@/lib/types";
import {
  executableSentences,
  firstDeliveries,
  judgeDailySetup,
  judgeIntradaySignal,
  moverVerdict,
  notExecutableReason,
  parseBellNotice,
  plainFocusReason,
  plainSignalLabel,
  renderFocusEmail,
  renderRecapEmail,
  toMover,
  topMovers,
  type DailySetup,
  type IntradaySignal,
  type NextPlan,
} from "../eveningReport";

const bar = (t: string, o: number, h: number, l: number, c: number): Bar => ({ t, o, h, l, c, v: 1000 });
const at = (hhmm: string) => `2026-10-27T${hhmm}:00Z`;

const long: DailySetup = {
  symbol: "LLY",
  direction: "bullish",
  verdict: "Execute",
  score: 8,
  entry: 100,
  stop: 95,
  tp1: 110,
  mtp: 120,
  entryAwaitsCrossing: false,
};

describe("movers", () => {
  it("ranks by the absolute move in each measure", () => {
    const a = toMover({ symbol: "A", prevClose: 1000, open: 1000, high: 1030, low: 995, close: 1020 })!;
    const b = toMover({ symbol: "B", prevClose: 10, open: 10, high: 12, low: 10, close: 12 })!;
    const c = toMover({ symbol: "C", prevClose: 50, open: 50, high: 50, low: 44, close: 45 })!;
    expect(topMovers([a, b, c], "dollars").map((m) => m.symbol)).toEqual(["A", "C", "B"]);
    expect(topMovers([a, b, c], "pct").map((m) => m.symbol)).toEqual(["B", "C", "A"]);
    expect(c.dollars).toBe(-5);
    expect(c.closeInRange).toBeCloseTo(1 / 6);
    expect(Math.sign(c.gannPoints)).toBe(-1);
  });

  it("refuses a row with a missing price", () => {
    expect(toMover({ symbol: "X", prevClose: 0, open: 1, high: 1, low: 1, close: 1 })).toBeNull();
    expect(toMover({ symbol: "X", prevClose: 1, open: 1, high: 1, low: 1, close: NaN })).toBeNull();
  });
});

describe("judgeDailySetup", () => {
  it("fills once the zone bar could be read on the delayed feed (its close plus 15 minutes), then counts TP1", () => {
    // The 9:45 bar trades into the zone; it closes 10:00 and is read at 10:15, so the 10:15 bar's open fills.
    const bars = [
      bar(at("13:30"), 104, 105, 101, 103),
      bar(at("13:45"), 103, 103, 99.5, 101),
      bar(at("14:00"), 101, 101.5, 100.2, 100.8),
      bar(at("14:15"), 100.5, 111, 100, 110),
    ];
    const j = judgeDailySetup(long, bars, 104);
    expect(j.outcome).toBe("tp1_first");
    expect(j.fill).toBe(100.5);
    expect(j.r).toBeCloseTo((110 - 100.5) / (100.5 - 95));
  });

  it("counts the stop when one bar reaches both", () => {
    const bars = [bar(at("13:30"), 101, 101, 99, 100), bar(at("13:45"), 100, 100.5, 99.8, 100.2), bar(at("14:00"), 100, 111, 94, 100)];
    expect(judgeDailySetup(long, bars, 102).outcome).toBe("stop_first");
  });

  it("is called off by a close through the stop before any fill", () => {
    const bars = [bar(at("13:30"), 96, 96, 93, 94), bar(at("13:45"), 94, 101, 94, 100)];
    expect(judgeDailySetup(long, bars, 97).outcome).toBe("called_off");
  });

  it("separates a move without a fill from no fill", () => {
    const up = [bar(at("13:30"), 106, 109, 105, 108)];
    expect(judgeDailySetup(long, up, 104).outcome).toBe("no_fill_moved_its_way");
    const down = [bar(at("13:30"), 104, 104, 102, 103)];
    expect(judgeDailySetup(long, down, 104).outcome).toBe("no_fill");
  });

  it("marks a setup whose TP1 was already passed before the open as stale", () => {
    expect(judgeDailySetup(long, [bar(at("13:30"), 112, 113, 111, 112)], 111).outcome).toBe("past_tp1_before_open");
  });

  it("marks an open trade at the close ahead or behind, mirrored for a short", () => {
    const short: DailySetup = { ...long, symbol: "BWXT", direction: "bearish", entry: 100, stop: 105, tp1: 90 };
    const bars = [bar(at("13:30"), 99, 100.5, 98, 99), bar(at("13:45"), 99, 99.5, 98.5, 99), bar(at("14:00"), 99, 99, 97, 97.5)];
    const j = judgeDailySetup(short, bars, 98);
    expect(j.outcome).toBe("open_ahead");
    expect(j.fill).toBe(99);
    expect(j.r).toBeCloseTo((99 - 97.5) / (105 - 99));
  });

  it("calls the setup off when the stop trades while the delayed order waits", () => {
    const bars = [bar(at("13:30"), 101, 101, 99, 100), bar(at("13:45"), 100, 100.5, 94, 99), bar(at("14:00"), 99, 104, 98, 103)];
    const j = judgeDailySetup(long, bars, 102);
    expect(j.outcome).toBe("stop_while_waiting");
    expect(j.fill).toBeNull();
  });

  it("fills crypto at the next bar's open, with no feed delay", () => {
    const btc = { ...long, symbol: "BTC/USD" };
    const bars = [bar(at("13:30"), 101, 101, 99, 100), bar(at("13:45"), 100.5, 111, 100, 110)];
    const j = judgeDailySetup(btc, bars, 102);
    expect(j.fill).toBe(100.5);
    expect(j.outcome).toBe("tp1_first");
  });

  it("waits for the crossing first when the plan still awaits it", () => {
    const crossing = { ...long, entryAwaitsCrossing: true };
    const bars = [bar(at("13:30"), 99, 100, 98, 99.5), bar(at("13:45"), 99.5, 100, 98.5, 99)];
    expect(judgeDailySetup(crossing, bars, 98).fill).toBeNull();
  });
});

describe("intraday signals", () => {
  it("parses a bell notice the way the member read it", () => {
    expect(
      parseBellNotice("NVDA intraday, down: Reversal risk", "Price 217.61, stop 217.96, TP1 216.41, MTP 213.07. Timing for a daily plan."),
    ).toEqual({ direction: "bearish", label: "Reversal risk", price: 217.61, stop: 217.96, tp1: 216.41, mtp: 213.07 });
    expect(parseBellNotice("SPY intraday, up: Level held", "Price 1,201.5, stop 1,195, no target is fixed.")).toMatchObject({ price: 1201.5, stop: 1195, tp1: null });
    expect(parseBellNotice("Something else", "Price 1")).toBeNull();
  });

  it("keeps each member's first delivery and counts the repeats", () => {
    const base = { member: "m1", symbol: "NVDA", direction: "bearish" as const, label: "Reversal risk", price: 1, stop: 2, tp1: 0.5, mtp: null };
    const out = firstDeliveries([
      { ...base, at: at("14:15"), price: 1.1 },
      { ...base, at: at("13:51") },
      { ...base, member: "m2", at: at("14:00") },
    ]);
    expect(out).toHaveLength(2);
    const m1 = out.find((s) => s.member === "m1")!;
    expect(m1.at).toBe(at("13:51"));
    expect(m1.deliveries).toBe(2);
  });

  const sig: IntradaySignal = {
    member: "m1",
    symbol: "NVDA",
    direction: "bearish",
    label: "Reversal risk",
    at: "2026-10-27T13:51:04Z",
    price: 217.61,
    stop: 217.96,
    tp1: 216.41,
    mtp: 213.07,
    deliveries: 3,
  };
  const cutoff = Date.parse("2026-10-27T19:45:00Z");

  it("enters on the first bar opening after delivery and counts TP1", () => {
    const bars = [bar("2026-10-27T13:51:00Z", 217.7, 217.8, 217.5, 217.6), bar("2026-10-27T13:52:00Z", 217.6, 217.7, 216.3, 216.4)];
    const j = judgeIntradaySignal(sig, bars, cutoff);
    expect(j.fill).toBe(217.6);
    expect(j.outcome).toBe("tp1_first");
  });

  it("does not judge a signal received after the style's close", () => {
    expect(judgeIntradaySignal({ ...sig, at: "2026-10-27T19:50:00Z" }, [], cutoff).outcome).toBe("after_cutoff");
  });

  it("reads the result at the cutoff when neither level is reached", () => {
    const bars = [bar("2026-10-27T13:52:00Z", 217.6, 217.7, 217.3, 217.4), bar("2026-10-27T19:45:00Z", 210, 210, 200, 200)];
    const j = judgeIntradaySignal(sig, bars, cutoff);
    expect(j.outcome).toBe("ahead_at_cutoff");
    expect(j.r).toBeCloseTo((217.6 - 217.4) / (217.96 - 217.6));
  });
});

describe("plain English", () => {
  const plan: NextPlan = {
    symbol: "LLY",
    direction: "bullish",
    verdict: "Execute",
    score: 8,
    entry: 1255.91,
    stop: 1226.36,
    tp1: 1325,
    mtp: 1453.95,
    price: 1281.52,
    dayRange: 39.32,
    entryAwaitsCrossing: false,
  };

  it("says where to buy, the stop and the take profits", () => {
    const s = executableSentences(plan);
    expect(s.entry).toContain("pullback down to $1,255.91");
    expect(s.stop).toContain("$1,226.36");
    expect(s.targets).toContain("$1,325");
    expect(s.targets).toContain("$1,453.95");
  });

  it("names why a plan is not executable", () => {
    expect(notExecutableReason({ ...plan, verdict: "Watch", price: 1330 })).toMatch(/already past TP1/);
    expect(notExecutableReason({ ...plan, verdict: "Watch", score: 6 })).toMatch(/Scores 6/);
    expect(notExecutableReason({ ...plan, verdict: "Watch", price: 1400, tp1: 1500 })).toMatch(/more than a day's range/);
  });

  it("renders both emails with every executable plan and a missed mover", () => {
    const focus = renderFocusEmail({ forDate: "2026-10-28", basisDate: "2026-10-27", focus: [], executable: [plan], appUrl: "https://example.com" });
    expect(focus.subject).toContain("1 executable");
    expect(focus.text).toContain("LLY Long 8/9 (not on the focus list)");

    const m = toMover({ symbol: "ZZZ", prevClose: 10, open: 10, high: 12, low: 10, close: 12 })!;
    expect(moverVerdict(m, [], [], false)).toEqual({ aligned: false, line: "Missed: no standing plan or delivered signal." });
    const recap = renderRecapEmail({
      basisDate: "2026-10-27",
      setupsFrom: "2026-10-26",
      coverage: Object.fromEntries(STAGE_KEYS.map((k) => [k, stage(k === "priceData" ? 1 : null, "test")])) as CoverageStages,
      attribution: new Map(),
      movers: [m],
      daily: [],
      intraday: [],
      focus: new Set(),
      members: new Map(),
      appUrl: "https://example.com",
    });
    expect(recap.text).toContain("ZZZ");
    expect(recap.text).toContain("not examined");
    expect(recap.text).toContain("not recorded (test)");
  });

  it("names no method, source or internal label in either email", () => {
    const focus = renderFocusEmail({
      forDate: "2026-10-28",
      basisDate: "2026-10-27",
      focus: [
        { rank: 1, symbol: "PFE", close: 29.79, plan: null, reasons: [{ kind: "big_day", signal: "seven_to_ten_bottom" }, { kind: "old_level", side: "top", level: 30.44 }] },
      ],
      executable: [plan],
      appUrl: "https://example.com",
    });
    // Built from pieces so the repo's copy check doesn't read the list itself as copy.
    const banned = new RegExp(["gan" + "n", "jen" + "sen", "her" + "metic", "cycle", "square of", "overnight chart", "over-balance", "rule of three", "3-day chart", "7-10"].join("|"), "i");
    expect(focus.text).not.toMatch(banned);
    expect(focus.html).not.toMatch(banned);
    expect(plainFocusReason({ kind: "big_day", signal: "seven_to_ten_top" })).toBe("A run of up days turned down");
    expect(plainSignalLabel("space_overbalance")).not.toMatch(banned);
    expect(plainSignalLabel("overnight_turn")).not.toMatch(banned);
  });
});

describe("one signal on the bell and the panel", () => {
  it("counts once when both carry the signal's id", () => {
    const s = { member: "m1", symbol: "META", direction: "bearish" as const, label: "old_level_cross", price: 624.63, stop: 628.17, tp1: 612.31, mtp: null };
    const out = firstDeliveries([
      { ...s, at: "2026-10-27T14:03:26Z" },
      { ...s, at: "2026-10-27T14:03:27Z", price: 624.6 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].deliveries).toBe(2);
  });
});
