/**
 * Graduation exams: the practical test a student passes in their tier's
 * sandbox to show they can apply what they learned (project owner,
 * 2026-09-28). One for Novice -> Pro, one for Pro -> Expert, each required on
 * every promotion path for its transition (`lib/promotion/curriculumPolicy.ts`).
 * Expert -> Wall Street keeps the Academy 8 capstone instead.
 *
 * Each exam is a set of scenarios on real past charts: a symbol and a date,
 * with the chart shown up to that date only. The student reads the trend,
 * decides whether there is a trade, and (when there is) picks where the stop
 * goes, sizes the position and, for Pro, picks the entry. Answers are graded on
 * the server against the platform's own rules applied to the same bars
 * (`readGannTrend`, `computeGannEntryTrigger`), never on whether the trade
 * made money: a correct trade can lose and a careless one can win. After
 * grading, each scenario plays forward so the student sees what happened, as
 * a lesson, not a mark.
 *
 * Design choices, labelled as such: five scenarios; a pass is 80% of the
 * graded items; a failed attempt can be retaken after `RETAKE_HOURS`; dates
 * are drawn from 2021 up to four months ago so a play-forward exists; the
 * account for the sizing question is $10,000 risking 1%.
 *
 * Three-question basis:
 * 1. Gann: the rules graded are his (trend from swing charts and the
 *    structure of tops and bottoms; after a close 3 points past the old top,
 *    buy the reaction 1 point above it with the stop 3 points below it (PLAN.md
 *    item 4); risk a small, fixed part of capital),
 *    Tier A, as implemented in `lib/gann/`.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect (the grade follows the decision's cause, the
 *    rule applied, not its effect, the P&L, which is shown separately) and
 *    Polarity (the novice and the professional exams are two poles of one
 *    test, each complete at its level, not one exam with parts removed).
 */

import type { Bar } from "@/lib/types";
import { monthlyWithCurrent } from "@/lib/gann/leadership";
import { readGannTrend } from "@/lib/gann/trendStrength";
import { gannBreakLine, sameGannLevel, type GannEntryTrigger, type OlderGannLevel } from "@/lib/gann/entryTrigger";
import { priorYearLevelName, regainedLevelName } from "@/lib/scoring/direction-copy";
import { entryChart, gannEntryOf, trendsFromBars } from "@/lib/scan/entrySelection";

export type ExamTransition = "novice_to_pro" | "pro_to_expert";
export const EXAM_TRANSITIONS: readonly ExamTransition[] = ["novice_to_pro", "pro_to_expert"];

export const SCENARIOS_PER_EXAM = 5;
export const PASS_MARK = 0.8;
export const RETAKE_HOURS = 24;
export const ACCOUNT_USD = 10_000;
export const RISK_PCT = 1;
export const PLAYBACK_BARS = 30;

export const SCENARIO_SYMBOLS = [
  "AAPL", "MSFT", "JPM", "XOM", "KO", "HD", "CAT", "PG", "V", "UNH",
  "NVDA", "AMZN", "GOOGL", "WMT", "DIS", "MRK", "CVX", "BA", "NKE", "COST",
] as const;

export type Trend = "up" | "down" | "sideways";
export type Decision = "trade" | "wait";

export interface ExamChoice {
  id: string;
  price: number;
}

/** A level drawn on the exam's chart. */
export interface ExamLevel {
  price: number;
  label: string;
}

/** What the student sees. */
export interface ScenarioView {
  symbol: string;
  asOf: string;
  /** The 52 weeks of sessions before the day, the window the scan reads (step 3 review R6). */
  bars: { t: string; o: number; h: number; l: number; c: number }[];
  /**
   * The older levels nearest the price, drawn as lines: up to two above and
   * two below, each previous year's top or bottom by its year and the record
   * before the 52 weeks (step 3 review R6). Drawn on every chart, whatever
   * the answer, so their presence reveals nothing. Absent on scenarios stored
   * before it was added.
   */
  levels?: ExamLevel[];
  /** Always offered, whatever the answer, so their presence reveals nothing. */
  entryChoices: ExamChoice[];
  stopChoices: ExamChoice[];
}

