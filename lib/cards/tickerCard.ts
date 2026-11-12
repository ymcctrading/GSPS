/**
 * How a stock's page shows the trade card open on it beside the daily plan
 * (owner, 2026-11-12: AM was a buy card on the Dashboard and a sell on its
 * chart). Pure; imported by a client component, so it names no source,
 * method or internal rule.
 *
 * - The card is drawn on the chart with its own labelled lines, the same
 *   levels the Dashboard lists.
 * - Cards are long only. When the daily plan reads the other side and is not
 *   an Execute, the card leads for its session: the plan's lines are not
 *   drawn, and the page says the daily read points the other way.
 * - When the daily plan is an Execute on the other side, both sides are
 *   armed: both are drawn and the page says to stand aside until one side
 *   breaks ("when in doubt, keep out"; the same two-sided hold the daily
 *   plan applies to itself, lib/scan/entrySelection.ts `twoSidedDoubt`).
 *
 * Three-question basis:
 * 1. Method: when in doubt, keep out (internal citation SRC-007 p. 255,
 *    never-failing rule 6), applied where two of the platform's own reads
 *    face opposite ways on one stock.
 * 2. Cycles: no periodicity claim.
 * 3. Hermetic: Polarity: a buy card and a sell plan are two poles of one
 *    stock; the page names both rather than hiding one. Correspondence: the
 *    card reads the same on the Dashboard and the stock's page. Law of
 *    Creation: card x daily plan; where they agree it is one plan, where they
 *    face apart the pairing creates the stand-aside answer, a third neither
 *    held. Not a measured creation: no figure moves here.
 */

/** What /api/cards/symbol returns: only what a member reads on the card. */
export interface SymbolTradeCard {
  label: string;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number | null;
  mtp: number | null;
  order: "buyStop" | "buyAtOpen" | "buyLimit";
  grade: "setup" | "alert";
}

export interface SymbolTradeCards {
  /** The close the cards were read on; they trade the next session. Null with no card. */
  signalDate: string | null;
  cards: SymbolTradeCard[];
}

export interface TickerCardLevels {
  entry: number;
  stop: number;
  tp1: number;
  tp2: number | null;
  mtp: number | null;
}

export interface TickerCardMarker {
  price: number;
  label: string;
  kind: "entry" | "stop" | "target";
}

export type CardPlanRelation =
  /** No card open on this stock. */
  | "none"
  /** The daily plan is long too, or has no side. */
  | "agrees"
  /** The daily plan reads the other side but is not an Execute: the card leads for its session. */
  | "cardLeads"
  /** The daily plan is an Execute on the other side: both sides armed, stand aside. */
  | "bothArmed";

/** Pure. How the open card stands against the daily plan. Cards are long only. */
export function cardPlanRelation(
  hasCard: boolean,
  planDirection: "bullish" | "bearish" | "none" | null | undefined,
  planState: "Execute" | "Watch" | "Reject" | null | undefined,
): CardPlanRelation {
  if (!hasCard) return "none";
  if (planDirection !== "bearish") return "agrees";
  return planState === "Execute" ? "bothArmed" : "cardLeads";
}

/** Pure. The card's lines on the chart, labelled apart from the daily plan's. Non-finite or non-positive prices are skipped. */
export function cardChartMarkers(card: TickerCardLevels | null | undefined): TickerCardMarker[] {
  if (!card) return [];
  const out: TickerCardMarker[] = [
    { price: card.entry, label: "Card entry", kind: "entry" },
    { price: card.stop, label: "Card SL", kind: "stop" },
    { price: card.tp1, label: "Card TP1", kind: "target" },
  ];
  if (card.tp2 != null) out.push({ price: card.tp2, label: "Card TP2", kind: "target" });
  if (card.mtp != null) out.push({ price: card.mtp, label: "Card MTP", kind: "target" });
  return out.filter((m) => Number.isFinite(m.price) && m.price > 0);
}

/** Pure. Whether the daily plan's own lines are drawn beside the card's. */
export function drawPlanLines(relation: CardPlanRelation): boolean {
  return relation !== "cardLeads";
}
