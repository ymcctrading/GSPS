/**
 * Which live example each lesson draws from the learner's own charts
 * (`./examples.ts`). Keyed by lesson id, which the curriculum keeps stable when
 * its text is rewritten; a lesson not listed shows no live example.
 *
 * Engineering choice, labelled: the pairing of lessons and examples is a
 * hand-written list, revised whenever a lesson's subject changes.
 */

import type { ExampleKind } from "./examples";

export const LESSON_EXAMPLES: Readonly<Record<string, readonly ExampleKind[]>> = {
  "academy-2/simple-rules/trend-and-levels": ["uptrend", "downtrend"],
  "academy-2/simple-rules/halfway-and-round-numbers": ["halfway_pullback"],
  "academy-2/simple-rules/small-losses": ["correction"],
  "academy-2/simple-rules/the-chart-not-the-news": ["bear_market", "bull_market"],
  "academy-4/structure/trend-range-transition": ["uptrend", "trading_range_breakout", "bear_market"],
  "academy-4/reading-the-swings/breakouts-and-stops": ["trading_range_breakout"],
  "academy-4/reading-the-swings/three-closes-and-volume": ["trading_range_breakout", "volume_at_turn"],
  "academy-6/method-rules/swing-charts-and-trend": ["elliott_five_waves", "elliott_abc"],
  "academy-6/method-rules/volume-and-the-trader": ["elliott_five_waves"],
};

export function examplesForLesson(lessonId: string): readonly ExampleKind[] {
  return LESSON_EXAMPLES[lessonId] ?? [];
}
