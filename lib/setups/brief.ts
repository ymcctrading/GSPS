/**
 * The setup brief: one reading of a setup, told in two voices, for the setup
 * card, the ticker page and the evening emails (owner, 2026-11-11, on the BKR
 * review: "precise, accurate, explanatory, forecasting, creative ... that is
 * what a card should look like. that is what the email recaps should look
 * like. the list that you send out or signals to watch for tomorrow").
 * Spec: the Claude Doc "Setup brief: the card, the recap and the watch list"
 * (2026-11-11), BKR its worked example.
 *
 * Six parts, always in this order: the call; both sides with the line that
 * settles them; the plan (entry, stop, TP1, TP2, MTP, each with its reason);
 * timing; what proves it wrong; what to watch tomorrow. Every part is written
 * twice from the same facts: `plain` for Novice and Pro, `full` for Expert and
 * Wall Street.
 *
 * It is a presentation model. It scores nothing, gates nothing and never
 * chooses a side: the side, the verdict and the levels are the scan's. It only
 * reads readings the scan already made (the campaign ledger, the tests of a
 * level, the trend readings, the daily bars) and says what they show.
 *
 * Disclosure (AGENTS.md "Confidential sources"): every string here reaches a
 * member, through `daily_scans.detail.brief` and the scan API. None names or
 * quotes a source. The rules behind each line are recorded as neutral rule ids
 * in `BriefTrace`, which stays on the server (`redactScanResult` strips it),
 * and the ids' citations live in `lib/setups/briefSources.ts`, which no client
 * module imports.
 *
 * Only the real (owner, 2026-10-21; AGENTS.md "Forward-looking claims") and
 * the owner's 2026-11-11 decision ("No, keep the rules hidden"): a line gives
 * the count and GSPS's verdict ("the next touch would be the 3rd: still
 * safe"; "GSPS reads this as a strong break"), never the rule behind it and
 * never what the market usually does, because none of these readings has a
 * measured rate yet. Dated windows from the time counts stay out until the
 * replay measures them (spec, PR 2). The one date shown (when a rally in a
 * falling market has run long enough to read as a change) is the plan's own
 * rule applied to the chart, not a forecast.
 *
 * Foundations (spec, "Foundations check"):
 * 1. Gann: each line is one of his rules read on the chart; citations by rule
 *    id in briefSources.ts. Tier A throughout (Master Course; Truth of the
 *    Stock Tape).
 * 2. Cycles: one periodicity-shaped claim, the 4-week bounce, is carried as
 *    the plan's rule and not as a measured cycle; it has not cleared Dewey's
 *    checklist and is labelled that way in the trace.
 * 3. Hermetic: Polarity (both sides of one reading, and the line where one
 *    turns into the other), Cause and Effect (every level with its cause),
 *    Correspondence (one brief on every surface).
 * 4. Law of Creation: case for x case against creates the deciding line,
 *    which neither side holds alone. Unmeasured (I = 0) until briefs are
 *    judged in the recap.
 */

import type { Bar } from "@/lib/types";
import type { CampaignLedger } from "@/lib/gann/campaignLedger";
import type { MultipleTopsReading, MultipleTestReading } from "@/lib/gann/multipleTops";
import { crossingLinesFromEntry, pricePoint, threePoints } from "@/lib/gann/pointScale";
import { priceUsd } from "@/lib/strat/priceText";

export type BriefVoice = "plain" | "full";

export interface BriefText {
  plain: string;
  full: string;
}

export type BriefLevelRole = "entry" | "stop" | "tp1" | "tp2" | "mtp";

export interface BriefLevel {
  role: BriefLevelRole;
  price: number;
  /** Distance from the entry as a multiple of the risk; null for the entry and the stop. */
  multiple: number | null;
  reason: BriefText;
}

export interface SetupBrief {
  version: 1;
  /** The session the brief was read at, "YYYY-MM-DD" (New York). */
  asOf: string;
  side: "buy" | "sell";
  call: BriefText;
  /** The case for the scan's side. */
  forCall: BriefText[];
  /** The case for the other side. */
  forOther: BriefText[];
  /** The price (or the event) that settles which side is right. */
  decidingLine: BriefText;
  /**
   * The deciding line's two prices, for the recap to judge by a session's
   * close: `callLine` a close beyond it settles the call its way (null when no
   * tested level gives one), `otherLine` a close beyond it (the stop) proves
   * the call wrong.
   */
  decide: { callLine: number | null; otherLine: number | null };
  /** Entry, stop, TP1, TP2 (when it is its own level) and MTP, in that order. */
  plan: BriefLevel[];
  timing: BriefText[];
  wrongIf: BriefText;
  watch: BriefText;
}