/** The answer key, kept on the server with the attempt. */
export interface ScenarioKey {
  trend: Trend;
  decision: Decision;
  direction: "bullish" | "bearish" | null;
  entryChoiceId: string | null;
  stopChoiceId: string | null;
  entry: number | null;
  stop: number | null;
  /** Correct share count for the sizing question. */
  shares: number | null;
  /**
   * The old level was already crossed before the date and still holds, so
   * the order rests for the reaction from the first session (PLAN.md item 5).
   * Absent on scenarios stored before it was added.
   */
  crossed?: boolean;
  /**
   * `oldLevel` when the buy rests at an old bottom (top) that held, a double
   * or triple bottom (PLAN.md item 5, step 2), so the explanations describe
   * that entry. `hold` when the buy is at the last close over a bottom (top)
   * that held (step 4). Absent is the crossing, and on scenarios stored
   * before it.
   */
  entryKind?: "oldLevel" | "hold";
  /** For `hold`: which rule found the bottom that held, so the explanation names it. */
  holdBasis?: "weeks" | "days" | "record" | "rally";
  /**
   * For a crossing of the previous year's top or bottom, or the record from
   * before the last 52 weeks (PLAN.md item 5, step 3), so the explanation
   * names it. Absent is the last swing.
   */
  source?: "priorYear" | "allTime";
  /** With `source` "priorYear": the year whose top or bottom was crossed (step 3 review R9). */
  levelYear?: number;
  /** The crossing regained an old bottom (lost an old top, for a short) after a 3-point break (A-TREND-10). */
  regained?: true;
}

export interface StoredScenario {
  view: ScenarioView;
  key: ScenarioKey;
  playback: { t: string; h: number; l: number; c: number }[];
}

export interface ScenarioAnswer {
  trend?: Trend;
  decision?: Decision;
  entryChoiceId?: string;
  stopChoiceId?: string;
  shares?: number;
}

export interface ItemResult {
  item: "trend" | "decision" | "entry" | "stop" | "size";
  correct: boolean;
  explanation: string;
}

export interface ScenarioResult {
  items: ItemResult[];
  /** What happened next, shown after grading. Not part of the grade. */
  playedOut: string;
}

export interface ExamGrade {
  score: number;
  passed: boolean;
  scenarios: ScenarioResult[];
}

