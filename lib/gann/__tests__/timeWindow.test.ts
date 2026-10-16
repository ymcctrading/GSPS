import { describe, expect, it } from "vitest";
import fs from "node:fs";
import type { Bar, ScanDecision } from "@/lib/types";
import { applyTimeWindowHold } from "@/lib/scoring/score";
import { readWindowTurn, timeWindowsAt, type WindowsAt } from "@/lib/gann/timeWindow";
import { CRITERION_KEYS } from "@/lib/scoring/weights";

// Q19 (owner: "Window"): A-TIME-15, W036 p.22, "when the market turns close to
// a forecast date, buy or sell", with C-STOP-03's "time alone is not enough":
// a dated window acts only together with a price turn, the swing extreme the
// plan's stop sits behind.

const DAY = 86_400_000;
function days(closes: number[], start = "2026-03-02"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}
// Down to a bottom on day 6 (2026-03-08), then up through the old top.
const closes = [110, 108, 106, 104, 102, 100, 98, 100, 102, 104, 106, 108, 110, 112];
const bars = days(closes);

describe("readWindowTurn", () => {
  it("finds the swing bottom a long's stop sits behind and the windows open on its date", () => {
    const seen: string[] = [];
    const at: WindowsAt = (_b, date, kind) => {
      seen.push(`${date}:${kind}`);
      return date === "2026-03-08" ? ["a test window"] : [];
    };
    const turn = readWindowTurn(bars, "bullish", null, at);
    expect(turn).toEqual({ kind: "bottom", date: "2026-03-08", price: 97.5, windows: ["a test window"] });
    expect(seen).toEqual(["2026-03-08:bottom"]);
  });

  it("reads only the bars through the turn, so nothing after it decides", () => {
    let length = 0;
    readWindowTurn(bars, "bullish", null, (b) => {
      length = b.length;
      return [];
    });
    expect(length).toBe(7);
  });

  it("is null when no window is open on the turn's date", () => {
    expect(readWindowTurn(bars, "bullish", null, () => [])).toBeNull();
  });

  it("mirrors for a short, at the swing top", () => {
    const up = days(closes.map((c) => 220 - c));
    const turn = readWindowTurn(up, "bearish", null, (_b, date, kind) => (kind === "top" ? [`${date}`] : []));
    expect(turn?.kind).toBe("top");
    expect(turn?.date).toBe("2026-03-08");
  });
});

describe("timeWindowsAt", () => {
  it("names the pivot windows of the turn's polarity only", () => {
    // A major low, then a bottom 90 days later: the 90-day wheel count from a low.
    const t0 = Date.parse("2025-10-01T00:00:00Z");
    const series: Bar[] = Array.from({ length: 200 }, (_, i) => {
      const c = 100 + 10 * Math.sin(i / 8) - (i === 60 ? 15 : 0);
      return { t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
    });
    const turnAt = series.slice(0, 151);
    const date = turnAt[150].t.slice(0, 10);
    const lows = timeWindowsAt(turnAt, date, "bottom");
    const highs = timeWindowsAt(turnAt, date, "top");
    expect(lows.some((w) => /low/.test(w))).toBe(true);
    expect(highs.every((w) => !/time window from a major low/.test(w))).toBe(true);
  });
});

describe("applyTimeWindowHold", () => {
  const execute: ScanDecision = { score: 8, outputState: "Execute", breakdown: [] };

  it("holds a counter-trend Execute to Watch with no turn at a dated window", () => {
    const held = applyTimeWindowHold(execute, "reversion", null);
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)?.key).toBe("timeWindowTurn");
  });

  it("lets it through when the turn came at a window", () => {
    const turn = { kind: "bottom" as const, date: "2026-03-08", price: 97.5, windows: ["a window"] };
    expect(applyTimeWindowHold(execute, "reversion", turn).outputState).toBe("Execute");
  });

  it("leaves a with-trend setup and anything short of Execute alone", () => {
    expect(applyTimeWindowHold(execute, "continuation", null)).toBe(execute);
    const watch: ScanDecision = { ...execute, outputState: "Watch" };
    expect(applyTimeWindowHold(watch, "reversion", null)).toBe(watch);
  });

  it("is applied by the live scan and the replay alike", () => {
    for (const f of ["lib/scanTicker.ts", "lib/backtest/replay.ts"]) {
      expect(fs.readFileSync(f, "utf8")).toMatch(/applyTimeWindowHold\(/);
    }
  });
});

