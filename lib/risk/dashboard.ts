/**
 * The risk dashboard: Gann's money rules for one paper account, read the way
 * placement reads them, on one screen (docs/SYNTHESIZED_ROADMAP.md Part 4, Q2
 * item 4). Display only. It refuses nothing and sizes nothing; every figure
 * comes from the same functions `lib/trade/place-order.ts` and the portfolio
 * manager use, so what the screen says is what an order will meet.
 *
 * What it shows, and the rule behind each:
 * - The trading unit (A-RISK-04, `gannRiskCapital` via `paperTradingUnit`),
 *   and the most one trade may risk: a tenth of it (never-failing rule 1),
 *   or a tenth of the profits once they equal the starting capital (A-RISK-07,
 *   `readProfitCeiling`).
 * - Capital held behind open shares, 30 Gann points a share (A-RISK-01,
 *   `capitalHeld`), against the account's equity.
 * - Markets open: five stocks, three other markets (A-RISK-08, rule 8).
 * - Open risk, position by position: entry to the stop the exit manager
 *   holds now (its trailed stop when it has one), each as a share of the
 *   unit. A position with no stop is shown as unprotected, never as zero risk.
 *   Resting entries count as placement counts them.
 * - The series of losses (`readLossSeries`: three in a row pause new entries
 *   that day and the next), the circuit breaker's state and whether its
 *   reset checklist is due, and the drawdown from the account's own record
 *   (`paperDrawdownPct`, migration 0101).
 *
 * Paper only: a live account's book is the broker's, and its capital rules
 * are read at placement from the broker (`placeLiveOrder`).
 *
 * Three-question basis: 1. Gann: each figure cites its rule above; he kept
 * these rules in front of him before every trade ("the trader's rules",
 * *Tunnel* pp.198-199; W006 p.46). 2. Cycles: no periodicity claim. 3.
 * Hermetic: Correspondence, the screen reads the same rule placement does, so
 * what is shown above is what is enforced below. Law of Creation: risk taken
 * ⊗ capital held, a creation: neither the open trades nor the account's
 * capital alone says how much room the next trade has.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { STARTING_CASH, getOrCreateAccount, listOpenPositions, listWorkingPaperEntries } from "@/lib/brokers/simulator";
import {
  MAX_OPEN_OTHER_MARKETS,
  MAX_OPEN_STOCKS,
  MAX_RISK_FRACTION,
  capitalHeld,
  maxRiskForTrade,
} from "@/lib/risk/gannCapital";
import { readWinningRun } from "@/lib/risk/dynamic-risk";
import { readProfitCeiling } from "@/lib/risk/profitPeak";
import { readUserLossSeries, type LossSeriesReading } from "@/lib/risk/lossSeries";
import { requiresResetChecklist } from "@/lib/risk/cooldown";
import { lastResetChecklistAt } from "@/lib/risk/service";
import type { CircuitState } from "@/lib/risk/config";
import { paperEquity, paperDrawdownPct } from "@/lib/portfolio/paper-equity";
import { paperTradingUnit } from "@/lib/trade/resting-entry-guard";
import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";

export interface RiskBookPosition {
  symbol: string;
  side: "long" | "short";
  qty: number;
  entry: number;
  /** The stop held now: the exit manager's trailed stop, else the position's own. */
  stop: number | null;
  /** True when the stop has moved past the entry, so the trade can no longer lose. */
  stopPastEntry: boolean;
  /** Dollars lost if the stop fills, never below zero. Null with no stop. */
  riskUsd: number | null;
  /** That risk as a percent of the trading unit. */
  riskPctOfUnit: number | null;
  resting: boolean;
  option: boolean;
}

export interface RiskBookInput {
  cash: number;
  unit: number;
  profitCeiling: number | null;
  positions: {
    symbol: string;
    side: "long" | "short";
    qty: number;
    entry: number;
    stop: number | null;
    option: boolean;
  }[];
  resting: { symbol: string; side: "buy" | "sell"; qty: number; price: number; stop: number | null }[];
}

export interface RiskBookSummary {
  equity: number;
  unit: number;
  maxRiskPerTrade: number;
  /** A-RISK-07 governs: the ceiling is a tenth of the profits, not of the unit. */
  profitCeilingGoverns: boolean;
  capitalHeld: number;
  capitalRoom: number;
  markets: { stocks: number; maxStocks: number; other: number; maxOther: number };
  openRiskUsd: number;
  openRiskPctOfUnit: number;
  unprotected: number;
  positions: RiskBookPosition[];
}

function riskOf(side: "long" | "short", entry: number, stop: number | null, qty: number) {
  if (stop == null || !Number.isFinite(stop)) return { riskUsd: null, stopPastEntry: false };
  const perShare = side === "long" ? entry - stop : stop - entry;
  return { riskUsd: Math.max(perShare, 0) * qty, stopPastEntry: perShare <= 0 };
}

