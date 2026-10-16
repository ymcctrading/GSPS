/**
 * A conditional forecast, stored before the fact and scored only after it
 * (A-ASTRO-08; W046 pp.2-3: if the decline starts in the March 22-24 window
 * it runs to about April 15, then a quick rally to April 16, then a sharp
 * decline). Research only: no criterion, gate, plan, entry or order reads
 * this (CYC-41), and nothing shows a stored forecast to a person
 * ("Forward-looking claims").
 *
 * Fixed rules:
 * - A forecast must be recorded before its trigger window opens; otherwise it
 *   is refused as not pre-registered.
 * - The trigger "topInWindow" fires when the highest high from 5 sessions
 *   before the window to 5 after it lies inside the window.
 * - Each leg runs from the previous leg's end (the first from the top's
 *   session) to its `until` date, and is a hit when the close moved in its
 *   direction. Closes are the last session on or before each date.
 * - Nothing is scored until the last leg's date has passed.
 * The legs' directions are Gann's own words; the adverse-aspect class that
 * sets them (ASTRO-9) is open, so no direction is derived from aspects here.
 *
 * Gann: W046 (class A). Cycles: a forecast scored only after the fact is
 * Dewey's persistence-after-discovery test (CYC-10). Hermetic: Cause and
 * Effect, a stated cause held to its effect.
 */
import type { Bar } from "@/lib/types";

const DAY = 86_400_000;
const MARGIN = 5;

export interface ConditionalForecast {
  id: string;
  source: string;
  recordedAt: number;
  trigger: { kind: "topInWindow"; from: number; to: number };
  legs: { until: number; direction: "up" | "down" }[];
}

export interface ForecastScore {
  id: string;
  triggered: boolean;
  legs: { until: number; direction: "up" | "down"; from: number; to: number; hit: boolean }[];
}

export function scoreForecast(f: ConditionalForecast, bars: Bar[], now: number): ForecastScore | null {
  if (f.recordedAt >= f.trigger.from) throw new Error(`forecast ${f.id} is not pre-registered`);
  const last = f.legs[f.legs.length - 1]?.until ?? f.trigger.to;
  if (now <= last) return null;
  const days = bars.map((b) => Math.floor(Date.parse(b.t) / DAY) * DAY);
  const around = bars
    .map((b, i) => ({ b, i }))
    .filter(({ i }) => days[i] >= f.trigger.from - MARGIN * DAY && days[i] <= f.trigger.to + MARGIN * DAY);
  if (around.length === 0) return { id: f.id, triggered: false, legs: [] };
  const top = around.reduce((a, x) => (x.b.h > a.b.h ? x : a));
  if (days[top.i] < f.trigger.from || days[top.i] > f.trigger.to) return { id: f.id, triggered: false, legs: [] };
  const closeOn = (t: number) => {
    let c: number | null = null;
    for (let i = 0; i < bars.length && days[i] <= t; i++) c = bars[i].c;
    return c;
  };
  let start = top.b.c;
  const legs: ForecastScore["legs"] = [];
  for (const leg of f.legs) {
    const end = closeOn(leg.until);
    if (end === null) return null;
    legs.push({ ...leg, from: start, to: end, hit: leg.direction === "up" ? end > start : end < start });
    start = end;
  }
  return { id: f.id, triggered: true, legs };
}