// C-ASTRO-15 (owner, 2026-10-16): an astro or Jensen/planetary window may count
// toward the hold only alongside a price turn, never alone.
describe("astro windows never decide the hold alone (C-ASTRO-15)", () => {
  const execute: ScanDecision = { score: 8, outputState: "Execute", breakdown: [] };
  const astroOnly = ["a New Moon", "Mars opposite its place at the major low", "the Sun at 90°", "a Jensen date"];

  // A straight fall has no 3-Day Chart bottom for a long's stop to sit behind,
  // and a straight rise no top for a short's: no price turn at all.
  const falling = days(Array.from({ length: 30 }, (_, i) => 130 - i));
  const rising = days(Array.from({ length: 30 }, (_, i) => 100 + i));

  for (const [label, series, direction] of [
    ["a long", falling, "bullish"],
    ["a short", rising, "bearish"],
  ] as const) {
    it(`leaves the verdict where no window would when ${label} has no price turn`, () => {
      let asked = 0;
      const astro: WindowsAt = () => {
        asked++;
        return astroOnly;
      };
      expect(readWindowTurn(series, direction, null, astro)).toBeNull();
      expect(asked).toBe(0);
      const withAstro = applyTimeWindowHold(execute, "reversion", () => readWindowTurn(series, direction, null, astro));
      const withNone = applyTimeWindowHold(execute, "reversion", () => readWindowTurn(series, direction, null, () => []));
      expect(withAstro).toEqual(withNone);
      expect(withAstro.outputState).toBe("Watch");
    });
  }

  it("asks for windows only on a price turn's own date", () => {
    const seen: string[] = [];
    const turn = readWindowTurn(bars, "bullish", null, (_b, date) => {
      seen.push(date);
      return astroOnly;
    });
    // The only date read is the 3-Day Chart's bottom, and the turn carries its price.
    expect(seen).toEqual(["2026-03-08"]);
    expect(turn).toMatchObject({ kind: "bottom", date: "2026-03-08", price: 97.5 });
  });

  it("does not hold a with-trend setup from astro windows, which act there on price alone", () => {
    expect(applyTimeWindowHold(execute, "continuation", () => readWindowTurn(rising, "bullish", null, () => astroOnly))).toBe(execute);
  });

  it("puts no astro, planetary or Jensen reading among the scored criteria", () => {
    for (const k of CRITERION_KEYS) expect(k).not.toMatch(/astro|planet|lunar|moon|sun|mars|jensen/i);
  });
});

// A-TIME-11 (W006 pp.49-50, "about every 20 years"; owner: it acts through
// the time-window hold). The yearly counts are read on the monthly chart,
// since every anchor on the scans' year of daily bars is under a year old.
describe("the yearly cycle counts reach the hold through the monthly chart (A-TIME-11)", () => {
  const execute: ScanDecision = { score: 8, outputState: "Execute", breakdown: [] };
  // Flat months from 2005 with one major low in March 2006, 240 months before
  // the 3-Day Chart bottom of 2026-03-08.
  const monthly: Bar[] = Array.from({ length: 21 * 12 + 2 }, (_, i) => {
    const y = 2005 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    const c = y === 2006 && m === 3 ? 60 : 100;
    return { t: `${y}-${String(m).padStart(2, "0")}-01T05:00:00.000Z`, o: c, h: c + 1, l: c - 1, c, v: 1e6 };
  });

  it("opens a 20-year window on the turn from the major low 240 months back", () => {
    const turn = readWindowTurn(bars, "bullish", monthly);
    expect(turn?.date).toBe("2026-03-08");
    expect(turn?.windows).toContain("20 years from the 2006-03 major low");
    expect(applyTimeWindowHold(execute, "reversion", turn).outputState).toBe("Execute");
  });

  it("decides the hold: with only the yearly counts read, the setup acts with the monthly chart and is held without it", () => {
    // The short daily fixture opens other windows on its own; keep the yearly counts only.
    const yearly: WindowsAt = (b, d, k, m) => timeWindowsAt(b, d, k, m).filter((w) => / years? from the \d{4}-\d{2} major /.test(w));
    const withMonthly = readWindowTurn(bars, "bullish", monthly, yearly);
    expect(withMonthly?.windows).toEqual(["20 years from the 2006-03 major low"]);
    expect(applyTimeWindowHold(execute, "reversion", withMonthly).outputState).toBe("Execute");
    expect(readWindowTurn(bars, "bullish", null, yearly)).toBeNull();
    expect(applyTimeWindowHold(execute, "reversion", () => readWindowTurn(bars, "bullish", null, yearly)).outputState).toBe("Watch");
  });

  it("reads a major low only for a long's bottom, not a short's top", () => {
    const up = days(closes.map((c) => 220 - c));
    const turn = readWindowTurn(up, "bearish", monthly);
    expect(turn?.windows ?? []).not.toContain("20 years from the 2006-03 major low");
  });

  it("reads only months closed before the turn's month", () => {
    let seen: Bar[] | null | undefined;
    readWindowTurn(bars, "bullish", [...monthly, { ...monthly[0], t: "2026-03-01T05:00:00.000Z" }], (_b, _d, _k, m) => {
      seen = m;
      return [];
    });
    expect(seen?.at(-1)?.t.slice(0, 7)).toBe("2026-02");
  });

  it("passes the longest monthly chart held on the live scan and the replay alike", () => {
    for (const f of ["lib/scanTicker.ts", "lib/backtest/replay.ts"]) {
      expect(fs.readFileSync(f, "utf8")).toMatch(/readWindowTurn\(charts\.daily, \w+, (instrument\?\.)?monthlyLong \?\? charts\.monthly\)/);
    }
  });
});
