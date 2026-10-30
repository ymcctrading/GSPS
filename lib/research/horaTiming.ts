/**
 * Hora and Choghadiya, the Vedic planetary-hour systems, against the hours
 * SPY and DIA make their daily high and low, 2016-2025. Research only:
 * nothing on the verdict path imports this module, and nothing here reaches
 * a member.
 *
 * The owner shared an article on them (2026-10-30) as "auspicious timing and
 * cosmic alignment". The article could not be opened from this environment,
 * so the rules are the standard Panchang ones, fixed before scoring:
 * - The day runs from sunrise to sunset at the exchange (New York,
 *   40.7069° N, 74.0113° W), computed (astronomy-engine). Every regular
 *   session sits inside it.
 * - Hora: the day in 12 equal parts. The first is ruled by the weekday's
 *   lord (Sunday the Sun, Monday the Moon, then Mars, Mercury, Jupiter, Venus,
 *   Saturn); each next part by the next planet in the Chaldean order
 *   (Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon).
 * - Choghadiya: the day in 8 equal parts in the same order from the same
 *   lord: Udveg (Sun), Char (Venus), Labh (Mercury), Amrit (Moon), Kaal
 *   (Saturn), Shubh (Jupiter), Rog (Mars). Good: Amrit, Shubh, Labh; neutral:
 *   Char; bad: Udveg, Kaal, Rog.
 * - Turns: the 15-minute bar printing each session's high and its low
 *   (`intradayTurnTimes.json`, from `scripts/build-intraday-turn-times.py`),
 *   read at the bar's midpoint.
 * - Null: each session keeps its date, sun and lord and takes the turn clock
 *   times of a random session on the same weekday (`horaTest`'s
 *   `sameWeekday`). Recorded plainly: the first null run drew the lord at
 *   random, and every test passed it (p below 0.001). On inspection it cannot
 *   tell a planetary hour from a weekday: the Hora ruler at a clock time is
 *   fixed by the weekday and the season, so any weekday pattern in turn
 *   times passes it. The same-weekday null was then chosen as the test; both
 *   are reported (`rotateLord` kept for comparison). 20,000 seeded draws; p
 *   two-sided for the counts, upper-tail for the Hora spread.
 * - Tests: per symbol, turns in bad Choghadiya, turns in good Choghadiya, and
 *   the spread of turns across the seven Hora rulers (a chi-square statistic):
 *   6 tests, so a result needs p below 0.05 / 6 ≈ 0.0083.
 *
 * Three-question basis:
 * 1. Source: none in the author's books; the systems are Vedic, tested as the
 *    article's claim.
 * 2. Cycles: a seven-day rotation; Dewey's rule on a rule fixed first.
 * 3. Hermetic: Rhythm and Correspondence, held as the claim under test.
 */
import { Body, Observer, SearchRiseSet } from "astronomy-engine";
import { seeded } from "@/lib/research/preregisteredTimeTests";
import turnsJson from "@/lib/research/intradayTurnTimes.json";

export const CHALDEAN = ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"] as const;
export type Ruler = (typeof CHALDEAN)[number];
/** The weekday's lord, Sunday first (`Date#getUTCDay`). */
export const WEEKDAY_LORD: readonly Ruler[] = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
export const CHOGHADIYA: Record<Ruler, { name: string; kind: "good" | "neutral" | "bad" }> = {
  Sun: { name: "Udveg", kind: "bad" },
  Venus: { name: "Char", kind: "neutral" },
  Mercury: { name: "Labh", kind: "good" },
  Moon: { name: "Amrit", kind: "good" },
  Saturn: { name: "Kaal", kind: "bad" },
  Jupiter: { name: "Shubh", kind: "good" },
  Mars: { name: "Rog", kind: "bad" },
};
export const HORA_SYMBOLS = ["SPY", "DIA"] as const;
export const HORA_TESTS = HORA_SYMBOLS.length * 3;
export const HORA_DRAWS = 20_000;

const NYSE = new Observer(40.7069, -74.0113, 10);
const MIN = 60_000;

const sunCache = new Map<string, { rise: number; set: number }>();
/** Sunrise and sunset at the exchange on a New York calendar date, epoch ms. */
export function sunDay(date: string): { rise: number; set: number } {
  const hit = sunCache.get(date);
  if (hit) return hit;
  // 05:00 UTC is midnight or 01:00 in New York, before any sunrise there.
  const from = new Date(`${date}T05:00:00Z`);
  const rise = SearchRiseSet(Body.Sun, NYSE, +1, from, 1);
  const set = SearchRiseSet(Body.Sun, NYSE, -1, from, 1);
  if (!rise || !set) throw new Error(`no sunrise or sunset for ${date}`);
  const v = { rise: rise.date.getTime(), set: set.date.getTime() };
  sunCache.set(date, v);
  return v;
}

/** The part (0-based) of the day `t` falls in when the day is cut in `parts`, or null outside the day. */
function partOf(date: string, t: number, parts: number): number | null {
  const { rise, set } = sunDay(date);
  if (t < rise || t >= set) return null;
  return Math.floor(((t - rise) / (set - rise)) * parts);
}

/** The ruler of part `k` from the lord at index `lordIndex` of the Chaldean order. */
const rulerFrom = (lordIndex: number, k: number): Ruler => CHALDEAN[(lordIndex + k) % 7];
const lordIndexOf = (date: string) => CHALDEAN.indexOf(WEEKDAY_LORD[new Date(`${date}T12:00:00Z`).getUTCDay()]);

export function horaAt(date: string, t: number, lordIndex = lordIndexOf(date)): Ruler | null {
  const k = partOf(date, t, 12);
  return k === null ? null : rulerFrom(lordIndex, k);
}