/** A small deterministic PRNG so an attempt's scenarios can be reproduced. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Symbols and dates for one attempt. */
export function pickScenarioSeeds(seed: number, now: Date, n = SCENARIOS_PER_EXAM): { symbol: string; asOf: string }[] {
  const rand = rng(seed);
  const start = Date.UTC(2021, 0, 4);
  const end = now.getTime() - 120 * 86_400_000;
  const used = new Set<string>();
  const out: { symbol: string; asOf: string }[] = [];
  while (out.length < n) {
    const symbol = SCENARIO_SYMBOLS[Math.floor(rand() * SCENARIO_SYMBOLS.length)];
    if (used.has(symbol)) continue;
    used.add(symbol);
    const d = new Date(start + Math.floor(rand() * (end - start)));
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    out.push({ symbol, asOf: d.toISOString().slice(0, 10) });
  }
  return out;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function relabel(xs: ExamChoice[], prefix: string): ExamChoice[] {
  return xs.map((x, i) => ({ id: `${prefix}${i + 1}`, price: x.price }));
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The older level an exam key rests on, which the chart has to draw: the
 * previous year's level or the record crossed, or the record low that held,
 * whose stop is 3 points under it (step 3 review R6, step 4 review S7).
 */
export function examKeyedOlderLevel(trigger: GannEntryTrigger): number | null {
  if (trigger.kind === "crossing" && trigger.source !== "swing") return trigger.level;
  if (trigger.kind === "hold" && trigger.holdBasis === "record") return trigger.level;
  return null;
}

/**
 * Build one scenario from daily bars around `asOf`. Only bars dated before
 * `asOf` feed the chart and the key; bars from `asOf` on are the play-forward.
 */
export function buildScenario(
  symbol: string,
  asOf: string,
  daily: Bar[],
  seed: number,
  /** The monthly chart up to `asOf`: the previous year's and the record levels (PLAN.md item 5, step 3). */
  monthly: Bar[] = [],
): StoredScenario | null {
  const before = daily.filter((b) => b.t.slice(0, 10) < asOf);
  const after = daily.filter((b) => b.t.slice(0, 10) >= asOf).slice(0, PLAYBACK_BARS);
  if (before.length < 60 || after.length < 5) return null;
  const rand = rng(seed);

  const read = readGannTrend(before);
  const direction = read.direction;
  const trend: Trend = direction === "bullish" ? "up" : direction === "bearish" ? "down" : "sideways";
  // The buying point production prices from (PLAN.md item 5, step 2).
  // Read from the scan's own window, the 52 weeks of sessions before the day,
  // with the monthly chart's older levels.
  const chart = entryChart(daily, monthly, asOf);
  // Priced as the scan prices it, the rally sale only in a bear market (A-ENTRY-18).
  // Closed months before the day's month plus that month so far from the
  // sessions shown: the month's own bar would include sessions after the day.
  const trends = trendsFromBars(before, monthly.length > 0 ? monthlyWithCurrent(monthly, before) : []);
  const trigger = direction ? gannEntryOf(chart.bars, chart.older, trends)(direction) : null;
  const last = before[before.length - 1];
  // A trade when the old level is still to be crossed, or when it has been
  // crossed and holds, so the buy rests for the reaction (PLAN.md item 5).
  const decision: Decision =
    trigger &&
    (trigger.held ||
      // A double or triple bottom rests at the old level, below the price.
      trigger.kind === "oldLevel" ||
      // A bottom that held is bought at the last close (step 4).
      trigger.kind === "hold" ||
      (direction === "bullish" ? trigger.triggerPrice > last.c : trigger.triggerPrice < last.c))
      ? "trade"
      : "wait";

  let entryChoices: ExamChoice[] = [];
  let stopChoices: ExamChoice[] = [];
  let entryChoiceId: string | null = null;
  let stopChoiceId: string | null = null;
  let entry: number | null = null;
  let stop: number | null = null;
  let shares: number | null = null;
  if (decision === "trade" && trigger) {
    const long = direction === "bullish";
    // The reaction buy after the crossing (PLAN.md item 4): 1 point past the
    // old level, stop 3 points the other side. Or the old bottom itself, stop
    // 3 points under it (a double or triple bottom, item 5 step 2). Or the
    // last close over a bottom that held, stop 3 points under the low (step 4).
    entry = round2(trigger.reactionEntry);
    stop = round2(trigger.reactionStop);
    const e = [
      { id: "e1", price: entry },
      trigger.kind === "hold"
        ? // Chasing 3% past the close, away from the low that held.
          { id: "e2", price: round2(long ? last.c * 1.03 : last.c * 0.97) }
        : // Buying at today's close instead of waiting for the reaction to the level.
          { id: "e2", price: round2(last.c) },
      // 3% the wrong side of the level: before a crossing proves itself, or
      // after an old bottom has already given way.
      { id: "e3", price: round2(long ? trigger.pivot.price * 0.97 : trigger.pivot.price * 1.03) },
    ];
    const s = [
      { id: "s1", price: stop },
      // Inside the day's noise: too tight to survive an ordinary reaction.
      { id: "s2", price: round2(long ? entry * 0.995 : entry * 1.005) },
      // Far beyond any level: risks far more than the setup needs.
      { id: "s3", price: round2(long ? entry * 0.8 : entry * 1.2) },
    ];
    // Shuffled, then relabelled by position, so an id says nothing about which is right.
    entryChoices = relabel(shuffle(e, rand), "e");
    stopChoices = relabel(shuffle(s, rand), "s");
    entryChoiceId = entryChoices.find((x) => x.price === entry)?.id ?? null;
    stopChoiceId = stopChoices.find((x) => x.price === stop)?.id ?? null;
    const riskPerShare = Math.abs(entry - stop);
    shares = riskPerShare > 0 ? Math.floor((ACCOUNT_USD * RISK_PCT) / 100 / riskPerShare) : null;
  } else {
    // Offer the same kinds of choices when the answer is "wait", so the
    // presence of choices can't give the answer away. They aren't graded.
    const c = last.c;
    entryChoices = relabel(shuffle([{ id: "", price: round2(c * 1.02) }, { id: "", price: round2(c) }, { id: "", price: round2(c * 0.97) }], rand), "e");
    stopChoices = relabel(shuffle([{ id: "", price: round2(c * 0.95) }, { id: "", price: round2(c * 0.995) }, { id: "", price: round2(c * 0.8) }], rand), "s");
  }

  // The older levels near the price, drawn on every chart. A key resting on
  // an older level the chart would not show is not set (step 3 review R6).
  const levels = examLevels(chart.older, last.c);
  const keyedOlder = decision === "trade" && trigger ? examKeyedOlderLevel(trigger) : null;
  if (keyedOlder !== null && !levels.some((l) => sameGannLevel(l.price, keyedOlder))) return null;

  return {
    view: {
      symbol,
      asOf,
      bars: chart.bars.map((b) => ({ t: b.t.slice(0, 10), o: b.o, h: b.h, l: b.l, c: b.c })),
      levels,
      entryChoices,
      stopChoices,
    },
    key: {
      trend, decision, direction, entryChoiceId, stopChoiceId, entry, stop, shares,
      crossed: decision === "trade" && (trigger?.held === true || trigger?.kind === "oldLevel" || trigger?.kind === "hold"),
      ...(decision === "trade" && trigger?.kind === "oldLevel" ? { entryKind: "oldLevel" as const } : {}),
      ...(decision === "trade" && trigger?.kind === "hold" ? { entryKind: "hold" as const, holdBasis: trigger.holdBasis } : {}),
      ...(decision === "trade" && trigger?.kind === "crossing" && trigger.source !== "swing" ? { source: trigger.source } : {}),
      ...(decision === "trade" && trigger?.kind === "crossing" && trigger.source === "priorYear" && trigger.levelYear !== undefined
        ? { levelYear: trigger.levelYear }
        : {}),
      ...(decision === "trade" && trigger?.kind === "crossing" && trigger.regained ? { regained: true as const } : {}),
    },
    playback: after.map((b) => ({ t: b.t.slice(0, 10), h: b.h, l: b.l, c: b.c })),
  };
}

/**
 * The older levels drawn on the exam's chart: of each previous year's top and
 * bottom and the record, one per price (the record's name first), the two
 * nearest above `price` and the two nearest below.
 */
function examLevels(older: OlderGannLevel[], price: number): ExamLevel[] {
  const named: ExamLevel[] = [];
  for (const l of older) {
    if (named.some((n) => sameGannLevel(n.price, l.price))) continue;
    const label =
      l.source === "allTime"
        ? l.kind === "top" ? "Record high" : "Record low"
        : `${l.year} ${l.kind}`;
    named.push({ price: l.price, label });
  }
  const above = named.filter((l) => l.price > price).sort((a, b) => a.price - b.price).slice(0, 2);
  const below = named.filter((l) => l.price <= price).sort((a, b) => b.price - a.price).slice(0, 2);
  return [...above.reverse(), ...below];
}

function playedOut(s: StoredScenario): string {
  const { key, playback } = s;
  if (playback.length === 0) return "No later bars to show.";
  const first = playback[0].c;
  const lastC = playback[playback.length - 1].c;
  const move = ((lastC - first) / first) * 100;
  if (key.decision === "wait" || key.entry === null || key.stop === null) {
    return `Over the next ${playback.length} sessions the price moved ${move >= 0 ? "up" : "down"} ${Math.abs(move).toFixed(1)}%. The rules had no trade here.`;
  }
  const long = key.direction === "bullish";
  const risk = Math.abs(key.entry - key.stop);
  const target = long ? key.entry + 2 * risk : key.entry - 2 * risk;
  // The order is placed once a close crosses the old level by 3 points, and
  // fills when price reacts back to the entry.
  const line = gannBreakLine(key.entry, key.stop);
  let crossed = key.crossed === true;
  let filled = false;
  for (const b of playback) {
    if (!filled) {
      if (crossed && (long ? b.l <= key.entry : b.h >= key.entry)) filled = true;
      else {
        if (long ? b.c >= line : b.c <= line) crossed = true;
        continue;
      }
    }
    if (long ? b.l <= key.stop : b.h >= key.stop) return "The entry filled and the stop was hit: a loss that the stop kept small. Following the rules can still lose.";
    if (long ? b.h >= target : b.l <= target) return "The entry filled and price reached twice the risk before the stop.";
  }
  return filled
    ? `The entry filled; neither the stop nor twice the risk was reached within ${playback.length} sessions.`
    : key.entryKind === "hold"
      ? `Price moved away from the ${key.direction === "bearish" ? "high" : "low"} and never traded back ${key.direction === "bearish" ? "up" : "down"} to the entry within ${playback.length} sessions, so no trade was taken. The buy is made near the ${key.direction === "bearish" ? "top" : "bottom"}, not chased.`
      : key.entryKind === "oldLevel"
      ? `Price never came back ${key.direction === "bearish" ? "up to the old top" : "down to the old bottom"} within ${playback.length} sessions, so no trade was taken. Waiting for the test of the level is part of the rule.`
      : crossed
      ? `Price crossed the old level but never pulled back to the entry within ${playback.length} sessions, so no trade was taken. Waiting for the reaction is part of the rule.`
      : `Price never closed past the old level within ${playback.length} sessions, so no trade was taken. Waiting for the level is part of the rule.`;
}

const TREND_WORD: Record<Trend, string> = { up: "up", down: "down", sideways: "sideways" };

/** The old level a crossing key crossed, in the explanation's words. */
function crossedName(k: ScenarioKey): string {
  const up = k.direction !== "bearish";
  if (k.regained) return `${regainedLevelName(up, k.source, k.levelYear)} it had broken`;
  if (k.source === "priorYear") return priorYearLevelName(up, k.levelYear);
  if (k.source === "allTime") return up ? "the record high from before the last 52 weeks" : "the record low from before the last 52 weeks";
  return `the last swing ${up ? "top" : "bottom"}`;
}

export function gradeExam(transition: ExamTransition, scenarios: StoredScenario[], answers: ScenarioAnswer[]): ExamGrade {
  const pro = transition === "pro_to_expert";
  let right = 0;
  let total = 0;
  const results: ScenarioResult[] = scenarios.map((s, i) => {
    const a = answers[i] ?? {};
    const k = s.key;
    const items: ItemResult[] = [];
    const add = (item: ItemResult["item"], correct: boolean, explanation: string) => {
      items.push({ item, correct, explanation });
      total++;
      if (correct) right++;
    };
    add(
      "trend",
      a.trend === k.trend,
      k.trend === "sideways"
        ? "The tops and bottoms weren't stepping one way, so the trend was sideways."
        : `The swings and the tops and bottoms were stepping ${TREND_WORD[k.trend]}, so the trend was ${TREND_WORD[k.trend]}.`,
    );
    // An entry at an old bottom (top) that held: a double or triple bottom.
    const old = k.entryKind === "oldLevel";
    // A buy at the close over a bottom (top) that held (step 4).
    const hold = k.entryKind === "hold";
    const longKey = k.direction !== "bearish";
    const oldSide = longKey ? "bottom" : "top";
    const extreme = longKey ? "low" : "high";
    const rally = k.holdBasis === "rally";
    const heldWhat =
      rally
        ? "a rally in a falling market had run into the end of its second or third week"
        : k.holdBasis === "record"
        ? "the record low had held for weeks without breaking by 3 points"
        : k.holdBasis === "days"
          ? `the ${extreme} had held two days after a two-to-three-week reaction in a rising market`
          : `the ${extreme} had held into its second week`;
    add(
      "decision",
      a.decision === k.decision,
      k.decision === "trade"
        ? hold
          ? `The trend was clear and ${heldWhat}: a trade, ${longKey ? "bought" : "sold"} at the last close${rally ? "" : ` near that ${oldSide}`}.`
          : old
          ? `The trend was clear and an old ${oldSide} that had held sat ${longKey ? "below" : "above"} the price: a trade, resting at that ${oldSide} for a second or third test of it.`
          : k.crossed
            ? `The trend was clear and price had already closed 3 points past ${crossedName(k)}, without coming back to the ${longKey ? "buy" : "sell"}: a trade, ${longKey ? "bought on the pullback" : "sold on the bounce"} to 1 point past it.`
            : `The trend was clear and ${crossedName(k)} was still to cross: a trade, entered only once price closes 3 points past it and ${longKey ? "pulls back" : "bounces"}.`
        : "With no clear trend, or no level left to cross, the rule is to wait.",
    );
    if (k.decision === "trade") {
      if (pro) {
        add(
          "entry",
          a.entryChoiceId === k.entryChoiceId,
          hold
            ? rally
            ? `The entry is the last close, at ${k.entry?.toFixed(2)}: ${heldWhat}, the length such rallies run, so the sell is made at the week's end.`
            : `The entry is the last close, at ${k.entry?.toFixed(2)}: ${heldWhat}, so the ${longKey ? "buy" : "sell"} is made now, near the ${oldSide}, rather than chased later.`
            : old
            ? `The entry is the old swing ${oldSide} itself, at ${k.entry?.toFixed(2)}: an order resting there ${longKey ? "buys" : "sells"} the next test of it, the double or triple ${oldSide}.`
            : `The entry is 1 point past ${crossedName(k)}, at ${k.entry?.toFixed(2)}: bought on the pullback after a close 3 points past it, so the market has proved itself first.`,
        );
      }
      add(
        "stop",
        a.stopChoiceId === k.stopChoiceId,
        hold
          ? rally
            ? `The stop goes 3 points over that week's high, at ${k.stop?.toFixed(2)}: a rally that runs past it is more than a rally in a falling market.`
            : `The stop goes 3 points ${longKey ? "under" : "over"} the ${extreme} that held, at ${k.stop?.toFixed(2)}: a close beyond it means the ${oldSide} has given way.`
          : old
          ? `The stop goes 3 points ${longKey ? "under" : "over"} that ${oldSide}, at ${k.stop?.toFixed(2)}: a close beyond it means the ${oldSide} has not held.`
          : `The stop goes 3 points the other side of that same ${k.direction === "bullish" ? "top" : "bottom"}, at ${k.stop?.toFixed(2)}: back under it, the crossing has failed.`,
      );
      const sharesOk = k.shares !== null && typeof a.shares === "number" && Math.abs(a.shares - k.shares) <= Math.max(1, k.shares * 0.05);
      add("size", sharesOk, `Risking 1% of $${ACCOUNT_USD.toLocaleString("en-US")} is $${(ACCOUNT_USD * RISK_PCT) / 100}; divided by the risk per share (${k.entry !== null && k.stop !== null ? Math.abs(k.entry - k.stop).toFixed(2) : "?"}) that is ${k.shares} shares.`);
    }
    return { items, playedOut: playedOut(s) };
  });
  const score = total > 0 ? right / total : 0;
  return { score, passed: score >= PASS_MARK, scenarios: results };
}

/** When a failed attempt may be retaken. */
export function retakeAvailableAt(lastGradedAt: string): Date {
  return new Date(Date.parse(lastGradedAt) + RETAKE_HOURS * 3_600_000);
}
