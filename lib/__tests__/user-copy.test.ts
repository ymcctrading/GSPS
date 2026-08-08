/**
 * The behavioural half of the terminology gate.
 *
 * scripts/check-banned-terms.mjs scans source text; this exercises the code
 * paths that *build* user-facing strings and inspects what they actually
 * produce. That distinction is the whole point: the strings that regressed
 * twice ("Gann fan angle proximity", "Strat pattern armed") are assembled at
 * runtime in lib/scoring/score.ts, so nothing about a component's source told
 * you what the checklist would say.
 *
 * Every branch that can reach the screen contributes a string here, and the
 * pattern coverage assertion fails if a new pattern name is added without its
 * description being checked.
 */

import { describe, expect, it } from "vitest";
import type { Bar, GannLevels, StratPattern, TradeLevels, TrendReading } from "@/lib/types";
import { applyReversionConfirmation, computeScore, type ScoreInputs } from "@/lib/scoring/score";
import { detectPatterns } from "@/lib/strat/patterns";
import { computeTradeLevels } from "@/lib/strat/levels";

/**
 * How the terms read in prose. Matching is case-insensitive here — unlike the
 * static scan, nothing in this corpus is an identifier, so there is no reason
 * to be lenient about casing.
 */
const BANNED = [
  /\bgann\b/i,
  /\bstrat\b/i,
  /\bsquare[ -]of[ -](9|nine)\b/i,
  /\bs9\b/i,
  /\bsara\b/i,
  /\bsniper\b/i,
  /\bpivot machine gun\b/i,
  /\b2-(up|down) bar\b/i,
];

function expectPlainLanguage(strings: string[]) {
  const offenders = strings.flatMap((text) => {
    const hit = BANNED.find((pattern) => pattern.test(text));
    return hit ? [`${hit} → ${text}`] : [];
  });
  expect(offenders).toEqual([]);
}

function bar(o: number, h: number, l: number, c: number): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v: 1000 };
}

const trend = (direction: TrendReading["direction"]): TrendReading => ({
  timeframe: "1Day",
  direction,
  support: [90],
  resistance: [110],
});

const gann: GannLevels = {
  fanLines: [{ angle: "1x4 (high)", price: 101, distancePct: 0.4 }],
  squareOf9: [{ degree: 45, price: 100.5, distancePct: 0.2 }],
  timeCycleActive: true,
  timeCycleDates: ["2026-08-06"],
};

const levels: TradeLevels = {
  entry: 100,
  stopLoss: 85,
  takeProfit1: 130,
  takeProfit2: 145,
  masterProfit: 145,
  riskPerShare: 15,
  rewardToRiskTp1: 2,
  rewardToRiskTp2: 3,
  rewardToRiskMaster: 3,
  masterFromStructure: true,
  stopPctOfPrice: 15,
  stopBandWarning: null,
};

const pattern: StratPattern = {
  name: "2-2",
  direction: "bullish",
  triggerPrice: 100,
  stopPrice: 95,
  description: "",
};

/** Every criterion passing — exercises the affirmative half of each note. */
const allPass: ScoreInputs = {
  direction: "bullish",
  macroTrends: [trend("bearish"), trend("bearish"), trend("bearish")],
  hourlyTrend: trend("bullish"),
  gann,
  nearSupportResistance: true,
  pattern,
  momentumElevated: true,
  levels,
};

/** Every criterion failing — exercises the negative half. */
const allFail: ScoreInputs = {
  direction: "bullish",
  macroTrends: [trend("bullish"), trend("bullish"), trend("bullish")],
  hourlyTrend: trend("bearish"),
  gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
  nearSupportResistance: false,
  pattern: null,
  momentumElevated: false,
  levels: null,
};

function checklistStrings(inputs: ScoreInputs): string[] {
  return computeScore(inputs).breakdown.flatMap((item) => [item.criterion, item.note]);
}

describe("confluence checklist copy", () => {
  it("reads in plain language when every criterion passes", () => {
    expectPlainLanguage(checklistStrings(allPass));
  });

  it("reads in plain language when every criterion fails", () => {
    expectPlainLanguage(checklistStrings(allFail));
  });

  it("reads in plain language on every turn-window phrasing", () => {
    // The note branches on both whether a window is active and whether any
    // dates were projected, so all four combinations carry distinct copy.
    const dated = gann.timeCycleDates;
    for (const timeCycleActive of [true, false]) {
      for (const timeCycleDates of [dated, []]) {
        expectPlainLanguage(
          checklistStrings({ ...allPass, gann: { ...gann, timeCycleActive, timeCycleDates } }),
        );
      }
    }
  });

  it("reads in plain language on both continuation branches", () => {
    // The macro criterion and the pattern criterion both reword themselves for
    // a continuation, so those four strings are outside the corpus above.
    const withTrend: ScoreInputs = {
      ...allPass,
      setupKind: "continuation",
      macroTrends: [trend("bullish"), trend("bullish"), trend("bullish")],
    };
    expectPlainLanguage(checklistStrings(withTrend));
    expectPlainLanguage(checklistStrings({ ...allFail, setupKind: "continuation" }));
  });

  it("reads in plain language on the downgrade note", () => {
    const decision = applyReversionConfirmation(computeScore(allPass), pattern, false, false);
    expectPlainLanguage(decision.breakdown.flatMap((item) => [item.criterion, item.note]));
  });

  it("covers every criterion in both directions", () => {
    // Guards the two fixtures above: if a criterion stops flipping, one of the
    // branches silently drops out of the corpus.
    expect(computeScore(allPass).score).toBe(9);
    expect(computeScore(allFail).score).toBe(0);
  });
});

