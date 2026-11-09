/**
 * Whether turns cluster around a list of dated events, against a circular
 * shift (C-ASTRO-07 eclipses, C-ASTRO-10 moon phases). Research only: no
 * criterion, gate, plan, entry or order reads this (CYC-41).
 *
 * Fixed before any data is read:
 * - An event is caught when a turn's session lies within ±`windowDays` of it.
 * - The statistic is the share of in-record events caught.
 * - The base rate moves every event forward by s days, s = 1..364, wrapping
 *   round the record's span; p = (shifts scoring ≥ observed + 1) / 365.
 * Turns are the caller's (in the runs, completed pivots of the weekly swing
 * chart, as in `timeWindowBaseRate.ts`).
 *
 * Gann: none; the event lists are not sourced to Gann (Meadors W029,
 * Bucholtz W013). Cycles: Dewey's recurrent-event statistic, a hit rate
 * against a base rate (CYC-24). Hermetic: Rhythm, held as a hypothesis.
 */
const DAY = 86_400_000;
export const SHIFTS = 364;

export interface EventTurnRate {
  events: number;
  observed: number;
  shiftedMean: number;
  p: number;
}

/** `sessions` are each bar's UTC midnight (ms), `turns` indices into it, `events` ms timestamps. */
export function eventTurnRate(sessions: number[], turns: number[], events: number[], windowDays = 1): EventTurnRate {
  const first = sessions[0] ?? 0;
  const span = (sessions[sessions.length - 1] ?? 0) - first + DAY;
  const turnDays = turns.map((i) => sessions[i]).sort((a, b) => a - b);
  const inRecord = events.map((e) => Math.floor(e / DAY) * DAY).filter((e) => e >= first && e < first + span);
  const caught = (e: number) => {
    let lo = 0;
    let hi = turnDays.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (turnDays[mid] < e - windowDays * DAY) lo = mid + 1;
      else hi = mid;
    }
    return lo < turnDays.length && turnDays[lo] <= e + windowDays * DAY;
  };
  const rate = (shift: number) => {
    if (inRecord.length === 0) return 0;
    let h = 0;
    for (const e of inRecord) if (caught(first + ((e - first + shift * DAY) % span))) h++;
    return h / inRecord.length;
  };
  const observed = rate(0);
  let atLeast = 0;
  let sum = 0;
  for (let s = 1; s <= SHIFTS; s++) {
    const r = rate(s);
    sum += r;
    if (r >= observed) atLeast++;
  }
  return { events: inRecord.length, observed, shiftedMean: sum / SHIFTS, p: (atLeast + 1) / (SHIFTS + 1) };
}
