/**
 * Whether a sell opens a short, and whether this account and this stock can
 * take one (owner, 2026-10-28: the order ticket and the portfolio manager
 * match the "How do I trade a sell setup?" panel, `lib/education/sellSetupHelp.ts`).
 *
 * A short is shares borrowed and sold. So it needs a stock the broker can lend
 * (Alpaca's `shortable`), and a live account that may borrow at all (a margin
 * account; a cash account or an IRA can't, which Alpaca reports as
 * `shorting_enabled: false`). The paper account is GSPS's own simulation and
 * practises a short with no margin account, as the panel says, but it lends
 * only what the broker would: a short the broker would reject is no practice.
 *
 * A hard-to-borrow stock (`easy_to_borrow: false`) is not refused here: the
 * broker decides whether it lends one, and costs more per day if it does, so
 * the order goes with a warning saying so.
 *
 * Three-question basis: 1. Gann shorts what can be borrowed and prefers the
 * large capital stocks for it (Rule 21, `lib/gann/pyramid.ts`); a stock nobody
 * lends is no short. 2. No periodicity claim. 3. Polarity: a short is the
 * mirror of a buy, and the mirror has its own precondition, the borrow.
 */

import type { AlpacaAccount, AlpacaAsset } from "@/lib/brokers/alpaca";

export interface ShortRefusal {
  status: number;
  body: { error: string; code: "not_shortable" | "short_not_enabled" };
}

/**
 * True when a sell opens or grows a short: nothing held, a short held, or more
 * shares sold than the long holds (the excess opens a short). A buy never does.
 */
export function opensShort(
  existingSide: "long" | "short" | null,
  existingQty: number,
  orderSide: "buy" | "sell",
  orderQty: number,
): boolean {
  if (orderSide !== "sell") return false;
  if (existingSide !== "long") return true;
  return orderQty > existingQty + 1e-9;
}

/** The refusal for a stock the broker won't lend, or null. */
export function shortAssetRefusal(symbol: string, asset: Pick<AlpacaAsset, "shortable">): ShortRefusal | null {
  if (asset.shortable) return null;
  return {
    status: 409,
    body: {
      error: `${symbol.toUpperCase()} can't be sold short: its shares aren't available to borrow, so the broker won't accept a short. A put is one way to act on the sell instead. Nothing was placed.`,
      code: "not_shortable",
    },
  };
}

/** The warning a hard-to-borrow short goes with, or null. */
export function hardToBorrowWarning(symbol: string, asset: Pick<AlpacaAsset, "shortable" | "easy_to_borrow">): string | null {
  if (!asset.shortable || asset.easy_to_borrow) return null;
  return `${symbol.toUpperCase()} is hard to borrow: the daily borrowing fee is higher, and the lender can ask for the shares back.`;
}

/** The refusal for a live account that can't short (a cash account or an IRA), or null. */
export function liveShortAccountRefusal(account: Pick<AlpacaAccount, "shorting_enabled">): ShortRefusal | null {
  if (account.shorting_enabled !== false) return null;
  return {
    status: 409,
    body: {
      error: "This brokerage account can't sell short. Shorting needs a margin account with shorting approved; a cash account or an IRA can't short. Nothing was placed.",
      code: "short_not_enabled",
    },
  };
}
