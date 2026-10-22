/**
 * A-OTHER-05, Gann's mass pressure: the market's own cycle, read by laying the
 * years 10 to 70 back, decade by decade, over this one.
 *
 * Gann names mass pressure as his fifth forecasting factor, the public's
 * over-optimism or pessimism repeating after a cycle, "a curve calculable 100
 * years ahead with minor corrections" (*Commodities* pp. 11-12, 16), and in the
 * Master Course he shows how the curve is drawn: "for the 1929 forecast, I
 * compared 1919 … 1909 … 1899 … and 1869" (Ch. 7, PDF 224-225), on his
 * Master 20-Year Forecasting Chart of the averages from 1831; for 1936 he laid
 * 1876, 1896, 1916, 1866, 1886, 1906 and 1926 together and expected "the 1896
 * cycle to repeat" (PDF 227-228); "there is no other way, outside of using the
 * 20 and 60-year cycle" (PDF 226). The 20 and 60-year counts are his Master
 * Time Period readings of the same chapter (PDF 218-219).
 *
 * Built: the market's composite curve at this month is the average of the
 * month's move in each of the years 10 to 70 back (`MASS_PRESSURE_YEARS`), and its direction
 * is the curve's slope. It acts in P1's cycle check (`marketCyclePillar`): a
 * trade whose market cycle runs against it does not take the point.
 *
 * Engineering choices, labelled:
 * - The record is Shiller's monthly S&P composite from 1871
 *   (`marketHistory.json`, `scripts/fetch-market-history.mjs`), a stand-in for
 *   the Dow and the railroad averages Gann read.
 * - A month's figure is the average of its daily closes, so the month's move
 *   is read centred, from the month before to the month after.
 * - The years count equally (Gann ranks none of them above another) and
 *   the direction is the sign of their average (Gann gives no threshold).
 * - The month is New York's, as the decade digit reads it (`etDateKey`).
 *
 * Not built: the 100-year curve's "minor corrections at fixed intervals" (not
 * disclosed), and the stock's own analogue years (`decadeAnalogue.ts`, context).
 * No date ahead is shown to a person ("Forward-looking claims").
 *
 * Three-question basis:
 * 1. Gann: Tier A, as cited.
 * 2. Cycles: a decade-period recurrence claim on 150 years of one series.
 *    Dewey's checklist: repetition count cleared (15 decades); dominance,
 *    constancy of period, phase resumption, wave-shape identity and
 *    cross-series clustering not cleared. It acts on Gann's word (owner,
 *    2026-10-01, "Every Gann method acts") and is measured in the replay.
 * 3. Hermetic: Rhythm, the pendulum's swing returning at its period, and
 *    Correspondence, the earlier year mirroring this one.
 */
import history from "@/lib/gann/marketHistory.json";
import { etDateKey } from "@/lib/market/session";

/**
 * Every decade back to 70 years, as the 1936 forecast laid them (1926 to 1866,
 * PDF 227-228); the 1929 forecast's 10, 20, 30 and 60 (PDF 224-225) are among
 * them. The later lesson is the fuller statement, so it is the one built.
 */
export const MASS_PRESSURE_YEARS = [10, 20, 30, 40, 50, 60, 70] as const;

interface MarketHistory {
  start: string;
  stocks: (number | null)[];
  rate: (number | null)[];
  cpi: (number | null)[];
}

export interface MassPressureReading {
  /** The New York month read, "YYYY-MM". */
  month: string;
  /** Each year back the record reaches, with its centred move in the month (a fraction). */
  years: { yearsBack: number; year: number; change: number }[];
  /** The average of those moves. */
  composite: number;
  direction: "bullish" | "bearish" | null;
}

const record = history as MarketHistory;
const [startYear, startMonth] = record.start.split("-").map(Number);

/** The record's figure for a calendar month, or null outside it. */
export function marketMonth(series: "stocks" | "rate" | "cpi", year: number, month: number): number | null {
  const i = (year - startYear) * 12 + (month - startMonth);
  const v = i >= 0 ? record[series][i] : undefined;
  return v ?? null;
}

function shift(year: number, month: number, by: number): [number, number] {
  const n = year * 12 + (month - 1) + by;
  return [Math.floor(n / 12), (n % 12) + 1];
}

/**
 * The market's composite curve at the New York month of `asOf`. Every month
 * read is at least ten years before it, so nothing is read ahead.
 */
export function readMassPressure(asOf: Date): MassPressureReading | null {
  const [year, month] = etDateKey(asOf).split("-").map(Number);
  const years: MassPressureReading["years"] = [];
  for (const back of MASS_PRESSURE_YEARS) {
    const y = year - back;
    const before = marketMonth("stocks", ...shift(y, month, -1));
    const after = marketMonth("stocks", ...shift(y, month, 1));
    if (before === null || after === null) continue;
    years.push({ yearsBack: back, year: y, change: after / before - 1 });
  }
  if (years.length === 0) return null;
  const composite = years.reduce((s, r) => s + r.change, 0) / years.length;
  return {
    month: `${year}-${String(month).padStart(2, "0")}`,
    years,
    composite,
    direction: composite > 0 ? "bullish" : composite < 0 ? "bearish" : null,
  };
}

export function describeMassPressure(r: MassPressureReading): string {
  const list = r.years.map((y) => y.year).join(", ");
  const way = r.direction === "bullish" ? "rising" : r.direction === "bearish" ? "falling" : "flat";
  return `The market's cycle from ${list}, laid over this month, is ${way}.`;
}
