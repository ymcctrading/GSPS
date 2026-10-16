/**
 * The largest weekly volume since a prior top warns to watch for a top
 * (A-VOLUME-12, W006 p.44: the week to 23 November 1935, nearly 19 million
 * shares, "the largest since the week of February 10, 1934", the 1934 top;
 * Master Course Ch.12: the largest volume of sales often comes before the
 * final top). Context only: Gann's verb is "watch for", so this is a card
 * line and a measured factor, never a gate. It is a top rule; the text gives
 * no bottom mirror (the bottom rule is the smallest volume in years), so none
 * is invented.
 *
 * Engineering choices, labelled: the prior top is the most recent major top
 * of the weekly bars (`majorPivots(findPivots(weekly, 3))`); "since" counts
 * the weeks after the top week; only the last 52 completed weeks are read, so
 * the live scan's year of daily bars and the replay's longer history pick the
 * same top; the week still in progress is never counted
 * (a part week's volume is not comparable), on the live scan and the replay
 * alike.
 *
 * Three-question basis:
 * 1. Gann: W006 p.44 (class A), the Master Course corroborating.
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Cause and Effect (the heaviest effort since the last top, with
 *    price still under it, is demand being spent).
 */
import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";

const DAY_MS = 86_400_000;
/** The weeks read, a year, the live scan's daily span. */
export const WEEKS_READ = 52;

export interface TopVolumeWarningReading {
  /** The prior major top's week (YYYY-MM-DD). */
  sinceTop: string;
  /** The last completed week (YYYY-MM-DD) and its volume. */
  week: string;
  weekVolume: number;
  /** That week's volume is the largest of any week since the top. */
  warning: boolean;
}

function monday(t: number): number {
  const d = new Date(t);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return day - ((d.getUTCDay() + 6) % 7) * DAY_MS;
}

export function readTopVolumeWarning(weekly: Bar[], asOf: Date): TopVolumeWarningReading | null {
  const current = monday(asOf.getTime());
  const done = weekly.filter((w) => monday(Date.parse(w.t)) < current).slice(-WEEKS_READ);
  if (done.length < 10) return null;
  const last = done.length - 1;
  const top = majorPivots(findPivots(done.slice(0, last), 3))
    .filter((p) => p.kind === "high")
    .pop();
  if (!top) return null;
  const since = done.slice(top.index + 1);
  if (since.length < 2) return null;
  const heaviest = Math.max(...since.slice(0, -1).map((w) => w.v));
  return {
    sinceTop: done[top.index].t.slice(0, 10),
    week: done[last].t.slice(0, 10),
    weekVolume: done[last].v,
    warning: done[last].v > heaviest,
  };
}

export function describeTopVolumeWarning(r: TopVolumeWarningReading): string {
  return `Week of ${r.week}: the heaviest weekly volume since the ${r.sinceTop} top. Watch for a top. Shown for context; it does not change the setup.`;
}
