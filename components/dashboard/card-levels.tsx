/**
 * One trade card's order and levels, in the one wording the Dashboard and a
 * stock's own page both use (components/dashboard/trade-cards.tsx,
 * components/scan/ticker-card-panel.tsx), so the two never read differently.
 *
 * Three-question basis: 1. Method: none here; it prints the card's stored
 * levels. 2. Cycles: no periodicity claim. 3. Hermetic: Correspondence: the
 * same card reads the same wherever it appears. Law of Creation: a mixture.
 */

import { priceUsd } from "@/lib/strat/priceText";
import { Term } from "@/components/vocabulary";

export interface CardLevelsData {
  order: "buyStop" | "buyAtOpen" | "buyLimit";
  entry: number;
  stop: number;
  tp1: number;
  tp2: number | null;
  mtp: number | null;
}

export function CardLevels({ card: c }: { card: CardLevelsData }) {
  return (
    <span className="tabular-nums">
      {/* Cards are long only; the entry's order is the card's own (lib/cards/cardCalls.ts walkCardCall). */}
      {c.order === "buyAtOpen" ? (
        <>
          <Term id="buyAtOpen" /> (last close {priceUsd(c.entry)})
        </>
      ) : (
        <>
          <Term id={c.order === "buyLimit" ? "buyLimit" : "buyStop"} /> {priceUsd(c.entry)}
        </>
      )}{" "}
      · <Term id="stopLoss" /> {priceUsd(c.stop)} · <Term id="tp1" /> {priceUsd(c.tp1)}
      {c.tp2 != null && (
        <>
          {" "}
          · <Term id="tp2" /> {priceUsd(c.tp2)}
        </>
      )}
      {c.mtp != null && (
        <>
          {" "}
          · <Term id="mtp" /> {priceUsd(c.mtp)}
        </>
      )}
    </span>
  );
}