export function choghadiyaAt(date: string, t: number, lordIndex = lordIndexOf(date)): Ruler | null {
  const k = partOf(date, t, 8);
  return k === null ? null : rulerFrom(lordIndex, k);
}

interface TurnDay {
  date: string;
  weekday: number;
  /** New York midnight of the date, epoch ms. */
  midnight: number;
  /** The high's and the low's bar midpoints, as minutes after New York midnight. */
  minutes: [number, number];
}

const TURNS = (turnsJson as unknown as { symbols: Record<(typeof HORA_SYMBOLS)[number], [string, number, number][]> }).symbols;

const nyClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" });
const nyMinutes = (t: number) => {
  const [h, m] = nyClock.format(new Date(t)).split(":").map(Number);
  return (h % 24) * 60 + m;
};

function turnDays(symbol: (typeof HORA_SYMBOLS)[number]): TurnDay[] {
  return TURNS[symbol].map(([date, hi, lo]) => {
    const minutes: [number, number] = [nyMinutes(hi * MIN), nyMinutes(lo * MIN)];
    return { date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), midnight: hi * MIN - minutes[0] * MIN, minutes };
  });
}

interface Tally {
  bad: number;
  good: number;
  hora: number[];
}

/** Tallies turns at `minutes[i]` after day i's midnight, under day i's sun and the lord `lords[i]`. */
function tally(days: TurnDay[], lords: number[], minutes: [number, number][]): Tally {
  const out: Tally = { bad: 0, good: 0, hora: [0, 0, 0, 0, 0, 0, 0] };
  days.forEach((d, i) => {
    for (const m of minutes[i]) {
      const t = d.midnight + m * MIN;
      const h = partOf(d.date, t, 12);
      const c = partOf(d.date, t, 8);
      if (h !== null) out.hora[(lords[i] + h) % 7]++;
      if (c !== null) {
        const kind = CHOGHADIYA[rulerFrom(lords[i], c)].kind;
        if (kind === "bad") out.bad++;
        else if (kind === "good") out.good++;
      }
    }
  });
  return out;
}

export type HoraNull = "sameWeekday" | "rotateLord";

export interface HoraResult {
  symbol: (typeof HORA_SYMBOLS)[number];
  nullModel: HoraNull;
  sessions: number;
  turns: number;
  bad: { observed: number; expected: number; p: number };
  good: { observed: number; expected: number; p: number };
  /** Turns per Hora ruler, in the Chaldean order, against the null's mean. */
  hora: { observed: number[]; expected: number[]; chi2: number; p: number };
}

const chi2 = (obs: number[], exp: number[]) => obs.reduce((a, o, i) => a + (exp[i] ? (o - exp[i]) ** 2 / exp[i] : 0), 0);

/**
 * Two nulls. `sameWeekday` (the test): each session keeps its date, sun and
 * lord, and takes the turn clock times of a random session on the same
 * weekday, so the weekday's own pattern of turn times is kept and only where
 * the sun-anchored hours fall can matter. `rotateLord` (for comparison): the
 * lord is drawn at random, which also breaks the weekday pattern, so a
 * weekday effect alone can pass it; the Hora ruler at a clock time is fixed
 * by the weekday and the season, so this null cannot separate the two.
 */
export function horaTest(symbol: (typeof HORA_SYMBOLS)[number], nullModel: HoraNull = "sameWeekday", seed = 20261030): HoraResult {
  const days = turnDays(symbol);
  const lords = days.map((d) => lordIndexOf(d.date));
  const own = days.map((d) => d.minutes);
  const actual = tally(days, lords, own);
  const byWeekday = new Map<number, number[]>();
  days.forEach((d, i) => byWeekday.set(d.weekday, [...(byWeekday.get(d.weekday) ?? []), i]));
  const rnd = seeded(seed);
  const draws: Tally[] = [];
  for (let i = 0; i < HORA_DRAWS; i++) {
    if (nullModel === "rotateLord") draws.push(tally(days, days.map(() => Math.floor(rnd() * 7)), own));
    else
      draws.push(
        tally(
          days,
          lords,
          days.map((d) => {
            const pool = byWeekday.get(d.weekday)!;
            return days[pool[Math.floor(rnd() * pool.length)]].minutes;
          }),
        ),
      );
  }
  const mean = (f: (t: Tally) => number) => draws.reduce((a, t) => a + f(t), 0) / draws.length;
  const twoSided = (obs: number, f: (t: Tally) => number) => {
    const ge = draws.filter((t) => f(t) >= obs).length;
    const le = draws.filter((t) => f(t) <= obs).length;
    return Math.min(1, (2 * Math.min(ge, le) + 1) / (HORA_DRAWS + 1));
  };
  const expHora = CHALDEAN.map((_, k) => mean((t) => t.hora[k]));
  const obsChi = chi2(actual.hora, expHora);
  const geChi = draws.filter((t) => chi2(t.hora, expHora) >= obsChi).length;
  return {
    symbol,
    nullModel,
    sessions: days.length,
    turns: days.length * 2,
    bad: { observed: actual.bad, expected: mean((t) => t.bad), p: twoSided(actual.bad, (t) => t.bad) },
    good: { observed: actual.good, expected: mean((t) => t.good), p: twoSided(actual.good, (t) => t.good) },
    hora: { observed: actual.hora, expected: expHora, chi2: obsChi, p: (geChi + 1) / (HORA_DRAWS + 1) },
  };
}

export function horaAll(nullModel: HoraNull = "sameWeekday"): HoraResult[] {
  return HORA_SYMBOLS.map((s) => horaTest(s, nullModel));
}
