/**
 * A-TIME-14, the part Gann discloses: a year is forecast from the years 10,
 * 20, 30 and 60 back ("1932 will run like 1902, 1912, 1922", Master Course
 * Ch.2 PDF 51-52 Rule 9; "for the 1929 forecast, I compared 1919 … 1909 …
 * 1899 … and 1869", Ch.7 PDF 224-225; confirmed in the W023 reading notes,
 * 2026-10-16). Context only: nothing here moves a score, gate, plan or order,
 * and no date ahead is shown to a person ("Forward-looking claims").
 *
 * What he does not disclose, and so is not built: why a year splits into two
 * bull and two bear campaigns (W036's "Cycle Theory").
 *
 * The reading is the month ahead in each analogue year that the monthly bars
 * reach: up if that year's next month closed above the current month, down
 * if below. With 13 years of monthly bars (`LONG_MONTHLY_YEARS`) only the
 * 10-year analogue is usually in reach. Engineering choice, labelled as
 * such: the month ahead is the unit compared, and `agreed` needs every
 * reachable analogue to point the same way.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: a decade-period recurrence claim; Dewey's checklist is not
 *    cleared (one or two repetitions in reach), so it stays context and is
 *    measured.
 * 3. Hermetic: Rhythm (the pendulum swing repeats at its period) and
 *    Correspondence (the analogue year mirrors this one).
 */
import type { Bar } from "@/lib/types";

export const ANALOGUE_YEARS = [10, 20, 30, 60] as const;

export interface DecadeAnalogue {
  yearsBack: number;
  year: number;
  direction: "up" | "down" | "flat";
}

export interface DecadeAnalogueReading {
  analogues: DecadeAnalogue[];
  agreed: "up" | "down" | null;
}

export function readDecadeAnalogue(monthly: Bar[] | null, asOf: Date): DecadeAnalogueReading | null {
  if (!monthly || monthly.length === 0) return null;
  const byMonth = new Map(monthly.map((b) => [b.t.slice(0, 7), b.c]));
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth() + 1;
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const analogues: DecadeAnalogue[] = [];
  for (const back of ANALOGUE_YEARS) {
    const y = year - back;
    const now = byMonth.get(key(y, month));
    const next = month === 12 ? byMonth.get(key(y + 1, 1)) : byMonth.get(key(y, month + 1));
    if (now === undefined || next === undefined) continue;
    analogues.push({ yearsBack: back, year: y, direction: next > now ? "up" : next < now ? "down" : "flat" });
  }
  if (analogues.length === 0) return null;
  const first = analogues[0].direction;
  const agreed = first !== "flat" && analogues.every((a) => a.direction === first) ? first : null;
  return { analogues, agreed };
}

export function describeDecadeAnalogue(r: DecadeAnalogueReading): string[] {
  if (!r.agreed) return [];
  const years = r.analogues.map((a) => a.year).join(", ");
  return [`In ${years}, the same point of the decade, the month ahead closed ${r.agreed}.`];
}
