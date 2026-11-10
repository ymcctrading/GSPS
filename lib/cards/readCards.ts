/**
 * What a member is shown of the trade cards: tonight's published cards and,
 * beside each kind, its held-out record and its forward record so far
 * (every published card, losses and no-fills included). Server only: reads
 * `card_calls` with the service role (migration 0148, RLS with no policy).
 *
 * Three-question basis: 1. Method: none here; it reads what
 * lib/cards/cardCalls.ts recorded. 2. Cycles: no periodicity claim.
 * 3. Hermetic: Correspondence: the record a member reads is the same rows
 * the nightly job writes, never a separate tally. Law of Creation: a mixture.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { STRATEGY_MODE_LABELS } from "@/lib/strategies/types";
import { CARD_RECORDS, cardKindShown, type CardKind, type CardRecord } from "@/lib/setups/cardRecords";
import { tallyGoodCalls, type GoodCallTally } from "@/lib/shadow/goodCall";
import { CARD_MODES } from "@/lib/cards/cardCalls";

export interface TradeCard {
  kind: CardKind;
  label: string;
  symbol: string;
  entry: number;
  stop: number;
  tp1: number;
}

export interface TradeCardKindRecord {
  kind: CardKind;
  label: string;
  heldOut: CardRecord;
  forward: GoodCallTally;
  /** The first card of this kind in the forward record (YYYY-MM-DD), or null. */
  since: string | null;
}

export interface TradeCards {
  /** The completed session the cards were read on; they trade the next session. */
  signalDate: string | null;
  cards: TradeCard[];
  kinds: TradeCardKindRecord[];
}

/** The kinds a member is shown, in the modes' order. */
export function publishedKinds(): CardKind[] {
  return CARD_MODES.filter((k) => cardKindShown(k));
}

/** Most forward rows read for a kind's tally; an engineering bound for one request. */
const FORWARD_ROWS = 5000;

export async function getTradeCards(service: SupabaseClient): Promise<TradeCards> {
  const kinds = publishedKinds();
  if (kinds.length === 0) return { signalDate: null, cards: [], kinds: [] };

  const { data: latest } = await service
    .from("card_calls")
    .select("signal_date")
    .eq("published", true)
    .in("kind", kinds)
    .order("signal_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const signalDate = (latest as { signal_date?: string } | null)?.signal_date ?? null;

  let cards: TradeCard[] = [];
  if (signalDate) {
    const { data } = await service
      .from("card_calls")
      .select("kind, symbol, entry, stop, tp1")
      .eq("published", true)
      .eq("signal_date", signalDate)
      .in("kind", kinds)
      .order("symbol");
    cards = ((data ?? []) as { kind: CardKind; symbol: string; entry: number | string; stop: number | string; tp1: number | string }[]).map(
      (r) => ({ kind: r.kind, label: STRATEGY_MODE_LABELS[r.kind], symbol: r.symbol, entry: Number(r.entry), stop: Number(r.stop), tp1: Number(r.tp1) }),
    );
  }

  const records: TradeCardKindRecord[] = [];
  for (const kind of kinds) {
    const heldOut = CARD_RECORDS[kind];
    if (!heldOut) continue;
    const { data } = await service
      .from("card_calls")
      .select("signal_date, stop, tp1, fill_price, call_outcome")
      .eq("published", true)
      .eq("kind", kind)
      .neq("call_outcome", "pending")
      .order("signal_date", { ascending: false })
      .limit(FORWARD_ROWS);
    const rows = (data ?? []) as { signal_date: string; stop: number | string; tp1: number | string; fill_price: number | string | null; call_outcome: string }[];
    const forward = tallyGoodCalls(
      rows.map((r) => ({
        call: r.call_outcome as "good" | "bad" | "open" | "no_fill",
        fill: r.fill_price == null ? null : Number(r.fill_price),
        stop: Number(r.stop),
        tp1: Number(r.tp1),
      })),
    );
    records.push({ kind, label: STRATEGY_MODE_LABELS[kind], heldOut, forward, since: rows.length ? rows[rows.length - 1].signal_date : null });
  }
  return { signalDate, cards, kinds: records };
}
