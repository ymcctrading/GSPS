/**
 * Solar eclipse dates for the eclipse test (C-ASTRO-07; Meadors, W029: "the
 * day before and the day after a solar eclipse matter"). Research only: no
 * criterion, gate, plan, entry or order reads this (CYC-41). The test itself
 * is `eventDateTest.ts#eventTurnRate` with a ±1 day window.
 *
 * Gann: none; not sourced to Gann. Dates from astronomy-engine (the
 * ephemeris `planetaryAverages.ts` uses), at the eclipse peak, UTC day.
 * Cycles and Hermetic basis as in `eventDateTest.ts`.
 */
import { NextGlobalSolarEclipse, SearchGlobalSolarEclipse } from "astronomy-engine";

const DAY = 86_400_000;

/** UTC midnights (ms) of every global solar eclipse peak in [from, to). */
export function solarEclipseDates(from: number, to: number): number[] {
  const out: number[] = [];
  let e = SearchGlobalSolarEclipse(new Date(from));
  while (e.peak.date.getTime() < to) {
    out.push(Math.floor(e.peak.date.getTime() / DAY) * DAY);
    e = NextGlobalSolarEclipse(e.peak);
  }
  return out;
}
