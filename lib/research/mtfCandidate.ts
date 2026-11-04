/**
 * MTF-R0.1: an executable timing reconstruction, owner-private research.
 *
 * Rebuilt in TypeScript from the owner's R0.1 package of 2026-11-04 (its
 * Python files, `mtf_candidate.py` and `test_mtf_candidate.py`, were not in
 * the repository or the project files, so the procedure below is the
 * package's written spec, step for step). It is a deterministic candidate
 * forecasting procedure built from disclosed timing ingredients. It is NOT a
 * claim to have recovered the original "Master Time Factor", and it has no
 * demonstrated market performance.
 *
 * Research only. Nothing on the verdict, scan, plan or order path imports
 * this module, and nothing it produces reaches a member (confidential-source
 * rule; "Forward-looking claims"). `lib/__tests__/mtfIsolation.test.ts`
 * fails the build if a non-research module imports it.
 *
 * Source ingredients (package provenance; read from the compiled course
 * "wdgann method in detail", ch. 7 from compiled p. 214, its earlier
 * forecasting instructions, and ch. 13's calculator discussion):
 * - count cycles from the instrument's own tops and bottoms, major and minor;
 * - ordinary reactions run about 2 to 4 weeks, rapid culminations about 6 to
 *   7 weeks;
 * - examine time together with price and trend position.
 * The chapter heading "Master Time Factor" is a compiler's; the November 1935
 * Forecasting lesson never uses the term (docs/agents/04-gann-research-memory.md).
 * The 20-, 60-, 56.75- and 90-year master periods belong to different lessons
 * and are never merged into one constant here.
 *
 * The procedure (the package's steps 1-10):
 * 1. Issue only after the supplied session closes. Dates are exchange-local
 *    session labels. Every anchor must have occurred and been confirmed by
 *    the issue session; this engine checks declared dates and metadata only,
 *    the adapter (`mtfAdapter.ts`) is responsible for their truth.
 * 2. From each preselected major anchor, the named year counts
 *    1,2,3,5,7,10,15,20,30,50,60 and the twelve starred month counts
 *    45,60,90,120,135,180,225,240,270,300,315,360, once each, never their
 *    multiples.
 * 3. Calendar projections keep calendar-month precision: the whole target
 *    month, not the pivot's day transplanted (an engineering translation of
 *    month arithmetic that fixes no day).
 * 4. From each reaction anchor, 14-28 calendar days (ordinary) or 42-49
 *    (rapid); the mode is fixed at issue by the adapter.
 * 5. Per date, every covering projection is recorded. Year and month counts
 *    are one group, `calendar_recurrence`; durations are `swing_duration`.
 *    Identical aliases from one anchor (5 years = 60 months) are one
 *    projection, and each (episode, group) supports a date at most once.
 * 6. A date is flagged only when at least two declared episodes and both
 *    groups take part (engineering thresholds, not quotations).
 * 7. More than 20% of the horizon flagged: abstain from the whole issue.
 * 8. Contiguous flagged dates form windows, with per-day lineage. A source
 *    window that started by the issue session is never clipped and reissued;
 *    one that ends past the horizon is kept as raw evidence only.
 * 9. Expected type from issue-time context: up -> top watch, down -> bottom
 *    watch, range or unknown -> unspecified. A conditional hypothesis, not a
 *    polarity rule; a wrong top call never becomes a right bottom call.
 * 10. Output: dates, provenance, input hash, status, coverage, precision and
 *    "uncalibrated". Never a probability, price target or order.
 *
 * Three-question basis (design lenses, never evidence):
 * 1. Gann: the ingredients above (compiled course, ch. 7 and 13, tier as
 *    recorded in docs/GANN_HISTORICAL_SOURCES.md for that compilation); every
 *    threshold in steps 3, 6, 7 and 9 is an engineering choice.
 * 2. Cycles: Dewey's chance-first discipline. The procedure is frozen before
 *    any market scoring, scored against nulls that rerun this whole engine
 *    (`mtfEvaluate.ts`), and carried forward prospectively.
 * 3. Hermetic: Correspondence (a long calendar clock nested with a campaign
 *    clock), Rhythm (their return), Cause and Effect (a stated prediction
 *    held to its outcome). Law of Creation: calendar ⊗ campaign is asserted
 *    to be a creation only if the intersection measures better than either
 *    part alone; until then it is treated as a mixture.
 */
import { createHash } from "node:crypto";

