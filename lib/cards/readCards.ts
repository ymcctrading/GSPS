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
import { CARD_KIND_LABELS, CARD_KIND_MODE, CARD_RECORDS, cardKindShown, type CardKind, type CardRecord } from "@/lib/setups/cardRecords";
import { tallyGoodCalls, type GoodCallTally } from "@/lib/shadow/goodCall";
import { CARD_KINDS } from "@/lib/cards/cardCalls";
import { isStrategyModeAllowedForPolicy } from "@/lib/strategies/access";
import type { EntitlementPolicy } from "@/lib/entitlements/policy";
import { etDateKey, mostRecentClose } from "@/lib/market/session";

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
  /** The completed session the cards were read on; they trade the next session. Null when no card still trades. */
  signalDate: string | null;
  cards: TradeCard[];
  /**
   * Tonight's cards of kinds the member's tier does not include (Strategy
   * Modes tier gating, `lib/entitlements/policy.ts#allowedStrategyModes`),
   * counted but not shown.
   */
  heldBack: number;
  /**
   * Of those, the cards of kinds the member's tier includes but whose strategy
   * mode they have not chosen, counted by kind label. A mode is opt-in and one
   * at a time (docs/agents/12-strategy-modes.md, "Opt-in and one-at-a-time"):
   * the Dashboard shows only the chosen mode's cards and says where to choose.
   */
  unchosen: { label: string; count: number }[];
  kinds: TradeCardKindRecord[];
}

/** Who is reading: their tier's policy and the strategy mode they chose ("gsps" or none: no mode). */
export interface TradeCardViewer {
  policy: Pick<EntitlementPolicy, "allowedStrategyModes">;
  mode: string | null;
}

/** The kinds a member is shown, in the modes' order. */
export function publishedKinds(): CardKind[] {
  return CARD_KINDS.filter((k) => cardKindShown(k));
}

/**
 * Pure. Where a stock has both an RSI reversal card and the same card on a
 * turn date ("rsiReversalTimed", same levels), the member is shown the one
 * card, under the kind with the stronger held-out record.
 */
export function withoutDuplicateCards(cards: TradeCard[]): TradeCard[] {
  const timed = new Set(cards.filter((c) => c.kind === "rsiReversalTimed").map((c) => c.symbol));
  return cards.filter((c) => !(c.kind === "rsiReversal" && timed.has(c.symbol)));
}

/** Most forward rows read for a kind's tally; an engineering bound for one request. */
const FORWARD_ROWS = 5000;

export const NO_TRADE_CARDS: TradeCards = { signalDate: null, cards: [], heldBack: 0, unchosen: [], kinds: [] };

/**
 * Whether cards read on the close of `signalDate` still trade: they are good
 * for the session after it only, so once a later session has closed they are
 * past, whatever the nightly job has (or has not yet) written since.
 */
export function cardsStillTrade(signalDate: string, now: Date): boolean {
  return etDateKey(mostRecentClose(now)) <= signalDate;
}

/** Rows a read asks for at once: PostgREST's default max rows. */
const READ_PAGE = 1000;

/**
 * The member's view: cards of the published kind whose strategy mode they
 * chose (and their tier includes), and the record of every published kind.
 * `viewer` null (no session) shows no card.
 * Cards are shown only from the latest night's run (every kind is recorded
 * each night, published or not), and only while their session is still ahead.
 */
export async function getTradeCards(
  service: SupabaseClient,
  viewer: TradeCardViewer | null,
  now: Date = new Date(),
): Promise<TradeCards> {
  const kinds = publishedKinds();
  if (kinds.length === 0) return NO_TRADE_CARDS;

  // The latest night the job recorded any card. A quiet night for the
  // published kinds leaves the earlier cards behind, never on show.
  const { data: latest } = await service
    .from("card_calls")
    .select("signal_date")
    .in("kind", [...CARD_KINDS])
    .order("signal_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastRun = (latest as { signal_date?: string } | null)?.signal_date ?? null;
  const signalDate = lastRun && cardsStillTrade(lastRun, now) ? lastRun : null;

  let cards: TradeCard[] = [];
  let heldBack = 0;
  const unchosen: { label: string; count: number }[] = [];
  if (signalDate) {
    const { data } = await service
      .from("card_calls")
      .select("kind, symbol, entry, stop, tp1")
      .eq("published", true)
      .eq("signal_date", signalDate)
      .in("kind", kinds)
      .order("symbol");
    cards = ((data ?? []) as { kind: CardKind; symbol: string; entry: number | string; stop: number | string; tp1: number | string }[]).map(
      (r) => ({ kind: r.kind, label: CARD_KIND_LABELS[r.kind], symbol: r.symbol, entry: Number(r.entry), stop: Number(r.stop), tp1: Number(r.tp1) }),
    );
    cards = withoutDuplicateCards(cards);
    const all = cards.length;
    const allowed = viewer ? cards.filter((c) => isStrategyModeAllowedForPolicy(viewer.policy, CARD_KIND_MODE[c.kind])) : [];
    cards = allowed.filter((c) => CARD_KIND_MODE[c.kind] === viewer?.mode);
    heldBack = all - cards.length;
    for (const c of allowed) {
      if (CARD_KIND_MODE[c.kind] === viewer?.mode) continue;
      const row = unchosen.find((u) => u.label === c.label);
      if (row) row.count++;
      else unchosen.push({ label: c.label, count: 1 });
    }
  }

  type ForwardRow = { signal_date: string; stop: number | string; tp1: number | string; fill_price: number | string | null; call_outcome: string };
  // Each kind's record is read side by side: several kinds are published, and
  // the Dashboard waits on the slowest one, not on their sum.
  const readKind = async (kind: CardKind): Promise<TradeCardKindRecord | null> => {
    const heldOut = CARD_RECORDS[kind];
    if (!heldOut) return null;
    const rows: ForwardRow[] = [];
    for (let from = 0; from < FORWARD_ROWS; from += READ_PAGE) {
      const { data } = await service
        .from("card_calls")
        .select("signal_date, stop, tp1, fill_price, call_outcome")
        .eq("published", true)
        .eq("kind", kind)
        .neq("call_outcome", "pending")
        .order("signal_date", { ascending: false })
        .order("id", { ascending: true })
        .range(from, Math.min(from + READ_PAGE, FORWARD_ROWS) - 1);
      const page = (data ?? []) as ForwardRow[];
      rows.push(...page);
      if (page.length < READ_PAGE) break;
    }
    const forward = tallyGoodCalls(
      rows.map((r) => ({
        call: r.call_outcome as "good" | "bad" | "open" | "unresolved" | "no_fill",
        fill: r.fill_price == null ? null : Number(r.fill_price),
        stop: Number(r.stop),
        tp1: Number(r.tp1),
      })),
    );
    return { kind, label: CARD_KIND_LABELS[kind], heldOut, forward, since: rows.length ? rows[rows.length - 1].signal_date : null };
  };
  const records = (await Promise.all(kinds.map(readKind))).filter((r): r is TradeCardKindRecord => r != null);
  return { signalDate, cards, heldBack, unchosen, kinds: records };
}
