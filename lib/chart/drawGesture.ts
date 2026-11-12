/**
 * GSPS — how one press on the chart becomes a drawing.
 *
 * The chart's drawing tools used to listen for the charting library's click,
 * which on a phone is a "tap": a quick second tap is read as a double-tap and
 * dropped, a finger that moves a few pixels cancels the tap, and a press-and-
 * drag pans the chart instead of drawing (owner, 2026-11-12: "impossible to
 * draw on the phone"). The chart now reads the pointer itself while a tool is
 * armed and hands each completed press here:
 *
 * - a press that moves at least DRAG_THRESHOLD_PX draws a trend line from
 *   where it went down to where it came up;
 * - a press that doesn't move is a tap, and two taps make a trend line, as
 *   before, however quickly they come;
 * - a horizontal line drops where the press ends.
 *
 * Two points on the same bar can't be a line (the series needs two distinct
 * times), so such a second point is ignored and the first stays pending.
 */

import type { Time } from "lightweight-charts";

export type DrawTool = "none" | "hline" | "trend";
export type DrawPoint = { time: Time; price: number };

/** Movement, in CSS pixels, past which a press is a drag rather than a tap. */
export const DRAG_THRESHOLD_PX = 8;

export type DrawOutcome =
  | { kind: "none" }
  | { kind: "hline"; price: number }
  | { kind: "pending"; point: DrawPoint }
  | { kind: "trend"; a: DrawPoint; b: DrawPoint };

export function movedPastThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}

export function resolveDrawGesture(input: {
  tool: DrawTool;
  /** Where the press went down; time is null off the bars. */
  down: { time: Time | null; price: number | null };
  /** Where the press came up. */
  up: { time: Time | null; price: number | null };
  dragged: boolean;
  /** The first point of a trend line already tapped, if any. */
  pending: DrawPoint | null;
}): DrawOutcome {
  const { tool, down, up, dragged, pending } = input;
  const ok = (p: number | null): p is number => p != null && Number.isFinite(p) && p > 0;
  if (tool === "hline") {
    return ok(up.price) ? { kind: "hline", price: up.price } : { kind: "none" };
  }
  if (tool !== "trend") return { kind: "none" };

  if (dragged) {
    if (down.time == null || up.time == null || !ok(down.price) || !ok(up.price)) return { kind: "none" };
    if (down.time === up.time) return { kind: "none" };
    return { kind: "trend", a: { time: down.time, price: down.price }, b: { time: up.time, price: up.price } };
  }

  if (up.time == null || !ok(up.price)) return { kind: "none" };
  const point: DrawPoint = { time: up.time, price: up.price };
  if (!pending) return { kind: "pending", point };
  if (pending.time === point.time) return { kind: "pending", point: pending };
  return { kind: "trend", a: pending, b: point };
}
