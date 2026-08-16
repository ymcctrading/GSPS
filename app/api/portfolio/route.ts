/**
 * GSPS — /api/portfolio
 * Back-office snapshot: account equity, P/L percentages, and open positions
 * for the simulated paper account (see lib/brokers/simulator.ts). Live/
 * SnapTrade accounts merge in when connected — not yet wired here.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateAccount, listOpenPositions, quotePrice, quoteOptionPrice, assetClassOf } from "@/lib/brokers/simulator";
import { buildBlendedPositions, type RawPosition } from "@/lib/portfolio/blend";
import { parseOccSymbol } from "@/lib/portfolio/occ";
import type { OpenedAt } from "@/lib/portfolio/opened-at";
import { pruneClosedPositions } from "@/lib/portfolio/prune";
import { manageSimulatedExits } from "@/lib/trade/exit-manager-sim";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    // Advancing the staged exits here is what makes the trailing stop and the
    // master-target reversal real — both depend on where price has *been*, so
    // they can only move forward when something samples the market. The
    // Portfolio page polls this endpoint, which is where the sampling happens.
    const exits = await manageSimulatedExits(supabase, user.id).catch(
      (err): { managed: number; filled: number; closed: number; notes: string[]; error: string | null } => ({
        managed: 0,
        filled: 0,
        closed: 0,
        notes: [],
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    if (exits.error) console.error(`portfolio: exit management — ${exits.error}`);

    // A closed position has nothing left to show once it's more than 24
    // hours old — see lib/portfolio/prune.ts.
    const prune = await pruneClosedPositions(supabase, user.id).catch(
      (err): { deleted: number; error: string | null } => ({
        deleted: 0,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    if (prune.error) console.error(`portfolio: closed-position prune — ${prune.error}`);

    const [account, positionRows] = await Promise.all([
      getOrCreateAccount(supabase, user.id),
      listOpenPositions(supabase, user.id),
    ]);

    // One quote per held symbol. Equity/crypto reads the live feed; an option
    // leg tries a live per-contract quote first (see lib/brokers/simulator.ts)
    // and falls back to the underlying's spot, then its own entry price, when
    // no live options data is available.
    const quotes = await Promise.all(
      positionRows.map(async (p) => {
        const occ = parseOccSymbol(p.symbol);
        const price = occ ? await quoteOptionPrice(p.symbol) : await quotePrice(p.symbol, assetClassOf(p.symbol));
        return [p.symbol, price] as const;
      }),
    );
    const equityPriceMap = new Map(quotes.filter(([, price]) => price != null));

    // The underlying's spot, as the option leg's fallback mark — bounded to
    // just the underlyings actually held, not a market-wide call.
    const optionUnderlyings = new Set(
      positionRows.map((p) => parseOccSymbol(p.symbol)?.underlying).filter((u): u is string => Boolean(u)),
    );
    const spotEntries = await Promise.all(
      [...optionUnderlyings].map(async (sym) => [sym, await quotePrice(sym, assetClassOf(sym))] as const),
    );
    const spotMap = new Map(spotEntries);

    const rawPositions: RawPosition[] = positionRows.map((p) => {
      const occ = parseOccSymbol(p.symbol);
      // A live quote for the position itself (equity, crypto, or — best
      // effort — the option contract), else the underlying's spot as a
      // stand-in for an option leg's mark, else the entry price — never leave
      // a leg with no price to render at all.
      const currentPrice = equityPriceMap.get(p.symbol) ?? (occ ? spotMap.get(occ.underlying) : null) ?? p.avg_entry_price;
      const signedQty = p.side === "short" ? -p.qty : p.qty;
      const marketValue = currentPrice * p.qty;
      const perShare = p.side === "long" ? currentPrice - p.avg_entry_price : p.avg_entry_price - currentPrice;
      const unrealizedPl = perShare * p.qty;
      const unrealizedPlPct = p.avg_entry_price > 0 ? (perShare / p.avg_entry_price) * 100 : 0;
      return {
        symbol: p.symbol,
        qty: signedQty,
        side: p.side,
        avgEntry: p.avg_entry_price,
        currentPrice,
        marketValue,
        unrealizedPl,
        unrealizedPlPct,
        // Not modeled: doing this accurately needs each symbol's previous
        // session close, which isn't fetched here. Zero rather than a wrong
        // number.
        todayPlPct: 0,
        assetClassHint: occ ? "us_option" : "us_equity",
      };
    });

    const equity = account.cash + rawPositions.reduce((sum, p) => sum + p.marketValue, 0);

    const openedBySymbol = new Map<string, OpenedAt>(
      positionRows.map((p) => [p.symbol.toUpperCase(), { openedAt: p.opened_at, reason: "derived" as const }]),
    );

    const blendedPositions = buildBlendedPositions(
      rawPositions,
      (underlying) => equityPriceMap.get(underlying) ?? spotMap.get(underlying) ?? null,
      (symbol) => openedBySymbol.get(symbol),
    );

    return NextResponse.json({
      mode: "paper",
      account: {
        equity,
        cash: account.cash,
        // No margin modeled — a simulated cash account can only buy what it
        // holds in cash.
        buyingPower: account.cash,
        dayPlPct: 0,
        currency: "USD",
      },
      positions: rawPositions,
      blendedPositions,
      sync: {
        syncedAt: new Date().toISOString(),
        source: "simulated-paper",
        fillHistoryAvailable: true,
        reconciled: { opened: 0, closed: 0 },
        reconcileError: null,
        exitManagement: { filled: exits.filled, closed: exits.closed, notes: exits.notes, error: exits.error },
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
