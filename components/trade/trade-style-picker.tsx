"use client";

/**
 * The trader's trade style (Swing or Fast, `lib/trade/tradeStyle.ts`), saved
 * to their settings. Both open on the same plan; the paper and live exit
 * managers trail each of the trader's own trades in the style that stood when
 * it filled (`lib/trade/exit-style.ts`). Both are Gann's: his main swing method and his
 * fast-market method. Neither closes a trade at the end of the session; Gann
 * never did. Intraday is not picked here: it is the style of a trade taken
 * from an intraday alert (`IntradayPlanPanel`).
 */

import { PICKABLE_TRADE_STYLES, TRADE_STYLES, type DailyTradeStyle as TradeStyle } from "@/lib/trade/tradeStyle";
import { cn } from "@/lib/utils";

export function TradeStylePicker({
  value,
  onChange,
  compact = false,
}: {
  value: TradeStyle;
  onChange: (style: TradeStyle) => void;
  compact?: boolean;
}) {
  const profile = TRADE_STYLES[value];
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Trade style">
        <span className="text-xs text-muted">Trade style</span>
        {(PICKABLE_TRADE_STYLES as readonly TradeStyle[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            onClick={() => onChange(s)}
            className={cn(
              "min-h-9 rounded px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors",
              value === s ? "bg-accent text-surface" : "border border-border text-muted hover:border-accent",
            )}
            title={TRADE_STYLES[s].summary}
          >
            {TRADE_STYLES[s].label}
          </button>
        ))}
      </div>
      {!compact && (
        <p className="text-xs text-muted">
          {profile.summary} Stop: {profile.stopRule}. Once filled: {profile.trailRule.charAt(0).toLowerCase() + profile.trailRule.slice(1)}. Expected hold:{" "}
          {profile.expectedHold.toLowerCase()}. Applies to trades you place from now on; trades already open keep the style they were filled in, and the portfolio manager&apos;s stay on Swing.
        </p>
      )}
    </div>
  );
}
