/**
 * New and Full Moon dates for the lunar test (C-ASTRO-10; Bucholtz, W013
 * pp.29-92). Research only: no criterion, gate, plan, entry or order reads
 * this (CYC-41). The test is `eventDateTest.ts#eventTurnRate` with a ±1 day
 * window. Bucholtz's "first traded on a New Moon" subset is not built: GSPS
 * has no listing dates (Wikidata inception is incorporation).
 *
 * Gann: none; not sourced to Gann. Dates from astronomy-engine, UTC day.
 * Cycles and Hermetic basis as in `eventDateTest.ts`.
 */
import { SearchMoonPhase } from "astronomy-engine";

const DAY = 86_400_000;

/** New (0°) and Full (180°) Moons in [from, to), UTC midnights (ms), in date order. */
export function newAndFullMoons(from: number, to: number): { phase: "new" | "full"; at: number }[] {
  const out: { phase: "new" | "full"; at: number }[] = [];
  for (const [phase, lon] of [["new", 0], ["full", 180]] as const) {
    let t = SearchMoonPhase(lon, new Date(from), 40);
    while (t && t.date.getTime() < to) {
      out.push({ phase, at: Math.floor(t.date.getTime() / DAY) * DAY });
      t = SearchMoonPhase(lon, t.AddDays(1), 40);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