describe("pattern descriptions", () => {
  // Series lifted from strat.test.ts, where each is asserted to arm the named
  // pattern, plus the two variants that file does not cover.
  const series: Bar[][] = [
    // 2-1-2 bullish: 2U then an inside bar.
    [bar(99, 104, 94, 100), bar(100, 105, 95, 102), bar(102, 110, 100, 108), bar(107, 109, 104, 106)],
    // 2-1-2 bearish: 2D then an inside bar.
    [bar(99, 104, 94, 100), bar(100, 105, 95, 102), bar(102, 104, 90, 92), bar(95, 100, 92, 96)],
    // 3-1-2, both directions: an outside bar then an inside bar.
    [bar(101, 111, 91, 106), bar(100, 110, 90, 105), bar(99, 115, 85, 110), bar(100, 110, 90, 105)],
    // Bare 2-2 reversal.
    [bar(99, 104, 94, 100), bar(100, 105, 95, 102), bar(101, 106, 97, 104), bar(104, 112, 100, 111)],
    // 1-2-2: an inside bar precedes the trigger bar.
    [bar(98, 112, 88, 100), bar(100, 110, 90, 105), bar(102, 108, 95, 100), bar(99, 107, 88, 90)],
    // 3-2-2: an outside bar precedes the trigger bar.
    [bar(101, 111, 91, 106), bar(100, 110, 90, 105), bar(99, 115, 85, 110), bar(110, 120, 108, 118)],
    // PMG bullish: consecutive lower highs.
    [
      bar(110, 120, 105, 108), bar(108, 118, 103, 106), bar(106, 116, 101, 104),
      bar(104, 114, 99, 102), bar(102, 112, 97, 100), bar(100, 110, 95, 98),
    ],
    // PMG bearish: consecutive higher lows.
    [
      bar(100, 110, 95, 98), bar(102, 112, 97, 100), bar(104, 114, 99, 102),
      bar(106, 116, 101, 104), bar(108, 118, 103, 106), bar(110, 120, 105, 108),
    ],
  ];

  const armed = series.flatMap((bars) => detectPatterns(bars));

  it("covers every pattern name and both directions", () => {
    const names: StratPattern["name"][] = ["2-1-2", "2-2", "1-2-2", "3-2-2", "3-1-2", "PMG"];
    expect([...new Set(armed.map((p) => p.name))].sort()).toEqual([...names].sort());
    expect([...new Set(armed.map((p) => p.direction))].sort()).toEqual(["bearish", "bullish"]);
  });

  it("describes every armed setup in plain language", () => {
    expect(armed.length).toBeGreaterThan(0);
    expectPlainLanguage(armed.map((p) => p.description));
  });
});

describe("trade level messages", () => {
  it("phrases every stop advisory in plain language", () => {
    const p = { ...pattern, triggerPrice: 100, stopPrice: 99 };
    const prev = bar(98, 101, 96, 99);
    const warnings = [
      computeTradeLevels(p, prev, [], 10).stopBandWarning, // under the premium band
      computeTradeLevels(p, prev, [], 4).stopBandWarning, // over the premium band
      computeTradeLevels(p, prev, [], undefined, 0.2).stopBandWarning, // wide vs volatility
    ];
    expect(warnings.every((w) => typeof w === "string")).toBe(true);
    expectPlainLanguage(warnings as string[]);
  });

  it("phrases the reachable rejection error in plain language", () => {
    // Surfaces verbatim on the ticker page as `levelsError`.
    //
    // Only the zero-risk guard is reachable. The other two invariants — TP1
    // beyond entry, master profit beyond TP1 — are assertions against corrupt
    // input that the target derivation makes unreachable for any pattern with
    // non-zero risk, which is what the sibling test below pins down. Listing
    // them here with fixtures that quietly fail to throw would claim coverage
    // this test does not have.
    let message: string | null = null;
    try {
      computeTradeLevels({ ...pattern, triggerPrice: 100, stopPrice: 100 }, bar(98, 101, 96, 99), []);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/no risk to size against/);
    expectPlainLanguage([message!]);
  });

  it("keeps the ordering invariants unreachable across a sweep of setups", () => {
    // If a future change lets one of those errors fire, it becomes user-facing
    // copy and this test is where that shows up first.
    for (const direction of ["bullish", "bearish"] as const) {
      for (const risk of [0.01, 0.5, 5, 40]) {
        for (const previousExtreme of [70, 96, 101, 130]) {
          const dir = direction === "bullish" ? 1 : -1;
          const levels = computeTradeLevels(
            { ...pattern, direction, triggerPrice: 100, stopPrice: 100 - dir * risk },
            bar(98, previousExtreme, previousExtreme, 99),
            [102, 133, 140],
          );
          expect(dir * (levels.takeProfit1 - levels.entry)).toBeGreaterThan(0);
          expect(dir * (levels.masterProfit - levels.takeProfit1)).toBeGreaterThan(0);
        }
      }
    }
  });
});
