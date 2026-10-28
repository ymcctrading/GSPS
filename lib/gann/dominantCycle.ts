/**
 * The dominant cycle: of the years Gann laid back over the current one, the
 * one whose path the market is following now.
 *
 * Gann laid the decades back over the year he forecast, then named the one he
 * expected to repeat: for 1936 he set 1866, 1876, 1886, 1896, 1906, 1916 and
 * 1926 together and wrote "I expect the 1896 cycle to repeat in 1936" (Master
 * Course Ch. 7, PDF 227-228); for 1929 he compared 1919, 1909, 1899 and 1869
 * (PDF 224-225). `massPressure.ts` averages the decades; this reads the step
 * after it, the one cycle the forecast follows. James Flanagan's reading of
 * the Master Time Factor (a secondary source, checked 2026-10-28) calls it the
 * "dominant cycle" and picks it by how well each past cycle's tops and bottoms
 * line up with the market's; Gann gives no measure for the choice, so the
 * measure below is an engineering choice, labelled.
 *
 * Built: for each year back in `MASS_PRESSURE_YEARS` (10 to 70, the 1936
 * lesson's), count the last `ALIGNMENT_MONTHS` completed months in which the
 * market's monthly move and that year's move in the same calendar month went
 * the same way. The year with the most agreements, at least two thirds of the
 * months read, is the dominant cycle, and its move in the month read (centred,
 * as `readCurve` reads it) is its direction. A tie between years that point
 * opposite ways, or no year at two thirds, reads nothing.
 *
 * Where it acts: nowhere yet. It is context on the rules
 * (`DisclosedRulesContext.dominantCycle`) and a measured factor
 * (`dominantCycleWithTrade`). Measured before wiring, 2026-10-28, on the record
 * itself (972 months, 1945-2025, the record standing in for the market's daily
 * bars): a dominant decade stood out in 72% of months and called the month's
 * centred move right 53.4% of the time, against 57.3% for the decades' average
 * (`massPressure.ts`, which P1 reads) and a 65.4% share of rising months; it
 * disagreed with the average in 24% of months. The choosing rule is not
 * Gann's, and this one made the forecast worse, so P1 keeps the average; the
 * replay's factor table is where a better rule would show.
 *
 * Engineering choices, labelled:
 * - The market's recent months are its own daily bars (SPY on both surfaces),
 *   averaged by New York month as the record's figures are; the past years are
 *   the record (`marketHistory.json`, Shiller's monthly S&P composite).
 * - A month agrees when the two moves have the same sign (a turn in the same
 *   month is a change of sign in the same month, so this is "tops and bottoms
 *   aligned" read month by month). 12 months, at least 6 read, two thirds to
 *   count.
 * - Only Gann's own decades are candidates: picking the best of more cycles
 *   would find a match by chance more often (Dewey's multiple-comparison
 *   caution, C06).
 *
 * Three-question basis:
 * 1. Gann: Tier A for laying the decades and following the one that repeats;
 *    the alignment measure is Flanagan's idea (secondary) made concrete here.
 * 2. Cycles: a decade-period recurrence claim, as `massPressure.ts`. Dewey's
 *    dominance item is the point of this reading (one cycle chosen over the
 *    rest); constancy of period, phase resumption and wave-shape identity are
 *    not cleared, and the choice is re-made every month, so it is measured in
 *    the replay rather than claimed.
 * 3. Hermetic: Correspondence (the past year mirrors this one) and Rhythm.
 */
import { MASS_PRESSURE_YEARS, marketMonth } from "@/lib/gann/massPressure";
import { etDateKey } from "@/lib/market/session";
import type { Bar } from "@/lib/types";

export const ALIGNMENT_MONTHS = 12;
export const MIN_ALIGNMENT_MONTHS = 6;
/** Two thirds of the months read must agree. */
export const MIN_AGREEMENT_SHARE = 2 / 3;

export interface DominantCycleReading {
  /** The New York month read, "YYYY-MM". */
  month: string;
  /** The years back that agreed best (more than one only when they point the same way). */
  yearsBack: number[];
  /** Months that agreed, of `monthsRead`. */
  agreed: number;
  monthsRead: number;
  direction: "bullish" | "bearish";
}

function shift(year: number, month: number, by: number): [number, number] {
  const n = year * 12 + (month - 1) + by;
  return [Math.floor(n / 12), (n % 12) + 1];
}

const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** The market's completed New York months before `month`, as average closes, oldest first. */
function recentMonths(marketDaily: Bar[], month: string): { y: number; m: number; avg: number }[] {
  const sums = new Map<string, { s: number; n: number }>();
  for (const b of marketDaily) {
    if (!(b.c > 0)) continue;
    const key = etDateKey(new Date(b.t)).slice(0, 7);
    if (key >= month) continue;
    const cur = sums.get(key) ?? { s: 0, n: 0 };
    cur.s += b.c;
    cur.n += 1;
    sums.set(key, cur);
  }
  return [...sums.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, { s, n }]) => {
      const [y, m] = k.split("-").map(Number);
      return { y, m, avg: s / n };
    });
}

/**
 * The dominant cycle at the New York month of `asOf`, from the market's daily
 * bars up to the session read (the caller cuts them; only months before the
 * month read are used, so nothing ahead is read).
 */
export function readDominantCycle(asOf: Date, marketDaily: Bar[] | null): DominantCycleReading | null {
  if (!marketDaily || marketDaily.length === 0) return null;
  const [year, month] = etDateKey(asOf).split("-").map(Number);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const months = recentMonths(marketDaily, monthKey);

  // Monthly moves between calendar-consecutive months, the latest last.
  const moves: { y: number; m: number; change: number }[] = [];
  for (let i = 1; i < months.length; i += 1) {
    const [py, pm] = shift(months[i].y, months[i].m, -1);
    if (months[i - 1].y !== py || months[i - 1].m !== pm) continue;
    moves.push({ y: months[i].y, m: months[i].m, change: months[i].avg / months[i - 1].avg - 1 });
  }
  const read = moves.slice(-ALIGNMENT_MONTHS);
  if (read.length < MIN_ALIGNMENT_MONTHS) return null;

  const scored: { back: number; agreed: number; direction: number }[] = [];
  for (const back of MASS_PRESSURE_YEARS) {
    let agreed = 0;
    let complete = true;
    for (const mv of read) {
      const now = marketMonth("stocks", mv.y - back, mv.m);
      const prev = marketMonth("stocks", ...shift(mv.y - back, mv.m, -1));
      if (now === null || prev === null) {
        complete = false;
        break;
      }
      const s = sign(now / prev - 1);
      if (s !== 0 && s === sign(mv.change)) agreed += 1;
    }
    if (!complete) continue;
    const before = marketMonth("stocks", ...shift(year - back, month, -1));
    const after = marketMonth("stocks", ...shift(year - back, month, 1));
    if (before === null || after === null) continue;
    scored.push({ back, agreed, direction: sign(after / before - 1) });
  }
  if (scored.length === 0) return null;

  const best = Math.max(...scored.map((s) => s.agreed));
  if (best < Math.ceil(MIN_AGREEMENT_SHARE * read.length)) return null;
  const top = scored.filter((s) => s.agreed === best);
  const direction = top[0].direction;
  if (direction === 0 || top.some((s) => s.direction !== direction)) return null;
  return {
    month: monthKey,
    yearsBack: top.map((s) => s.back),
    agreed: best,
    monthsRead: read.length,
    direction: direction > 0 ? "bullish" : "bearish",
  };
}
