/**
 * GSPS — /api/portfolio
 * Back-office snapshot: account equity, P/L percentages, and open positions
 * for the simulated paper account (see lib/brokers/simulator.ts). Live/
 * SnapTrade accounts merge in when connected — not yet wired here.
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { paperEquity, recordPaperEquityMarks } from "@/lib/portfolio/paper-equity";
import {
  getOrCreateAccount,
  listOpenPositions,
  listLiveOpenPositions,
  quotePrice,
  quoteOptionPrice,
  assetClassOf,
} from "@/lib/brokers/simulator";
import { buildBlendedPositions, type RawPosition } from "@/lib/portfolio/blend";
import { parseOccSymbol } from "@/lib/portfolio/occ";
import type { OpenedAt } from "@/lib/portfolio/opened-at";
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

    const [account, positionRows, livePositionRows] = await Promise.all([
      getOrCreateAccount(supabase, user.id),
      listOpenPositions(supabase, user.id),
      // Display-only merge of a connected live account's positions — see
      // this route's own header. Never contributes to `equity`/`cash`/
      // `buyingPower` below, which stay paper-only exactly as before.
      listLiveOpenPositions(supabase, user.id).catch(() => []),
    ]);
    const allPositionRows = [...positionRows, ...livePositionRows];

    // One quote per held symbol (paper + live combined, so a symbol held in
    // both isn't fetched twice). Equity/crypto reads the live feed; an
    // option leg tries a live per-contract quote first (see
    // lib/brokers/simulator.ts) and falls back to its own entry price when no
    // live options data is available, as markAllPaperEquity does. Until
    // 2026-10-21 it fell back to the underlying's spot, which values a $5
    // call on a $500 stock at $500 and wrote that into the equity record.
    const quotes = await Promise.all(
      allPositionRows.map(async (p) => {
        const occ = parseOccSymbol(p.symbol);
        const price = occ ? await quoteOptionPrice(p.symbol) : await quotePrice(p.symbol, assetClassOf(p.symbol));
        return [p.symbol, price] as const;
      }),
    );
    const equityPriceMap = new Map(quotes.filter(([, price]) => price != null));

    // The underlying's spot, for the blended view's underlying column only —
    // bounded to the underlyings actually held, not a market-wide call.
    const optionUnderlyings = new Set(
      allPositionRows.map((p) => parseOccSymbol(p.symbol)?.underlying).filter((u): u is string => Boolean(u)),
    );
    const spotEntries = await Promise.all(
      [...optionUnderlyings].map(async (sym) => [sym, await quotePrice(sym, assetClassOf(sym))] as const),
    );
    const spotMap = new Map(spotEntries);

    // Same per-row math as the paper builder below, reused for the live
    // merge — kept as a small local function rather than a shared export
    // since the two callers' inputs (SimPosition rows) and output shape
    // (RawPosition) are identical and this is the only other call site.
    function toRawPosition(p: (typeof positionRows)[number], mode: "paper" | "live"): RawPosition {
      const occ = parseOccSymbol(p.symbol);
      const currentPrice = equityPriceMap.get(p.symbol) ?? p.avg_entry_price;
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
        todayPlPct: 0,
        assetClassHint: occ ? "us_option" : "us_equity",
        stopLoss: occ ? null : p.stop_loss,
        takeProfit: occ ? null : p.take_profit,
        masterProfit: occ ? null : p.master_profit,
        mode,
      };
    }

    const liveRawPositions: RawPosition[] = livePositionRows.map((p) => toRawPosition(p, "live"));

    // Paper-only — `equity` below must never include a live leg's value.
    const rawPositions: RawPosition[] = positionRows.map((p) => toRawPosition(p, "paper"));

    // A short is owed back, so it counts against the account (paperEquity).
    // Before 2026-10-21 this added a short's market value, so a short sale's
    // credited cash was counted twice.
    const equity = paperEquity(
      account.cash,
      rawPositions.map((p) => ({ side: p.side === "short" ? "short" : "long", qty: Math.abs(p.qty), price: p.currentPrice })),
    );
    // The account's record over time (migration 0101); never blocks the page.
    await recordPaperEquityMarks(
      createServiceClient(),
      new Map([[user.id, { equity, cash: account.cash, openPositions: rawPositions.length }]]),
    ).catch((err: unknown) => console.error(`portfolio: equity mark not recorded — ${String(err)}`));

    const openedBySymbol = new Map<string, OpenedAt>(
      allPositionRows.map((p) => [p.symbol.toUpperCase(), { openedAt: p.opened_at, reason: "derived" as const }]),
    );

    // Live legs are merged in for display only — see this route's own
    // header and toRawPosition's `mode` param above. `equity`/`cash`/
    // `buyingPower` were already computed from `rawPositions` (paper-only)
    // before this merge.
    const blendedPositions = buildBlendedPositions(
      [...rawPositions, ...liveRawPositions],
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