export const R01_VERSION = "MTF-R0.1" as const;
export const R01_INPUT_CONTRACT = "MTF-R0.1/input-1" as const;
export const R01_OUTPUT_CONTRACT = "MTF-R0.1/output-1" as const;

export const YEAR_COUNTS = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 60] as const;
export const MONTH_COUNTS = [45, 60, 90, 120, 135, 180, 225, 240, 270, 300, 315, 360] as const;
export const ORDINARY_DAYS = [14, 28] as const;
export const RAPID_DAYS = [42, 49] as const;
/** Engineering choices of steps 6 and 7. */
export const MIN_EPISODES = 2;
export const COVERAGE_BUDGET = 0.2;

export type PivotKind = "top" | "bottom";
export type Trend = "up" | "down" | "range" | "unknown";
export type Group = "calendar_recurrence" | "swing_duration";
export type ReactionMode = "ordinary" | "rapid";
export type ExpectedType = "top_watch" | "bottom_watch" | "unspecified";

export interface MajorAnchor {
  id: string;
  /** Session label of the pivot (YYYY-MM-DD). */
  date: string;
  kind: PivotKind;
  /** Session on which the pivot became known (>= date, <= issue). */
  confirmed: string;
  episode: string;
  source: string;
}

export interface ReactionAnchor extends MajorAnchor {
  mode: ReactionMode;
  /** Why the adapter chose the mode, for lineage. */
  modeSource: string;
}

export interface R01Input {
  contract: typeof R01_INPUT_CONTRACT;
  symbol: string;
  /** The closed session the issue is made after. */
  issueSession: string;
  /** Last calendar date of the forecast horizon (inclusive). */
  horizonEnd: string;
  trend: Trend;
  trendSource: string;
  majorAnchors: MajorAnchor[];
  reactionAnchors: ReactionAnchor[];
  /** Free-form lineage (data snapshot hash, adapter version). Hashed with the rest. */
  lineage?: Record<string, string>;
}

export interface Projection {
  id: string;
  anchorId: string;
  episode: string;
  group: Group;
  /** Every alias that landed on this span, e.g. ["year:5", "month:60"]. */
  rules: string[];
  start: string;
  end: string;
  precision: "calendar_month" | "calendar_day";
  /** eligible: inside the horizon and not started; started: began on or before the issue; beyond_horizon: ends past it. */
  status: "eligible" | "started" | "beyond_horizon";
}

export interface DaySupport {
  episode: string;
  group: Group;
  projectionId: string;
}

export interface R01Window {
  start: string;
  end: string;
  days: { date: string; supports: DaySupport[] }[];
  /** The eligible projections behind the window, with their full nominal spans. */
  sources: string[];
}

export type R01Status = "issued" | "no_forecast" | "abstained_coverage" | "rejected_input";

export interface R01Output {
  contract: typeof R01_OUTPUT_CONTRACT;
  version: typeof R01_VERSION;
  symbol: string;
  inputHash: string;
  status: R01Status;
  reasons: string[];
  issueSession: string;
  horizon: { start: string; end: string; days: number };
  flaggedDays: number;
  coverage: number;
  coverageBudget: number;
  expectedType: ExpectedType;
  windows: R01Window[];
  projections: Projection[];
  calibration: "uncalibrated";
}

/** Options for the controls in `mtfEvaluate.ts`; R0.1 itself is the default. */
export interface R01Rule {
  /** Which supports flag a date. "intersection" is R0.1. */
  flag: "intersection" | "calendar_only" | "swing_only";
  /** Apply the step-7 coverage budget. */
  budget: boolean;
}
export const R01_RULE: R01Rule = { flag: "intersection", budget: true };

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}
export const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
export const isoFromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoFromDay(dayNumber(iso) + n);

/** Month index (year*12 + month-1) of an ISO date. */
export const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const monthStart = (mi: number) => `${Math.floor(mi / 12)}-${String((mi % 12) + 1).padStart(2, "0")}-01`;
const monthEnd = (mi: number) => addDays(monthStart(mi + 1), -1);

/** Calendar months from one date's month to another's, day ignored (Aug 1896 -> Nov 1907 = 135). */
export function calendarMonthsBetween(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from);
}

