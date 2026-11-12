import { formatUsd } from "@/lib/utils";

/**
 * The line shown after an option leg closed at its last real trade because no
 * live bid or ask was there (lib/brokers/simulator.ts, `optionClosePrice`).
 * Null for any other close, which needs no note.
 */
export function lastTradeNote(data: {
  order?: { filled_avg_price?: number };
  price?: { source?: string; asOf?: string };
}): string | null {
  if (data.price?.source !== "last_trade" || !data.price.asOf) return null;
  const at = new Date(data.price.asOf);
  if (Number.isNaN(at.getTime())) return null;
  const when = at.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const px = data.order?.filled_avg_price;
  const priced = typeof px === "number" ? ` at ${formatUsd(px)}` : "";
  return `Closed${priced}, the contract's last trade (${when} ET). No live quote was available to close against.`;
}