/**
 * Neutral ids for the rules behind each line. The ids are safe to keep in
 * server logs; their citations are in `briefSources.ts`.
 */
export type BriefRuleId =
  | "trendWith"
  | "trendAgainst"
  | "lowerTops"
  | "higherBottoms"
  | "overbalance"
  | "levelTests"
  | "fourthTest"
  | "levelFailed"
  | "levelCrossed"
  | "setAside"
  | "twoSidedDoubt"
  | "threePointBreak"
  | "bearRallyWeeks"
  | "entryCrossing"
  | "entryOldLevel"
  | "entryHold"
  | "stopOldLevel"
  | "levelSwing"
  | "levelRangeFraction"
  | "awaitsCrossing"
  | "fivePointReversal";

export interface BriefTrace {
  symbol: string;
  rules: BriefRuleId[];
}

export interface BriefInput {
  symbol: string;
  side: "buy" | "sell";
  /** The tier the lists show the setup in: "Execute" | "Resting" | "Watch" | "Reject". */
  verdict: string;
  score: number | null;
  scoreMax: number;
  /** Why the verdict sits below the score, when the scan said so. */
  stateNote: string | null;
  price: number | null;
  levels: {
    entry: number;
    stop: number;
    tp1: number;
    /** Null, or equal to the MTP, until TP2 is its own level (spec, PR 2). */
    tp2: number | null;
    mtp: number;
    entryKind?: "crossing" | "oldLevel" | "hold";
    entrySource?: "priorYear" | "allTime";
    entryLevelYear?: number;
    entryRegained?: true;
    entryAwaitsCrossing?: true;
    stopBehindOldLevel?: boolean;
  } | null;
  trends: { timeframe: string; direction: string }[];
  /** The completed daily sessions the scan read its structure from. */
  daily: Bar[];
  tests: MultipleTopsReading | null;
  campaign: Pick<CampaignLedger, "trend" | "legs" | "greatestCounterMove" | "currentCounterMove" | "spaceOverbalanced"> | null;
  setAside: { direction: "bullish" | "bearish"; inDoubt?: boolean } | null;
}

// ---------------------------------------------------------------------------
// Words

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 6, 2026" from an ISO time, read as a New York calendar day for daily bars stamped at midnight UTC or later. */
export function dayText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${dateKey(iso)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
function ordinal(n: number): string {
  return ORDINAL[n] ?? `${n}th`;
}

const TIMEFRAME_WORD: Record<string, string> = { "1Month": "monthly", "1Week": "weekly", "1Day": "daily" };

function both(text: string): BriefText {
  return { plain: text, full: text };
}

function multiple(entry: number, stop: number, target: number): number | null {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0) || !Number.isFinite(target)) return null;
  return Math.abs(target - entry) / risk;
}

// ---------------------------------------------------------------------------
// Naming a level: a swing high or low on the chart, or a fraction of the
// year's range. Read within a quarter of one point (`pricePoint`) of the
// level; engineering choice, about 0.25% at $50.

interface Pivot {
  index: number;
  price: number;
  kind: "high" | "low";
}

/** Daily highs (lows) above (below) the 3 sessions on each side. */
export function dailyPivots(bars: Bar[], span = 3): Pivot[] {
  const out: Pivot[] = [];
  for (let i = span; i < bars.length - span; i++) {
    let hi = true;
    let lo = true;
    for (let k = 1; k <= span; k++) {
      if (!(bars[i].h > bars[i - k].h && bars[i].h >= bars[i + k].h)) hi = false;
      if (!(bars[i].l < bars[i - k].l && bars[i].l <= bars[i + k].l)) lo = false;
    }
    if (hi) out.push({ index: i, price: bars[i].h, kind: "high" });
    if (lo) out.push({ index: i, price: bars[i].l, kind: "low" });
  }
  return out;
}

const FRACTIONS: { f: number; plain: string; full: string }[] = [
  { f: 1 / 2, plain: "halfway", full: "1/2" },
  { f: 1 / 3, plain: "a third of the way", full: "1/3" },
  { f: 2 / 3, plain: "two thirds of the way", full: "2/3" },
  { f: 1 / 4, plain: "a quarter of the way", full: "1/4" },
  { f: 3 / 4, plain: "three quarters of the way", full: "3/4" },
  { f: 1 / 8, plain: "an eighth of the way", full: "1/8" },
  { f: 3 / 8, plain: "three eighths of the way", full: "3/8" },
  { f: 5 / 8, plain: "five eighths of the way", full: "5/8" },
  { f: 7 / 8, plain: "seven eighths of the way", full: "7/8" },
];

