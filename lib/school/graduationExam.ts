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
 *    structure of tops and bottoms; entry past the old top by the allowance;
 *    the stop beyond the last bottom; risk a small, fixed part of capital),
 *    Tier A, as implemented in `lib/gann/`.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect (the grade follows the decision's cause, the
 *    rule applied, not its effect, the P&L, which is shown separately) and
 *    Polarity (the novice and the professional exams are two poles of one
 *    test, each complete at its level, not one exam with parts removed).
 */

import type { Bar } from "@/lib/types";
import { readGannTrend } from "@/lib/gann/trendStrength";
import { computeGannEntryTrigger } from "@/lib/gann/entryTrigger";

export type ExamTransition = "novice_to_pro" | "pro_to_expert";
export const EXAM_TRANSITIONS: readonly ExamTransition[] = ["novice_to_pro", "pro_to_expert"];

export const SCENARIOS_PER_EXAM = 5;
export const PASS_MARK = 0.8;
export const RETAKE_HOURS = 24;
export const ACCOUNT_USD = 10_000;
export const RISK_PCT = 1;
export const CHART_BARS = 120;
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

/** What the student sees. */
export interface ScenarioView {
  symbol: string;
  asOf: string;
  bars: { t: string; o: number; h: number; l: number; c: number }[];
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
 * Build one scenario from daily bars around `asOf`. Only bars dated before
 * `asOf` feed the chart and the key; bars from `asOf` on are the play-forward.
 */
export function buildScenario(symbol: string, asOf: string, daily: Bar[], seed: number): StoredScenario | null {
  const before = daily.filter((b) => b.t.slice(0, 10) < asOf);
  const after = daily.filter((b) => b.t.slice(0, 10) >= asOf).slice(0, PLAYBACK_BARS);
  if (before.length < 60 || after.length < 5) return null;
  const rand = rng(seed);

  const read = readGannTrend(before);
  const direction = read.direction;
  const trend: Trend = direction === "bullish" ? "up" : direction === "bearish" ? "down" : "sideways";
  const trigger = direction ? computeGannEntryTrigger(before, direction) : null;
  const last = before[before.length - 1];
  const decision: Decision = trigger && (direction === "bullish" ? trigger.triggerPrice > last.c : trigger.triggerPrice < last.c) ? "trade" : "wait";

  let entryChoices: ExamChoice[] = [];
  let stopChoices: ExamChoice[] = [];
  let entryChoiceId: string | null = null;
  let stopChoiceId: string | null = null;
  let entry: number | null = null;
  let stop: number | null = null;
  let shares: number | null = null;
  if (decision === "trade" && trigger) {
    const long = direction === "bullish";
    entry = round2(trigger.triggerPrice);
    stop = round2(trigger.stopPrice);
    const e = [
      { id: "e1", price: entry },
      // Buying at today's close, before the old top has been crossed.
      { id: "e2", price: round2(last.c) },
      // Short of the level: an order that fills before the market proves itself.
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

  return {
    view: {
      symbol,
      asOf,
      bars: before.slice(-CHART_BARS).map((b) => ({ t: b.t.slice(0, 10), o: b.o, h: b.h, l: b.l, c: b.c })),
      entryChoices,
      stopChoices,
    },
    key: { trend, decision, direction, entryChoiceId, stopChoiceId, entry, stop, shares },
    playback: after.map((b) => ({ t: b.t.slice(0, 10), h: b.h, l: b.l, c: b.c })),
  };
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
  let filled = false;
  for (const b of playback) {
    if (!filled) {
      if (long ? b.h >= key.entry : b.l <= key.entry) filled = true;
      else continue;
    }
    if (long ? b.l <= key.stop : b.h >= key.stop) return "The entry filled and the stop was hit: a loss that the stop kept small. Following the rules can still lose.";
    if (long ? b.h >= target : b.l <= target) return "The entry filled and price reached twice the risk before the stop.";
  }
  return filled
    ? `The entry filled; neither the stop nor twice the risk was reached within ${playback.length} sessions.`
    : `Price never reached the entry within ${playback.length} sessions, so no trade was taken. Waiting for the level is part of the rule.`;
}

const TREND_WORD: Record<Trend, string> = { up: "up", down: "down", sideways: "sideways" };

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
    add(
      "decision",
      a.decision === k.decision,
      k.decision === "trade"
        ? "The trend was clear and there was an old swing level still to cross: a trade, entered only if price crosses it."
        : "With no clear trend, or no level left to cross, the rule is to wait.",
    );
    if (k.decision === "trade") {
      if (pro) {
        add("entry", a.entryChoiceId === k.entryChoiceId, `The entry is just past the last swing ${k.direction === "bullish" ? "top" : "bottom"}, at ${k.entry?.toFixed(2)}, so the market has to prove itself first.`);
      }
      add("stop", a.stopChoiceId === k.stopChoiceId, `The stop goes just beyond the last swing ${k.direction === "bullish" ? "bottom" : "top"}, at ${k.stop?.toFixed(2)}: the price that proves the idea wrong.`);
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
