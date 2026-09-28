"use client";

/**
 * The "approaching a round number" notice (Gann's even figures; see
 * lib/gann/evenFigures.ts). Shown on the setup card and the order ticket when
 * the trader has the notice switched on. It informs; it never changes a plan.
 */

import { approachingFigure } from "@/lib/gann/evenFigures";
import { useGannRulePrefs } from "@/components/gann/use-gann-rule-prefs";

export function RoundNumberNotice({
  price,
  direction,
  className = "",
}: {
  price: number | null | undefined;
  direction: "bullish" | "bearish" | null | undefined;
  className?: string;
}) {
  const { prefs } = useGannRulePrefs();
  if (!prefs.roundNumberNotices || !price || !(price > 0) || !direction) return null;
  const reading = approachingFigure(price, direction);
  if (!reading) return null;
  return (
    <p className={`rounded-md border border-warn/40 bg-warn-soft p-2 text-xs text-warn ${className}`} role="note">
      <span className="font-medium">Round number ahead. </span>
      {reading.note}
    </p>
  );
}