/** Canonical JSON: object keys sorted, so key order never moves the hash. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const inputHash = (input: R01Input) => sha256(canonicalJson(input));

/** Step 1's declared-date checks. Empty when the input is admissible. */
export function validateInput(input: R01Input): string[] {
  const bad: string[] = [];
  if (input.contract !== R01_INPUT_CONTRACT) bad.push(`contract must be ${R01_INPUT_CONTRACT}`);
  if (!input.symbol) bad.push("symbol missing");
  if (!isIsoDate(input.issueSession)) bad.push("issueSession is not a date");
  if (!isIsoDate(input.horizonEnd)) bad.push("horizonEnd is not a date");
  else if (isIsoDate(input.issueSession) && input.horizonEnd <= input.issueSession) bad.push("horizonEnd must follow issueSession");
  if (!["up", "down", "range", "unknown"].includes(input.trend)) bad.push("trend invalid");
  const ids = new Set<string>();
  const check = (a: MajorAnchor | ReactionAnchor, what: string) => {
    if (!a.id || ids.has(a.id)) bad.push(`${what} id missing or duplicated: ${a.id}`);
    ids.add(a.id);
    if (!a.episode) bad.push(`${a.id}: episode missing`);
    if (a.kind !== "top" && a.kind !== "bottom") bad.push(`${a.id}: kind invalid`);
    if (!isIsoDate(a.date) || !isIsoDate(a.confirmed)) {
      bad.push(`${a.id}: dates invalid`);
      return;
    }
    if (a.confirmed < a.date) bad.push(`${a.id}: confirmed before it occurred`);
    if (isIsoDate(input.issueSession) && a.date > input.issueSession) bad.push(`${a.id}: occurs after the issue session`);
    if (isIsoDate(input.issueSession) && a.confirmed > input.issueSession) bad.push(`${a.id}: not confirmed by the issue session`);
  };
  for (const a of input.majorAnchors ?? []) check(a, "major");
  for (const a of input.reactionAnchors ?? []) {
    check(a, "reaction");
    if (a.mode !== "ordinary" && a.mode !== "rapid") bad.push(`${a.id}: mode must be fixed as ordinary or rapid at issue`);
  }
  return bad;
}

function classify(start: string, end: string, issue: string, horizonEnd: string): Projection["status"] {
  if (start <= issue) return "started";
  if (end > horizonEnd) return "beyond_horizon";
  return "eligible";
}