/** About a year of daily sessions. */
const YEAR_SESSIONS = 252;

export function nameLevel(price: number, bars: Bar[]): { text: BriefText; rule: BriefRuleId } | null {
  if (!(price > 0) || bars.length < 10) return null;
  const tol = pricePoint(price) / 4;
  // A swing high or low within the tolerance: the most recent, which is the
  // one the member can find on the chart first.
  const pivots = dailyPivots(bars).filter((p) => Math.abs(p.price - price) <= tol);
  if (pivots.length > 0) {
    const p = pivots[pivots.length - 1];
    const word = p.kind === "high" ? "high" : "low";
    const when = dayText(bars[p.index].t);
    return {
      rule: "levelSwing",
      text: { plain: `the ${when} ${word}`, full: `the ${when} swing ${word} (${priceUsd(p.price)})` },
    };
  }
  // A fraction of the last year's range, from its high to its low.
  const year = bars.slice(-YEAR_SESSIONS);
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < year.length; i++) {
    if (year[i].h > year[hi].h) hi = i;
    if (year[i].l < year[lo].l) lo = i;
  }
  const top = year[hi].h;
  const bottom = year[lo].l;
  const range = top - bottom;
  if (!(range > 0)) return null;
  // Measured from the later extreme back toward the earlier one: a rally
  // after a fall is a fraction of the fall, a pullback after a rise a
  // fraction of the rise.
  const fallLast = lo > hi;
  for (const fr of FRACTIONS) {
    const level = fallLast ? bottom + fr.f * range : top - fr.f * range;
    if (Math.abs(level - price) > tol) continue;
    const move = fallLast ? "fall" : "rise";
    const from = fallLast ? `${priceUsd(top)} (${dayText(year[hi].t)})` : `${priceUsd(bottom)} (${dayText(year[lo].t)})`;
    const to = fallLast ? `${priceUsd(bottom)} (${dayText(year[lo].t)})` : `${priceUsd(top)} (${dayText(year[hi].t)})`;
    const back = fallLast ? "back up" : "back down";
    return {
      rule: "levelRangeFraction",
      text: {
        plain: fr.f === 1 / 2 ? `halfway ${back} the year's ${move}` : `${fr.plain} ${back} the year's ${move}`,
        full: `${fr.full} of the ${move} from ${from} to ${to}`,
      },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The two cases

interface Point {
  text: BriefText;
  rule: BriefRuleId;
  /** Which side the point argues for. */
  favors: "buy" | "sell";
}

function trendPoints(trends: BriefInput["trends"]): Point[] {
  const named = trends.filter((t) => t.timeframe in TIMEFRAME_WORD && t.direction !== "sideways");
  const out: Point[] = [];
  for (const dir of ["bullish", "bearish"] as const) {
    const frames = named.filter((t) => t.direction === dir).map((t) => TIMEFRAME_WORD[t.timeframe]);
    if (frames.length === 0) continue;
    const verb = dir === "bullish" ? "rising" : "falling";
    const list = frames.length === 1 ? frames[0] : `${frames.slice(0, -1).join(", ")} and ${frames[frames.length - 1]}`;
    const charts = frames.length === 1 ? "chart is" : "charts are";
    out.push({
      favors: dir === "bullish" ? "buy" : "sell",
      rule: "trendWith",
      text: {
        plain: `The ${list} ${charts} ${verb}.`,
        full: `The ${list} ${charts} ${verb}: the swings on ${frames.length === 1 ? "that chart" : "those charts"} are making ${dir === "bullish" ? "higher tops and bottoms" : "lower tops and bottoms"}.`,
      },
    });
  }
  return out;
}

/**
 * The campaign's tops (bear) or bottoms (bull), in order: its starting
 * extreme, then each counter-leg's end. A run of three or more stepping
 * against the old direction is the structure the plan reads as weakest
 * (strongest, for bottoms).
 */
function steppingExtremes(campaign: NonNullable<BriefInput["campaign"]>, bars: Bar[]): { prices: number[]; dates: string[] } {
  const bear = campaign.trend === "bearish";
  const legs = campaign.legs;
  const out: { price: number; date: string }[] = [];
  if (legs.length > 0) {
    const first = bars[legs[0].fromIndex];
    if (first) out.push({ price: bear ? first.h : first.l, date: first.t });
  }
  for (const leg of legs) {
    const ends = bear ? leg.direction === "up" : leg.direction === "down";
    const bar = bars[leg.toIndex];
    if (ends && bar) out.push({ price: bear ? bar.h : bar.l, date: bar.t });
  }
  // Keep the run that steps the campaign's way from the start.
  const run: { price: number; date: string }[] = [];
  for (const e of out) {
    const prev = run[run.length - 1];
    if (!prev || (bear ? e.price < prev.price : e.price > prev.price)) run.push(e);
    else break;
  }
  return { prices: run.map((r) => r.price), dates: run.map((r) => r.date) };
}

function campaignPoints(campaign: BriefInput["campaign"], bars: Bar[]): Point[] {
  if (!campaign) return [];
  const out: Point[] = [];
  const bear = campaign.trend === "bearish";
  const { prices, dates } = steppingExtremes(campaign, bars);
  if (prices.length >= 3) {
    const word = bear ? "lower highs" : "higher lows";
    const list = prices.map((p) => priceUsd(p)).join(", ");
    out.push({
      favors: bear ? "sell" : "buy",
      rule: bear ? "lowerTops" : "higherBottoms",
      text: {
        plain: `${prices.length - 1} ${word} in a row since the ${dayText(dates[0])} ${bear ? "high" : "low"}.`,
        full: `${prices.length} ${bear ? "tops" : "bottoms"}, each ${bear ? "lower" : "higher"} than the last (${list}), since ${dayText(dates[0])}. GSPS reads this as ${bear ? "weakness" : "strength"}.`,
      },
    });
  }
  const cur = campaign.currentCounterMove;
  const big = campaign.greatestCounterMove;
  if (campaign.spaceOverbalanced && cur && big) {
    const move = bear ? "rally" : "pullback";
    out.push({
      favors: bear ? "buy" : "sell",
      rule: "overbalance",
      text: {
        plain: `This ${move} is already bigger than any ${move} since the ${bear ? "fall" : "rise"} began.`,
        full: `This ${move} (${priceUsd(cur.points)} so far) is bigger than the largest ${move} since the ${bear ? "fall" : "rise"} began (${priceUsd(big.points)}). GSPS reads this as a sign of a change in trend.`,
      },
    });
  }
  return out;
}

function testPoints(tests: MultipleTopsReading | null, price: number | null): Point[] {
  if (!tests) return [];
  const out: Point[] = [];
  const read = (t: MultipleTestReading) => {
    const top = t.kind === "top";
    const where = priceUsd(t.level);
    const word = top ? "highs" : "lows";
    if (t.state === "crossed") {
      out.push({
        favors: top ? "buy" : "sell",
        rule: "levelCrossed",
        text: {
          plain: `Price broke ${top ? "above" : "below"} the ${where} ${word} it had ${top ? "stopped at" : "held at"} ${t.tests} times.`,
          full: `Price closed clearly ${top ? "above" : "below"} the ${where} ${word}, tested ${t.tests} times before. GSPS reads this as a strong break.`,
        },
      });
      return;
    }
    if (t.state === "failed") {
      out.push({
        favors: top ? "sell" : "buy",
        rule: "levelFailed",
        text: {
          plain: `Price ${top ? "turned down at" : "bounced off"} the ${where} ${word} ${t.tests} times.`,
          full: `Price has ${top ? "failed at" : "held at"} the ${where} ${word} ${t.tests} times. GSPS reads them as ${top ? "resistance" : "support"}.`,
        },
      });
      return;
    }
    // Testing: the level is holding so far.
    if (t.tests >= 4) {
      out.push({
        favors: top ? "buy" : "sell",
        rule: "fourthTest",
        text: {
          plain: `Price has come back to the ${where} ${word} ${t.tests} times. GSPS reads that as a warning the level may give way.`,
          full: `The ${where} ${word} have been tested ${t.tests} times. GSPS reads that as a warning the level may give way.`,
        },
      });
    } else {
      out.push({
        favors: top ? "sell" : "buy",
        rule: "levelTests",
        text: {
          plain: `Price has ${top ? "stopped at" : "held at"} about ${where} ${t.tests === 1 ? "once" : t.tests === 2 ? "twice" : `${t.tests} times`}.`,
          full: `The ${where} ${word} have held ${t.tests} time${t.tests === 1 ? "" : "s"}${price != null ? `, ${priceUsd(Math.abs(price - t.level))} from price` : ""}.`,
        },
      });
    }
  };
  if (tests.top) read(tests.top);
  if (tests.bottom) read(tests.bottom);
  return out;
}

function setAsidePoint(setAside: BriefInput["setAside"]): Point | null {
  if (!setAside) return null;
  const favors = setAside.direction === "bullish" ? "buy" : "sell";
  if (setAside.inDoubt) {
    return {
      favors,
      rule: "twoSidedDoubt",
      text: {
        plain: `No chart shows a clear trend, and a ${favors} point also lined up.`,
        full: `No trend on the monthly, weekly or daily chart, and a ${favors} entry armed beside this one: the market has not yet shown which way it is going.`,
      },
    };
  }
  return {
    favors,
    rule: "setAside",
    text: {
      plain: `A ${favors} point also lined up, but it runs against the trend.`,
      full: `A ${favors} entry also armed and was set aside because it runs against the trend.`,
    },
  };
}

/**
 * A level lost (a sell) or regained (a buy): how far price has gone past it
 * since, in points. Under 5 points the plan does not yet count the old trend
 * reversed, which is the other side's case; past 5 it does
 * (rule fivePointReversal). Returns null unless the plan is a regained
 * crossing with a level price has actually gone past.
 */
export function readRegainedExcursion(
  side: "buy" | "sell",
  levels: NonNullable<BriefInput["levels"]>,
  bars: Bar[],
): { level: number; extreme: number; points: number; reversedAt: number } | null {
  if (!levels.entryRegained || (levels.entryKind && levels.entryKind !== "crossing")) return null;
  const buy = side === "buy";
  const { level } = crossingLinesFromEntry(levels.entry, buy ? "bullish" : "bearish");
  // The last close on the old side of the level: the excursion is read after it.
  let k = bars.length - 1;
  while (k >= 0 && (buy ? bars[k].c >= level : bars[k].c <= level)) k--;
  if (k < 0 || k === bars.length - 1) return null;
  // From that close on, the furthest price went past the level.
  let extreme = buy ? bars[k + 1].h : bars[k + 1].l;
  for (let i = k + 1; i < bars.length; i++) extreme = buy ? Math.max(extreme, bars[i].h) : Math.min(extreme, bars[i].l);
  const point = pricePoint(level);
  if (!(point > 0)) return null;
  const points = (buy ? extreme - level : level - extreme) / point;
  if (!(points > 0)) return null;
  return { level, extreme, points, reversedAt: buy ? level + 5 * point : level - 5 * point };
}

function excursionPoint(side: "buy" | "sell", ex: NonNullable<ReturnType<typeof readRegainedExcursion>>): Point | null {
  if (ex.points >= 5) return null;
  const buy = side === "buy";
  const other = buy ? "sell" : "buy";
  const word = buy ? "low" : "high";
  return {
    favors: other,
    rule: "fivePointReversal",
    text: {
      plain: `So far price has gone only ${buy ? "a little above" : "a little under"} the old ${priceUsd(ex.level)} ${word}, so it can still act as ${buy ? "resistance" : "support"}. GSPS doesn't count the old trend as over until price is past ${priceUsd(ex.reversedAt)}.`,
      full: `Since price came back past the old ${priceUsd(ex.level)} ${word}, the furthest it has gone is ${priceUsd(ex.extreme)}. GSPS counts the old trend as over only past ${priceUsd(ex.reversedAt)}. ${ex.points > 3 ? "This move is short of that line, so it could still go either way." : "This move is still shallow, the stronger case for the other side."}`,
    },
  };
}

// ---------------------------------------------------------------------------
// The plan's reasons

function entryReason(input: BriefInput, levels: NonNullable<BriefInput["levels"]>, rules: BriefRuleId[]): BriefText {
  const buy = input.side === "buy";
  // The crossed level: an old top crossed (a buy) or bottom broken (a sell);
  // when regained, an old bottom won back (a buy) or top lost (a sell).
  const old = levels.entryRegained ? (buy ? "low" : "high") : buy ? "high" : "low";
  if (levels.entryKind === "oldLevel") {
    rules.push("entryOldLevel");
    return {
      plain: `an old ${buy ? "low" : "high"}, waiting for price to come back to it`,
      full: `an order resting at the old ${buy ? "bottom" : "top"}, ${buy ? "bought" : "sold"} on the return to it`,
    };
  }
  if (levels.entryKind === "hold") {
    rules.push("entryHold");
    return {
      plain: `the ${buy ? "low" : "high"} that has held`,
      full: `the ${buy ? "bottom" : "top"} that has held, taken at the last close`,
    };
  }
  rules.push("entryCrossing");
  const which =
    levels.entrySource === "allTime"
      ? `the record ${old}`
      : levels.entrySource === "priorYear" && levels.entryLevelYear
        ? `the ${levels.entryLevelYear} ${old}`
        : `the old ${old}`;
  const regained = levels.entryRegained ? (buy ? ", regained after a break under it" : ", lost after a break over it") : "";
  return {
    plain: `just past ${which}${regained}, ${buy ? "bought" : "sold"} when price comes back to it`,
    full: `just past ${which}${regained}: the ${buy ? "pullback" : "rally"} back to a level price has crossed`,
  };
}

function stopReason(input: BriefInput, levels: NonNullable<BriefInput["levels"]>, rules: BriefRuleId[]): BriefText {
  const buy = input.side === "buy";
  if (levels.stopBehindOldLevel) {
    rules.push("stopOldLevel");
    return {
      plain: `clearly ${buy ? "under" : "over"} the old level the entry sits on`,
      full: `clearly ${buy ? "under" : "over"} the old level the entry sits on, where a break says the level has failed`,
    };
  }
  return {
    plain: `${buy ? "under the nearest support" : "over the nearest resistance"}`,
    full: `${buy ? "under the nearest support" : "over the nearest resistance"} on the daily chart`,
  };
}

function targetReason(price: number, bars: Bar[], role: "tp1" | "tp2" | "mtp", rules: BriefRuleId[]): BriefText {
  const named = nameLevel(price, bars);
  const generic: Record<typeof role, BriefText> = {
    tp1: { plain: "the first level ahead that pays more than the risk", full: "the nearest level ahead that pays more than the risk" },
    tp2: { plain: "the strongest level between the first target and the last", full: "the level between TP1 and the MTP where the most levels meet" },
    mtp: { plain: "the furthest level the move is measured to", full: "the next level beyond TP1 the runner works toward" },
  };
  if (!named) return generic[role];
  rules.push(named.rule);
  return named.text;
}

// ---------------------------------------------------------------------------
// The builder

function verdictWords(verdict: string): { plain: string; full: string } {
  switch (verdict) {
    case "Execute":
      return { plain: "ready to act on", full: "Execute" };
    case "Resting":
      return { plain: "an order waiting at its level", full: "Resting" };
    case "Watch":
      return { plain: "worth watching, not ready yet", full: "Watch" };
    default:
      return { plain: "no trade for now", full: verdict };
  }
}

export function buildSetupBrief(input: BriefInput, asOfIso: string): { brief: SetupBrief; trace: BriefTrace } {
  const rules: BriefRuleId[] = [];
  const buy = input.side === "buy";
  const noun = buy ? "buy" : "sell";
  const other = buy ? "sell" : "buy";
  const v = verdictWords(input.verdict);
  const score = input.score != null ? `${input.score} of ${input.scoreMax} checks line up` : null;

  const call: BriefText = {
    plain: `${input.symbol}: ${input.verdict === "Watch" || input.verdict === "Reject" ? `leaning ${noun}` : `a ${noun}`}, ${v.plain}.${score ? ` ${score}.` : ""}${input.stateNote ? ` ${input.stateNote}` : ""}`,
    full: `${input.symbol}: ${noun}, ${v.full}${input.score != null ? ` ${input.score}/${input.scoreMax}` : ""}.${input.stateNote ? ` ${input.stateNote}` : ""}`,
  };

  // Both cases, from the same readings.
  const points: Point[] = [
    ...trendPoints(input.trends),
    ...campaignPoints(input.campaign, input.daily),
    ...testPoints(input.tests, input.price),
  ];
  const aside = setAsidePoint(input.setAside);
  if (aside) points.push(aside);
  const excursion = input.levels ? readRegainedExcursion(input.side, input.levels, input.daily) : null;
  const exPoint = excursion ? excursionPoint(input.side, excursion) : null;
  if (exPoint) points.push(exPoint);
  const forCall = points.filter((p) => p.favors === input.side);
  const forOther = points.filter((p) => p.favors !== input.side);
  for (const p of points) rules.push(p.rule);

  // The deciding line: where the call is proven wrong (its stop) and where it
  // is settled its way (a close 3 points through the nearest tested level on
  // its side, the plan's break rule), or its entry when no level is tested.
  const levels = input.levels;
  const tested = buy ? input.tests?.top : input.tests?.bottom;
  let settles: BriefText | null = null;
  let callLine: number | null = null;
  if (excursion && excursion.points < 5) {
    // The level the call lost (regained): past 5 points the plan counts the
    // old trend reversed, which settles it the call's way.
    callLine = Math.round(excursion.reversedAt * 100) / 100;
    settles = {
      plain: `a daily close ${buy ? "over" : "under"} ${priceUsd(excursion.reversedAt)} says ${buy ? "up" : "down"}`,
      full: `a daily close ${buy ? "over" : "under"} ${priceUsd(excursion.reversedAt)}, well past the old ${priceUsd(excursion.level)} ${buy ? "low" : "high"}, settles it ${buy ? "up" : "down"}`,
    };
  } else if (tested && tested.state === "testing") {
    const line = buy ? tested.level + threePoints(tested.level) : tested.level - threePoints(tested.level);
    rules.push("threePointBreak");
    callLine = Math.round(line * 100) / 100;
    settles = {
      plain: `a daily close ${buy ? "over" : "under"} ${priceUsd(line)} says ${buy ? "up" : "down"}`,
      full: `a daily close ${buy ? "over" : "under"} ${priceUsd(line)}, clearly through the ${priceUsd(tested.level)} ${buy ? "highs" : "lows"}, settles it ${buy ? "up" : "down"}`,
    };
  } else if (levels) {
    settles = {
      plain: `a ${buy ? "pullback" : "rally"} to ${priceUsd(levels.entry)} that turns ${buy ? "up" : "down"} there says ${buy ? "up" : "down"}`,
      full: `the plan's entry at ${priceUsd(levels.entry)} confirming on closed bars settles it ${buy ? "up" : "down"}`,
    };
  }
  const against: BriefText | null = levels
    ? {
        plain: `a close ${buy ? "under" : "over"} ${priceUsd(levels.stop)} says ${buy ? "down" : "up"}`,
        full: `a close ${buy ? "under" : "over"} the ${priceUsd(levels.stop)} stop says the ${noun} is wrong and the ${other} side has it`,
      }
    : null;
  const decidingLine: BriefText =
    settles && against
      ? { plain: `What settles it: ${settles.plain}; ${against.plain}.`, full: `What settles it: ${settles.full}; ${against.full}.` }
      : settles
        ? { plain: `What settles it: ${settles.plain}.`, full: `What settles it: ${settles.full}.` }
        : both("No level has been tested enough yet to settle it either way.");

  // The plan.
  const plan: BriefLevel[] = [];
  if (levels) {
    plan.push({ role: "entry", price: levels.entry, multiple: null, reason: entryReason(input, levels, rules) });
    plan.push({ role: "stop", price: levels.stop, multiple: null, reason: stopReason(input, levels, rules) });
    plan.push({ role: "tp1", price: levels.tp1, multiple: multiple(levels.entry, levels.stop, levels.tp1), reason: targetReason(levels.tp1, input.daily, "tp1", rules) });
    if (levels.tp2 != null && levels.tp2 !== levels.mtp) {
      plan.push({ role: "tp2", price: levels.tp2, multiple: multiple(levels.entry, levels.stop, levels.tp2), reason: targetReason(levels.tp2, input.daily, "tp2", rules) });
    }
    plan.push({ role: "mtp", price: levels.mtp, multiple: multiple(levels.entry, levels.stop, levels.mtp), reason: targetReason(levels.mtp, input.daily, "mtp", rules) });
  }

  // Timing.
  const timing: BriefText[] = [];
  const near = buy ? input.tests?.bottom : input.tests?.top;
  if (near && near.state === "testing") {
    const next = near.tests + 1;
    const safe = next <= 3;
    rules.push(safe ? "levelTests" : "fourthTest");
    timing.push({
      plain: `The next touch of ${priceUsd(near.level)} would be the ${ordinal(next)}: ${safe ? "still safe" : "a warning"}.`,
      full: `${near.tests} test${near.tests === 1 ? "" : "s"} of the ${priceUsd(near.level)} ${near.kind === "top" ? "highs" : "lows"} so far, the last on ${dayText(input.daily[near.lastTestIndex]?.t ?? asOfIso)}. The next would be the ${ordinal(next)}: ${safe ? "still safe" : "a warning the level may give way"}.`,
    });
  }
  let timeStop: { date: string; text: BriefText } | null = null;
  const cur = input.campaign?.currentCounterMove;
  const last = input.daily[input.daily.length - 1];
  if (input.campaign?.trend === "bearish" && cur && last) {
    // A rally in a falling market: the plan gives it up to 4 weeks and reads
    // one still holding into its 5th week as a change in trend (rule
    // bearRallyWeeks). Once that date has passed, it is a point for the
    // buyer, not a date ahead (review finding 2).
    const start = addDays(last.t, -cur.days);
    const fifth = addDays(start, 28);
    rules.push("bearRallyWeeks");
    if (dateKey(fifth) > dateKey(last.t)) {
      timing.push({
        plain: `This bounce began ${dayText(start)}. Still holding on ${dayText(fifth)} would be a sign of a change.`,
        full: `Rally in a falling market, ${cur.days} days old (from ${dayText(start)}). Still holding on ${dayText(fifth)} would be a sign of an important change.`,
      });
      if (!buy) {
        timeStop = {
          date: fifth,
          text: { plain: ` or if this bounce is still holding on ${dayText(fifth)}`, full: ` or if the rally is still holding on ${dayText(fifth)}` },
        };
      }
    } else {
      const point = {
        plain: `This bounce has held since ${dayText(start)}, long enough that GSPS reads it as a sign of a change.`,
        full: `The rally from ${dayText(start)} is ${cur.days} days old, long enough that GSPS reads it as a sign of an important change.`,
      };
      (buy ? forCall : forOther).push({ favors: "buy", rule: "bearRallyWeeks", text: point });
    }
  }
  if (levels?.entryAwaitsCrossing) {
    rules.push("awaitsCrossing");
    timing.push({
      plain: `First it needs a daily close clearly ${buy ? "above" : "below"} the old level the entry sits on.`,
      full: `The crossing has not closed yet: the entry waits on a daily close clearly ${buy ? "over" : "under"} the old level.`,
    });
  }

  // Wrong if.
  const wrongIf: BriefText = levels
    ? {
        plain: `Wrong if price closes ${buy ? "below" : "above"} ${priceUsd(levels.stop)}${timeStop?.text.plain ?? ""}.`,
        full: `Wrong if price closes ${buy ? "below" : "above"} ${priceUsd(levels.stop)}${timeStop?.text.full ?? ""}.`,
      }
    : both("No plan has armed yet, so nothing can prove it wrong.");

  // What to watch tomorrow.
  let watch: BriefText;
  if (!levels) {
    watch = both("No plan yet: watch for the next test of the levels above.");
  } else {
    const p = input.price;
    const toward =
      p == null
        ? `price reaching ${priceUsd(levels.entry)}`
        : buy
          ? p > levels.entry
            ? `a pullback down to ${priceUsd(levels.entry)}`
            : `a rise up to ${priceUsd(levels.entry)}`
          : p < levels.entry
            ? `a rally back up to ${priceUsd(levels.entry)}`
            : `a drop down to ${priceUsd(levels.entry)}`;
    watch = {
      plain: `Watch for ${toward}${levels.entryAwaitsCrossing ? ", once the old level has been crossed" : ""}. The order goes in only after a completed 15-minute bar trades there.`,
      full: `Watch for ${toward}${levels.entryAwaitsCrossing ? " after the crossing closes" : ""}; the entry confirms on a closed 15-minute bar at the level, and is placed at the market.`,
    };
  }

  return {
    brief: {
      version: 1,
      asOf: dateKey(last?.t ?? asOfIso),
      side: input.side,
      call,
      forCall: forCall.map((p) => p.text),
      forOther: forOther.map((p) => p.text),
      decidingLine,
      decide: { callLine, otherLine: levels ? levels.stop : null },
      plan,
      timing,
      wrongIf,
      watch,
    },
    trace: { symbol: input.symbol, rules: [...new Set(rules)] },
  };
}

/**
 * How a session's close read against the brief's deciding line: "call" when
 * it closed beyond the line that settles the call its way, "wrong" when it
 * closed beyond the stop, "open" otherwise.
 */
export function readDecidingLine(brief: Pick<SetupBrief, "side" | "decide">, close: number): "call" | "wrong" | "open" {
  const buy = brief.side === "buy";
  const { callLine, otherLine } = brief.decide;
  if (otherLine != null && (buy ? close < otherLine : close > otherLine)) return "wrong";
  if (callLine != null && (buy ? close > callLine : close < callLine)) return "call";
  return "open";
}

/** A stored brief is used only when it is this version's shape. */
export function isSetupBrief(x: unknown): x is SetupBrief {
  if (!x || typeof x !== "object") return false;
  const b = x as Partial<SetupBrief>;
  return b.version === 1 && Array.isArray(b.plan) && Array.isArray(b.forCall) && Array.isArray(b.forOther) && !!b.call && !!b.decide;
}
