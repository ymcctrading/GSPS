/**
 * Tonight's trade cards on the Dashboard (lib/cards/readCards.ts): each card's
 * entry, stop and first target for the next session, and beside each kind its
 * held-out record and its forward record so far, losses and no-fills
 * included. Only kinds whose held-out record passed are shown
 * (lib/setups/cardRecords.ts); with none, it says there is no card today.
 *
 * Three-question basis: 1. Method: none here; it shows what the nightly job
 * recorded. 2. Cycles: no periodicity claim. 3. Hermetic: Cause and Effect
 * and Mentalism: a card is shown with the evidence that it pays, and its
 * record keeps the bad calls in view. Law of Creation: a mixture.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { priceUsd } from "@/lib/strat/priceText";
import { tickerHref } from "@/lib/routes";
import { NO_CARD_NOTE } from "@/lib/setups/cardRecords";
import type { TradeCards as TradeCardsData } from "@/lib/cards/readCards";
import Link from "next/link";

const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const r = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}R`);

export function TradeCards({ data }: { data: TradeCardsData }) {
  return (
    <Card data-testid="trade-cards">
      <CardHeader>
        <CardTitle>Trade cards for the next session</CardTitle>
        <CardDescription>
          Each card is a buy stop at its entry, good for the next session only, with its stop and first target. A card
          counts as a good call when price reaches the first target before the stop after the entry fills, and a bad
          call when the stop comes first. What you do after the first target is yours to manage. Past calls do not
          promise future ones.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.cards.length === 0 && data.heldBack > 0 ? (
          <p className="text-sm text-muted">
            {data.heldBack} card{data.heldBack === 1 ? "" : "s"} for the next session come with the Pro plan and above.
            The record below is open to every member.
          </p>
        ) : data.cards.length === 0 ? (
          <p className="text-sm text-muted">
            {data.kinds.length > 0 ? "No card for the next session: none of the setups below fired on the last close." : NO_CARD_NOTE}
          </p>
        ) : (
          <>
            {data.signalDate && <p className="text-xs text-muted">Read on the close of {data.signalDate}.</p>}
            <ul className="divide-y divide-border rounded-lg border border-border">
              {data.cards.map((c) => (
                <li key={`${c.kind}-${c.symbol}`} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <Link href={tickerHref(c.symbol)} className="font-semibold hover:text-accent">
                      {c.symbol}
                    </Link>{" "}
                    <span className="text-muted">· {c.label}</span>
                  </span>
                  <span className="tabular-nums">
                    Buy stop {priceUsd(c.entry)} · Stop {priceUsd(c.stop)} · First target {priceUsd(c.tp1)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {data.kinds.map((k) => (
          <div key={k.kind} className="space-y-1 text-xs text-muted">
            <p>
              <span className="font-medium text-foreground">{k.label}.</span> {k.heldOut.summary}
            </p>
            <p>
              {k.forward.calls === 0 ? (
                "Live record: no card of this kind has been scored yet."
              ) : (
                <>
                  Live record{k.since ? ` since ${k.since}` : ""}: {k.forward.good} good calls, {k.forward.bad} bad calls,{" "}
                  {k.forward.open} still open,{" "}
                  {k.forward.unresolved > 0 ? `${k.forward.unresolved} settled with neither level reached, ` : ""}
                  {k.forward.noFill} never filled. Good-call rate {pct(k.forward.goodRate)} against{" "}
                  {pct(k.forward.breakEven)} needed to break even, {r(k.forward.expectancyR)} a decided call.
                </>
              )}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