/** Pure: the book's figures from what the loader read. */
export function summarizeRiskBook(input: RiskBookInput): RiskBookSummary {
  const equity = paperEquity(
    input.cash,
    input.positions.map((p) => ({ side: p.side, qty: p.qty, price: p.entry })),
  );
  const unit = Math.max(input.unit, 0);
  const pct = (usd: number | null) => (usd == null || !(unit > 0) ? null : (usd / unit) * 100);

  const rows: RiskBookPosition[] = [
    ...input.positions.map((p) => {
      const r = riskOf(p.side, p.entry, p.stop, p.qty);
      return { ...p, ...r, riskPctOfUnit: pct(r.riskUsd), resting: false };
    }),
    ...input.resting.map((w) => {
      const side = w.side === "buy" ? ("long" as const) : ("short" as const);
      const r = riskOf(side, w.price, w.stop, w.qty);
      return {
        symbol: w.symbol,
        side,
        qty: w.qty,
        entry: w.price,
        stop: w.stop,
        ...r,
        riskPctOfUnit: pct(r.riskUsd),
        resting: true,
        option: false,
      };
    }),
  ];

  // Shares only, and resting entries included, as placement holds them.
  const shares = rows.filter((r) => !r.option).map((r) => ({ symbol: r.symbol, qty: r.qty, price: r.entry }));
  const held = capitalHeld(shares);
  const marketsOf = (crypto: boolean) =>
    new Set(rows.filter((r) => !r.option && isCryptoSymbol(r.symbol) === crypto).map((r) => r.symbol.toUpperCase().replace("/", ""))).size;

  const openRiskUsd = rows.reduce((sum, r) => sum + (r.riskUsd ?? 0), 0);
  const maxRiskPerTrade = maxRiskForTrade(unit, input.profitCeiling);
  return {
    equity,
    unit,
    maxRiskPerTrade,
    profitCeilingGoverns: input.profitCeiling != null && input.profitCeiling < unit * MAX_RISK_FRACTION,
    capitalHeld: held,
    capitalRoom: Math.max(Math.max(equity, 0) - held, 0),
    markets: { stocks: marketsOf(false), maxStocks: MAX_OPEN_STOCKS, other: marketsOf(true), maxOther: MAX_OPEN_OTHER_MARKETS },
    openRiskUsd,
    openRiskPctOfUnit: unit > 0 ? (openRiskUsd / unit) * 100 : 0,
    unprotected: rows.filter((r) => r.stop == null).length,
    positions: rows,
  };
}

export interface RiskDashboard extends RiskBookSummary {
  startingCapital: number;
  lossSeries: LossSeriesReading | null;
  circuit: { state: CircuitState; reason: string | null; resetChecklistDue: boolean };
  /** High-water drawdown over the last 30 days, percent; null before the record covers it. */
  drawdown30dPct: number | null;
}

/**
 * Reads one member's paper book on the member's own client (each table lets
 * a member read their own rows). Throws when the book itself can't be read;
 * the loss series and drawdown read as null instead, so a missing side record
 * never hides the book.
 */
export async function readRiskDashboard(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<RiskDashboard> {
  const [account, open, run, exits, circuitRow, lastChecklist] = await Promise.all([
    getOrCreateAccount(supabase, userId),
    listOpenPositions(supabase, userId),
    readWinningRun(supabase, userId),
    supabase
      .from("protocol_exits")
      .select("symbol, side, stop_loss, applied_stop")
      .eq("user_id", userId)
      .eq("mode", "paper")
      .eq("status", "working"),
    supabase.from("risk_circuit_state").select("state, reason, triggered_at").eq("profile_id", userId).maybeSingle(),
    lastResetChecklistAt(supabase, userId),
  ]);
  const working = await listWorkingPaperEntries(supabase, userId, open);
  if (working == null) throw new Error("resting orders could not be read");

  // The exit manager's stop is the one that will fill; it trails, so it can
  // sit well past the position's opening stop.
  const exitStop = new Map<string, number>();
  for (const row of (exits.data ?? []) as { symbol: string; side: string; stop_loss: number | null; applied_stop: number | null }[]) {
    const stop = row.applied_stop ?? row.stop_loss;
    if (stop != null) exitStop.set(`${row.symbol.toUpperCase()}|${row.side}`, Number(stop));
  }

  const equityAtCost = paperEquity(account.cash, open.map((p) => ({ side: p.side, qty: p.qty, price: p.avg_entry_price })));
  const unit = paperTradingUnit(equityAtCost, run);
  const [profitCeiling, lossSeries, drawdown30dPct] = await Promise.all([
    readProfitCeiling(supabase, userId, "paper", Math.max(equityAtCost, 0)).catch(() => null),
    readUserLossSeries(supabase, userId, now).catch(() => null),
    paperDrawdownPct(supabase, userId, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)).catch(() => null),
  ]);

  const summary = summarizeRiskBook({
    cash: account.cash,
    unit,
    profitCeiling,
    positions: open.map((p) => ({
      symbol: p.symbol,
      side: p.side,
      qty: p.qty,
      entry: p.avg_entry_price,
      stop: exitStop.get(`${p.symbol.toUpperCase()}|${p.side}`) ?? p.stop_loss,
      option: p.asset_class === "option",
    })),
    resting: working,
  });

  const circuit = circuitRow.data as { state: CircuitState; reason: string | null; triggered_at: string } | null;
  const state: CircuitState = circuit?.state ?? "normal";
  // The same test as /api/risk/reset-checklist.
  const resetChecklistDue =
    circuit != null &&
    requiresResetChecklist(state) &&
    !(lastChecklist && lastChecklist >= new Date(circuit.triggered_at));

  return {
    ...summary,
    startingCapital: STARTING_CASH,
    lossSeries,
    circuit: { state, reason: circuit?.reason ?? null, resetChecklistDue },
    drawdown30dPct,
  };
}
