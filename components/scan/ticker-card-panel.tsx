"use client";

/**
 * The trade card open on this stock, on its own page, worded as the Dashboard
 * words it (components/dashboard/card-levels.tsx), and how it stands against
 * the daily plan below (lib/cards/tickerCard.ts). Shown only while a card the
 * member would see on the Dashboard is open; nothing otherwise.
 *
 * Three-question basis: 1. Method: when in doubt, keep out, where the card and
 * the daily plan face opposite ways (lib/cards/tickerCard.ts). 2. Cycles: no
 * periodicity claim. 3. Hermetic: Correspondence and Polarity (see
 * lib/cards/tickerCard.ts). Law of Creation: see lib/cards/tickerCard.ts.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardLevels } from "@/components/dashboard/card-levels";
import type { CardPlanRelation, SymbolTradeCards } from "@/lib/cards/tickerCard";

export function TickerCardPanel({
  symbol,
  data,
  relation,
  planState,
}: {
  symbol: string;
  data: SymbolTradeCards;
  relation: CardPlanRelation;
  planState: "Execute" | "Watch" | "Reject" | null;
}) {
  if (data.cards.length === 0 || relation === "none") return null;
  return (
    <Card data-testid="ticker-trade-card">
      <CardHeader>
        <CardTitle>Trade card for the next session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {data.signalDate && <p className="text-xs text-muted">Read on the close of {data.signalDate}, as on your Dashboard.</p>}
        <ul className="space-y-1">
          {data.cards.map((c) => (
            <li key={c.label}>
              <span className="text-muted">{c.label}</span>
              {c.grade === "alert" && <span className="ml-2 text-xs text-muted">(higher-risk alert, not a verified setup)</span>}
              <br />
              <CardLevels card={c} />
            </li>
          ))}
        </ul>
        {relation === "cardLeads" && (
          <p className="text-xs text-warn" data-testid="card-plan-other-side">
            The daily plan below reads {symbol} the other way (a sell, {planState ?? "not a trade"}), and it is not an
            Execute. For this session the chart draws the card&apos;s buy levels. The card is good for the next session
            only; once it passes, the daily plan is the one to follow.
          </p>
        )}
        {relation === "bothArmed" && (
          <p className="text-xs text-warn" data-testid="card-plan-both-armed">
            The daily plan below is a sell Execute while this card is a buy: both sides are armed. When in doubt, stay
            out until one side breaks. The chart draws both.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
