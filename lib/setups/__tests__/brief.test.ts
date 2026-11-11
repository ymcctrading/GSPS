import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  buildSetupBrief,
  dailyPivots,
  isSetupBrief,
  nameLevel,
  readDecidingLine,
  readRegainedExcursion,
  type BriefInput,
  type SetupBrief,
} from "@/lib/setups/brief";
import { buildDailyCardModel, briefVoiceOf, voiced } from "@/lib/setups/card";
import { BRIEF_RULE_SOURCES, citeTrace } from "@/lib/setups/briefSources";
import { crossingLinesFromEntry, pricePoint } from "@/lib/gann/pointScale";
import { renderFocusEmail } from "@/lib/reports/eveningReport";

/** One daily bar per close, a dollar of range around it. */
function bars(closes: number[], start = "2025-06-02"): Bar[] {
  const t0 = Date.parse(`${start}T04:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1_000_000 }));
}

/**
 * The shape of BKR on 2026-11-11: old highs near $51 crossed, a run to $70,
 * a fall back under the old highs to about $46, and a bounce toward $50,
 * where the scan's sell sits just under the lost level.
 */
function bkrLike(): { input: BriefInput; daily: Bar[] } {
  const up = Array.from({ length: 60 }, (_, i) => 40 + i * 0.5); // 40 -> 69.5
  const down = Array.from({ length: 48 }, (_, i) => 69.5 - i * 0.5); // 69.5 -> 46
  const bounce = [46.5, 47.2, 48, 48.8, 49.5];
  const daily = bars([...up, ...down, ...bounce]);
  const entry = 49.81;
  const input: BriefInput = {
    symbol: "BKR",
    side: "sell",
    verdict: "Watch",
    score: 7,
    scoreMax: 9,
    stateNote: null,
    price: 49.67,
    levels: {
      entry,
      stop: 54.26,
      tp1: 44.26,
      tp2: 40.36,
      mtp: 40.36,
      entryKind: "crossing",
      entrySource: "allTime",
      entryRegained: true,
      stopBehindOldLevel: true,
    },
    trends: [
      { timeframe: "1Month", direction: "sideways" },
      { timeframe: "1Week", direction: "bearish" },
      { timeframe: "1Day", direction: "sideways" },
    ],
    daily,
    tests: null,
    campaign: null,
    setAside: null,
  };
  return { input, daily };
}

/** Every member-facing string of a brief, both voices. */
function strings(b: SetupBrief): string[] {
  const texts = [b.call, b.decidingLine, ...b.forCall, ...b.forOther, ...b.timing, b.wrongIf, b.watch, ...b.plan.map((l) => l.reason)];
  return texts.flatMap((t) => [t.plain, t.full]);
}

// Split so the copy gate doesn't read this list as copy.
const BANNED = new RegExp(
  [
    "ga" + "nn",
    "jen" + "sen",
    "de" + "wey",
    "herm" + "etic",
    "as" + "tro",
    "plane" + "tary",
    "Master " + "Course",
    "Stock " + "Tape",
    "\\b\\d+[ -]points? (past|beyond|over|under|above|below|ahead|back|behind)\\b",
    "swing " + "chart",
  ].join("|"),
  "i",
);

describe("setup brief", () => {
  it("reads BKR's shape: a sell under a lost old high, the buyer's case and the line that settles it", () => {
    const { input } = bkrLike();
    const { brief, trace } = buildSetupBrief(input, "2026-11-11T18:00:00Z");
    expect(brief.side).toBe("sell");
    expect(brief.call.plain).toMatch(/^BKR: leaning sell, worth watching, not ready yet\. 7 of 9 checks line up\./);
    // The weekly chart falling argues for the sell.
    expect(brief.forCall.some((t) => /weekly chart is falling/.test(t.plain))).toBe(true);
    // The level lost but not yet by the reversal line: the buyer's case.
    expect(brief.forOther.some((t) => /first return to an old high/.test(t.plain))).toBe(true);
    // The entry sits on an old high lost, not a low.
    const entry = brief.plan.find((l) => l.role === "entry")!;
    expect(entry.reason.plain).toContain("record high");
    // The reversal line is the lost level less 5 of its points, and it settles the call.
    const { level } = crossingLinesFromEntry(49.81, "bearish");
    const line = Math.round((level - 5 * pricePoint(level)) * 100) / 100;
    expect(brief.decide).toEqual({ callLine: line, otherLine: 54.26 });
    expect(brief.decidingLine.plain).toContain("a close over $54.26 says up");
    expect(trace.rules).toEqual(expect.arrayContaining(["fivePointReversal", "entryCrossing", "stopOldLevel"]));
    // TP2 equal to the MTP is not shown as its own level.
    expect(brief.plan.map((l) => l.role)).toEqual(["entry", "stop", "tp1", "mtp"]);
    expect(brief.wrongIf.plain).toBe("Wrong if price closes above $54.26.");
  });

  it("names no source, no rule arithmetic, in either voice", () => {
    const { input } = bkrLike();
    const variants: BriefInput[] = [
      input,
      { ...input, side: "buy", levels: { ...input.levels!, entry: 46.5, stop: 42.68, tp1: 51.12, tp2: 54.16, mtp: 58.22, entryKind: "oldLevel", entryRegained: undefined } },
      { ...input, levels: { ...input.levels!, entryAwaitsCrossing: true }, setAside: { direction: "bullish", inDoubt: true } },
      { ...input, levels: null },
    ];
    for (const v of variants) {
      const { brief } = buildSetupBrief(v, "2026-11-11T18:00:00Z");
      for (const s of strings(brief)) expect(s).not.toMatch(BANNED);
    }
  });

  it("measures how far price went past a lost level, from the last close on the old side", () => {
    const { input, daily } = bkrLike();
    const ex = readRegainedExcursion("sell", input.levels!, daily)!;
    expect(ex).not.toBeNull();
    // The low after the last close above the level is the fall's low.
    expect(ex.extreme).toBeCloseTo(45.5, 5);
    expect(ex.points).toBeGreaterThan(0);
    // Not a regained plan: nothing to read.
    expect(readRegainedExcursion("sell", { ...input.levels!, entryRegained: undefined }, daily)).toBeNull();
  });

  it("judges a close against the deciding line", () => {
    const b = { side: "sell" as const, decide: { callLine: 45.36, otherLine: 54.26 } };
    expect(readDecidingLine(b, 45)).toBe("call");
    expect(readDecidingLine(b, 55)).toBe("wrong");
    expect(readDecidingLine(b, 50)).toBe("open");
    expect(readDecidingLine({ side: "buy", decide: { callLine: null, otherLine: 42 } }, 41)).toBe("wrong");
  });

  it("names a target at a swing low on the chart", () => {
    const daily = bars([50, 49, 48, 47, 44.26 + 0.5, 47, 48, 49, 50, 51, 52]);
    expect(dailyPivots(daily).some((p) => p.kind === "low")).toBe(true);
    const named = nameLevel(44.26, daily)!;
    expect(named.rule).toBe("levelSwing");
    expect(named.text.plain).toMatch(/^the .* low$/);
  });

  it("keeps the brief on the card only for the row's own side, and voices it by tier", () => {
    const { input } = bkrLike();
    const { brief } = buildSetupBrief(input, "2026-11-11T18:00:00Z");
    const row = { symbol: "BKR", score: 7, outputState: "Watch", direction: "bearish", entry: 49.81, stopLoss: 54.26, takeProfit1: 44.26, masterProfit: 40.36 };
    expect(buildDailyCardModel({ ...row, brief }, { scoreText: "7", scoreMax: 9 }).brief).toBe(brief);
    expect(buildDailyCardModel({ ...row, direction: "bullish", brief }, { scoreText: "7", scoreMax: 9 }).brief).toBeNull();
    expect(briefVoiceOf(false)).toBe("plain");
    expect(briefVoiceOf(true)).toBe("full");
    expect(voiced(brief.call, "full")).toBe(brief.call.full);
  });

  it("round-trips through the stored row check", () => {
    const { brief } = buildSetupBrief(bkrLike().input, "2026-11-11T18:00:00Z");
    expect(isSetupBrief(JSON.parse(JSON.stringify(brief)))).toBe(true);
    expect(isSetupBrief({ version: 1 })).toBe(false);
  });

  it("has a citation for every rule id, and none names a source", () => {
    for (const [rule, source] of Object.entries(BRIEF_RULE_SOURCES)) {
      expect(source.length, rule).toBeGreaterThan(0);
      expect(source).not.toMatch(BANNED);
    }
    expect(citeTrace(["fivePointReversal"])).toEqual([{ rule: "fivePointReversal", source: BRIEF_RULE_SOURCES.fivePointReversal }]);
  });

  it("carries the brief into the watch-for-tomorrow email", () => {
    const { brief } = buildSetupBrief(bkrLike().input, "2026-11-11T18:00:00Z");
    const plan = {
      symbol: "BKR",
      direction: "bearish" as const,
      verdict: "Execute" as const,
      score: 7,
      entry: 49.81,
      stop: 54.26,
      tp1: 44.26,
      mtp: 40.36,
      price: 49.67,
      dayRange: 2,
      entryAwaitsCrossing: false,
      brief,
    };
    const email = renderFocusEmail({ forDate: "2026-11-12", basisDate: "2026-11-11", focus: [], executable: [plan], appUrl: "https://example.test" });
    expect(email.text).toContain("What settles it:");
    expect(email.text).toContain("For the buy:");
    expect(email.text).toContain("Why these levels:");
    expect(email.html).toContain("Wrong if:");
    expect(email.text).not.toMatch(BANNED);
  });
});

describe("setup brief at the API boundary", () => {
  it("keeps the brief for members, strips the trace, and gives an anonymous viewer neither", async () => {
    const { redactScanResult, toAnonymousScanResult } = await import("@/lib/scoring/public-summary");
    const { brief, trace } = buildSetupBrief(bkrLike().input, "2026-11-11T18:00:00Z");
    const result = {
      symbol: "BKR",
      assetClass: "us_equity",
      scannedAt: "2026-11-11T18:00:00Z",
      currentPrice: 49.67,
      direction: "bearish",
      setupKind: "reversion",
      momentumElevated: false,
      trends: [],
      gann: undefined,
      pattern: null,
      armedPatterns: [],
      levels: null,
      decision: { score: 7, outputState: "Watch", breakdown: [] },
      brief,
      briefTrace: trace,
    } as unknown as import("@/lib/types").ScanResult;
    const member = JSON.parse(JSON.stringify(redactScanResult(result)));
    expect(member.brief).toEqual(brief);
    expect(member.briefTrace).toBeUndefined();
    const anon = JSON.parse(JSON.stringify(toAnonymousScanResult(result)));
    expect(anon.brief).toBeUndefined();
    expect(anon.briefTrace).toBeUndefined();
  });
});

describe("setup brief review fixes (2026-11-11)", () => {
  it("joins a brief to a card only when it prices the same four levels", async () => {
    const { briefMatchesLevels } = await import("@/lib/setups/card");
    const { withDailyScanRange } = await import("@/lib/dashboard/trackedExecute");
    const { brief } = buildSetupBrief(bkrLike().input, "2026-11-11T18:00:00Z");
    expect(briefMatchesLevels(brief, { entry: 49.81, stop: 54.26, tp1: 44.26, mtp: 40.36 })).toBe(true);
    expect(briefMatchesLevels(brief, { entry: 49.81, stop: 54.1, tp1: 44.26, mtp: 40.36 })).toBe(false);
    const tracked = { symbol: "BKR", direction: "bearish", patternName: null, score: 7, outputState: "Execute", executeScore: 7, executeOutputState: "Execute", entry: 49.81, stopLoss: 54.1, takeProfit1: 44.26, masterProfit: 40.36 };
    const scan = { symbol: "BKR", direction: "bearish", currentPrice: 49.67, dayRange: 2, brief };
    expect(withDailyScanRange([tracked], [scan])[0].brief).toBeUndefined();
    expect(withDailyScanRange([{ ...tracked, stopLoss: 54.26 }], [scan])[0].brief).toBe(brief);
  });

  function bearCampaign(days: number): BriefInput["campaign"] {
    return { trend: "bearish", legs: [], greatestCounterMove: null, currentCounterMove: { points: 3, pct: 6, days }, spaceOverbalanced: false };
  }

  it("dates the 4-week mark ahead while a rally is young, and turns it into a point once it has passed", () => {
    const { input } = bkrLike();
    const young = buildSetupBrief({ ...input, campaign: bearCampaign(10) }, "2026-11-11T18:00:00Z").brief;
    expect(young.timing.some((t) => /up to 4 weeks/.test(t.plain))).toBe(true);
    expect(young.wrongIf.plain).toMatch(/or if this bounce is still holding on/);
    const old = buildSetupBrief({ ...input, campaign: bearCampaign(40) }, "2026-11-11T18:00:00Z").brief;
    expect(old.timing.some((t) => /up to 4 weeks/.test(t.plain))).toBe(false);
    expect(old.wrongIf.plain).toBe("Wrong if price closes above $54.26.");
    expect(old.forOther.some((t) => /past the 4 weeks/.test(t.plain))).toBe(true);
  });
});