/** Steps 2-4: every projection that overlaps the horizon (ends after the issue session, starts by the horizon's end), aliases merged per anchor. */
export function projectAll(input: R01Input): Projection[] {
  const out: Projection[] = [];
  const issue = input.issueSession;
  for (const a of input.majorAnchors) {
    const byMonth = new Map<number, string[]>();
    const base = monthIndex(a.date);
    // Only months that overlap the horizon bear on this issue: from the issue's month to the horizon end's.
    const lo = monthIndex(issue);
    const hi = monthIndex(input.horizonEnd);
    const add = (mi: number, rule: string) => {
      if (mi >= lo && mi <= hi) byMonth.set(mi, [...(byMonth.get(mi) ?? []), rule]);
    };
    for (const n of YEAR_COUNTS) add(base + 12 * n, `year:${n}`);
    for (const m of MONTH_COUNTS) add(base + m, `month:${m}`);
    for (const [mi, rules] of [...byMonth].sort((x, y) => x[0] - y[0])) {
      const start = monthStart(mi);
      const end = monthEnd(mi);
      if (end <= issue) continue; // wholly elapsed: no bearing on this issue
      out.push({
        id: `${a.id}@${start.slice(0, 7)}`,
        anchorId: a.id,
        episode: a.episode,
        group: "calendar_recurrence",
        rules,
        start,
        end,
        precision: "calendar_month",
        status: classify(start, end, issue, input.horizonEnd),
      });
    }
  }
  for (const a of input.reactionAnchors) {
    const [lo, hi] = a.mode === "rapid" ? RAPID_DAYS : ORDINARY_DAYS;
    const start = addDays(a.date, lo);
    const end = addDays(a.date, hi);
    if (end <= issue) continue;
    out.push({
      id: `${a.id}+${a.mode}`,
      anchorId: a.id,
      episode: a.episode,
      group: "swing_duration",
      rules: [`${a.mode}:${lo}-${hi}d`],
      start,
      end,
      precision: "calendar_day",
      status: classify(start, end, issue, input.horizonEnd),
    });
  }
  return out.sort((x, y) => (x.start < y.start ? -1 : x.start > y.start ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

export function expectedTypeFor(trend: Trend): ExpectedType {
  return trend === "up" ? "top_watch" : trend === "down" ? "bottom_watch" : "unspecified";
}

/** Steps 5-6 for one date: one support per (episode, group), flagged per the rule. */
function supportsOn(date: string, eligible: Projection[]): DaySupport[] {
  const seen = new Map<string, DaySupport>();
  for (const p of eligible) {
    if (p.start > date || p.end < date) continue;
    const key = `${p.episode}\u0000${p.group}`;
    if (!seen.has(key)) seen.set(key, { episode: p.episode, group: p.group, projectionId: p.id });
  }
  return [...seen.values()];
}

function flagged(s: DaySupport[], rule: R01Rule): boolean {
  if (rule.flag === "calendar_only") return s.some((x) => x.group === "calendar_recurrence");
  if (rule.flag === "swing_only") return s.some((x) => x.group === "swing_duration");
  const episodes = new Set(s.map((x) => x.episode));
  const groups = new Set(s.map((x) => x.group));
  return episodes.size >= MIN_EPISODES && groups.has("calendar_recurrence") && groups.has("swing_duration");
}

/** The whole procedure for one issue. Pure and deterministic. */
export function runR01(input: R01Input, rule: R01Rule = R01_RULE, opts: { hash?: boolean } = {}): R01Output {
  // The evaluation's null reruns skip the hash (it names an issue, it does not change one); every stored issue carries it.
  const hash = opts.hash === false ? "" : inputHash(input);
  const reasons = validateInput(input);
  const expectedType = expectedTypeFor(input.trend);
  const okDates = isIsoDate(input.issueSession) && isIsoDate(input.horizonEnd) && input.horizonEnd > input.issueSession;
  const horizon = okDates
    ? { start: addDays(input.issueSession, 1), end: input.horizonEnd, days: dayNumber(input.horizonEnd) - dayNumber(input.issueSession) }
    : { start: "", end: "", days: 0 };
  const base = {
    contract: R01_OUTPUT_CONTRACT,
    version: R01_VERSION,
    symbol: input.symbol,
    inputHash: hash,
    issueSession: input.issueSession,
    horizon,
    coverageBudget: COVERAGE_BUDGET,
    expectedType,
    calibration: "uncalibrated" as const,
  };
  if (reasons.length) return { ...base, status: "rejected_input", reasons, flaggedDays: 0, coverage: 0, windows: [], projections: [] };

  const projections = projectAll(input);
  const eligible = projections.filter((p) => p.status === "eligible");
  const days: { date: string; supports: DaySupport[] }[] = [];
  for (let d = dayNumber(horizon.start); d <= dayNumber(horizon.end); d++) {
    const date = isoFromDay(d);
    const s = supportsOn(date, eligible);
    if (flagged(s, rule)) days.push({ date, supports: s });
  }
  const coverage = days.length / horizon.days;
  if (rule.budget && coverage > COVERAGE_BUDGET) {
    return { ...base, status: "abstained_coverage", reasons: [`${days.length} of ${horizon.days} horizon days flagged (${(coverage * 100).toFixed(1)}% > ${COVERAGE_BUDGET * 100}%)`], flaggedDays: days.length, coverage, windows: [], projections };
  }
  const windows: R01Window[] = [];
  for (const day of days) {
    const last = windows.at(-1);
    if (last && dayNumber(day.date) === dayNumber(last.end) + 1) {
      last.end = day.date;
      last.days.push(day);
    } else windows.push({ start: day.date, end: day.date, days: [day], sources: [] });
  }
  for (const w of windows) w.sources = [...new Set(w.days.flatMap((d) => d.supports.map((s) => s.projectionId)))].sort();
  return { ...base, status: windows.length ? "issued" : "no_forecast", reasons: [], flaggedDays: days.length, coverage, windows, projections };
}

/**
 * Digital root as metadata only (never moves a date or direction): a
 * positive plain decimal string, separator removed, digit sum mod 9 with 0
 * read as 9. "125.40" -> 3. Zero, negative, non-finite, exponent-form or
 * otherwise malformed strings throw.
 */
export function decimalDigitalRoot(value: string): number {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) throw new Error(`not a positive plain decimal string: ${String(value)}`);
  const digits = value.replace(".", "");
  if (!/[1-9]/.test(digits)) throw new Error("zero is rejected");
  let sum = 0;
  for (const ch of digits) sum += ch.charCodeAt(0) - 48;
  return sum % 9 === 0 ? 9 : sum % 9;
}
