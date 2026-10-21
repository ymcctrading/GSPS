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
 * - Open risk, position by position: each working exit plan's own entry,
 *   its remaining shares and the stop the paper exit manager holds now (its
 *   trailed stop when it has one), as a share of the unit. Shares no working
 *   plan covers are shown as unprotected, never as zero risk, since nothing
 *   exits them. A bought option risks its premium (`optionPremiumRefusal`).
 *   Resting entries count as placement counts them.
 * - Novice's guard rails, where the tier has them (`percentRiskCeilings`,
 *   `checkPositionLimits`): one position, the deployed total and open risk as
 *   percents of equity, and one symbol at a time. Open risk there is read
 *   from each position's opening stop, as placement reads it.
 * - The series of losses (`readLossSeries`: three in a row pause new entries
 *   that day and the next) and the drawdown from the account's own record
 *   (`paperDrawdownPct`, migration 0101).
 *
 * Paper only. The circuit breaker is the live account's (it is written from
 * live equity and read only by `placeLiveOrder`), so it is not shown here; the
 * reset checklist has its own card in Settings.
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
  OPTION_CONTRACT_MULTIPLIER,
  capitalHeld,
  maxRiskForTrade,
} from "@/lib/risk/gannCapital";
import {
  MAX_AGGREGATE_DEPLOYED_ALLOCATION_PCT,
  MAX_SINGLE_POSITION_ALLOCATION_PCT,
  MAX_TOTAL_OPEN_RISK_PCT,
} from "@/lib/risk/config";
import { readWinningRun } from "@/lib/risk/dynamic-risk";
import { readProfitCeiling } from "@/lib/risk/profitPeak";
import { readUserLossSeries, type LossSeriesReading } from "@/lib/risk/lossSeries";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { paperEquity, paperDrawdownPct } from "@/lib/portfolio/paper-equity";
import { paperTradingUnit } from "@/lib/trade/resting-entry-guard";
import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";

/** One working exit plan's open shares: its own entry and the stop it holds now. */
export interface StopLeg {
  qty: number;
  entry: number;
  stop: number;
}

export interface RiskBookPosition {
  symbol: string;
  side: "long" | "short";
  qty: number;
  entry: number;
  /** The stops the exit manager holds now, one per working plan. */
  stops: number[];
  /** Every share is covered and every stop is past its entry, so the trade can no longer lose. */
  stopPastEntry: boolean;
  /** Shares no working exit plan covers: nothing exits them. */
  unprotectedQty: number;
  /** Dollars lost if the stops fill (a bought option: its premium). Null when no share is covered. */
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
    /** The position's opening stop, which Novice's open-risk ceiling reads. */
    openingStop: number | null;
    option: boolean;
    legs: StopLeg[];
  }[];
  resting: { symbol: string; side: "buy" | "sell"; qty: number; price: number; stop: number | null }[];
  /** Novice's guard rails, when the tier has them. */
  noviceCeilings?: { maxGroups: number | "unlimited" } | null;
}

export interface NoviceCeilings {
  maxPositionUsd: number;
  deployedRoomUsd: number;
  openRiskRoomUsd: number;
  symbolsOpen: number;
  maxSymbols: number | "unlimited";
}

export interface RiskBookSummary {
  equity: number;
  unit: number;
  maxRiskPerTrade: number;
  /** What sets that figure: a tenth of the unit, a tenth of the profits, or Novice's open-risk room. */
  maxRiskSetBy: "unit" | "profits" | "novice_open_risk";
  capitalHeld: number;
  capitalRoom: number;
  markets: { stocks: number; maxStocks: number; other: number; maxOther: number };
  openRiskUsd: number;
  openRiskPctOfUnit: number;
  /** Positions with any share no stop covers. */
  unprotected: number;
  novice: NoviceCeilings | null;
  positions: RiskBookPosition[];
}

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

function legRisk(side: "long" | "short", leg: StopLeg): number {
  const perShare = side === "long" ? leg.entry - leg.stop : leg.stop - leg.entry;
  return Math.max(perShare, 0) * leg.qty;
}

/** Pure: the book's figures from what the loader read. */
export function summarizeRiskBook(input: RiskBookInput): RiskBookSummary {
  const equity = paperEquity(
    input.cash,
    input.positions.map((p) => ({ side: p.side, qty: p.qty, price: p.entry })),
  );
  const unit = Math.max(input.unit, 0);
  const pct = (usd: number | null) => (usd == null || !(unit > 0) ? null : (usd / unit) * 100);

  const held: RiskBookPosition[] = input.positions.map((p) => {
    if (p.option) {
      // A bought option can lose its premium and no more; a written one has no stop.
      const risk = p.side === "long" && finite(p.entry) ? Math.abs(p.entry) * p.qty * OPTION_CONTRACT_MULTIPLIER : null;
      return {
        symbol: p.symbol, side: p.side, qty: p.qty, entry: p.entry, stops: [],
        stopPastEntry: false, unprotectedQty: risk == null ? p.qty : 0,
        riskUsd: risk, riskPctOfUnit: pct(risk), resting: false, option: true,
      };
    }
    const legs = p.legs.filter((l) => finite(l.qty) && l.qty > 0 && finite(l.entry) && finite(l.stop));
    const covered = Math.min(legs.reduce((n, l) => n + l.qty, 0), p.qty);
    const unprotectedQty = Math.max(p.qty - covered, 0);
    const risk = legs.length === 0 ? null : legs.reduce((sum, l) => sum + legRisk(p.side, l), 0);
    return {
      symbol: p.symbol, side: p.side, qty: p.qty, entry: p.entry,
      stops: legs.map((l) => l.stop),
      stopPastEntry: legs.length > 0 && unprotectedQty === 0 && risk === 0,
      unprotectedQty, riskUsd: risk, riskPctOfUnit: pct(risk), resting: false, option: false,
    };
  });
  const resting: RiskBookPosition[] = input.resting.map((w) => {
    const side = w.side === "buy" ? ("long" as const) : ("short" as const);
    const ok = finite(w.stop) && finite(w.price);
    const risk = ok ? legRisk(side, { qty: w.qty, entry: w.price, stop: w.stop as number }) : null;
    return {
      symbol: w.symbol, side, qty: w.qty, entry: w.price, stops: ok ? [w.stop as number] : [],
      stopPastEntry: false, unprotectedQty: ok ? 0 : w.qty,
      riskUsd: risk, riskPctOfUnit: pct(risk), resting: true, option: false,
    };
  });
  const rows = [...held, ...resting];

  // Shares only, and resting entries included, as placement holds them.
  const shares = rows.filter((r) => !r.option).map((r) => ({ symbol: r.symbol, qty: r.qty, price: r.entry }));
  const capital = capitalHeld(shares);
  const marketsOf = (crypto: boolean) =>
    new Set(rows.filter((r) => !r.option && isCryptoSymbol(r.symbol) === crypto).map((r) => r.symbol.toUpperCase().replace("/", ""))).size;

  const openRiskUsd = rows.reduce((sum, r) => sum + (finite(r.riskUsd) ? r.riskUsd : 0), 0);
  const tenth = maxRiskForTrade(unit, input.profitCeiling);
  let maxRiskPerTrade = tenth;
  let maxRiskSetBy: RiskBookSummary["maxRiskSetBy"] =
    input.profitCeiling != null && input.profitCeiling < unit * MAX_RISK_FRACTION ? "profits" : "unit";

  let novice: NoviceCeilings | null = null;
  if (input.noviceCeilings) {
    // As placement reads them (place-order.ts, checkPositionLimits): positions
    // at cost and resting entries at their limit, and open risk from each
    // position's opening stop.
    const e = Math.max(equity, 0);
    const deployed =
      input.positions.reduce((sum, p) => sum + p.qty * p.entry, 0) + input.resting.reduce((sum, w) => sum + w.qty * w.price, 0);
    const placementRisk =
      input.positions.reduce((sum, p) => sum + (finite(p.openingStop) ? Math.abs(p.entry - p.openingStop) * p.qty : 0), 0) +
      input.resting.reduce((sum, w) => sum + (finite(w.stop) ? Math.abs(w.price - w.stop) * w.qty : 0), 0);
    const openRiskRoomUsd = Math.max((e * MAX_TOTAL_OPEN_RISK_PCT) / 100 - placementRisk, 0);
    novice = {
      maxPositionUsd: (e * MAX_SINGLE_POSITION_ALLOCATION_PCT) / 100,
      deployedRoomUsd: Math.max((e * MAX_AGGREGATE_DEPLOYED_ALLOCATION_PCT) / 100 - deployed, 0),
      openRiskRoomUsd,
      symbolsOpen: new Set([...input.positions.map((p) => p.symbol.toUpperCase()), ...input.resting.map((w) => w.symbol.toUpperCase())]).size,
      maxSymbols: input.noviceCeilings.maxGroups,
    };
    if (openRiskRoomUsd < maxRiskPerTrade) {
      maxRiskPerTrade = openRiskRoomUsd;
      maxRiskSetBy = "novice_open_risk";
    }
  }

  return {
    equity,
    unit,
    maxRiskPerTrade,
    maxRiskSetBy,
    capitalHeld: capital,
    capitalRoom: Math.max(Math.max(equity, 0) - capital, 0),
    markets: { stocks: marketsOf(false), maxStocks: MAX_OPEN_STOCKS, other: marketsOf(true), maxOther: MAX_OPEN_OTHER_MARKETS },
    openRiskUsd,
    openRiskPctOfUnit: unit > 0 ? (openRiskUsd / unit) * 100 : 0,
    unprotected: rows.filter((r) => r.unprotectedQty > 0).length,
    novice,
    positions: rows,
  };
}

export interface RiskDashboard extends RiskBookSummary {
  startingCapital: number;
  lossSeries: LossSeriesReading | null;
  /** High-water drawdown over the last 30 days, percent; null before the record covers it. */
  drawdown30dPct: number | null;
}

interface ExitRow {
  symbol: string;
  side: string;
  entry_price: number | string;
  stop_loss: number | string | null;
  applied_stop: number | string | null;
  scale_out_qty: number | string | null;
  master_qty: number | string | null;
  runner_qty: number | string | null;
  scale_out_order_id: string | null;
  master_order_id: string | null;
  runner_order_id: string | null;
}

/** A working plan's shares still open: its tranches with no exit order yet, as the exit manager reads them. */
export function openLegOf(row: ExitRow): StopLeg | null {
  const qty =
    (row.scale_out_order_id ? 0 : Number(row.scale_out_qty ?? 0)) +
    (row.master_order_id ? 0 : Number(row.master_qty ?? 0)) +
    (row.runner_order_id ? 0 : Number(row.runner_qty ?? 0));
  const stop = Number(row.applied_stop ?? row.stop_loss);
  const entry = Number(row.entry_price);
  if (!(qty > 0) || !Number.isFinite(stop) || !Number.isFinite(entry)) return null;
  return { qty, entry, stop };
}

/**
 * Reads one member's paper book on the member's own client (each table lets
 * a member read their own rows). Throws when the exit plans or resting orders
 * can't be read. Open positions read as placement reads them
 * (`listOpenPositions`, which returns none on an error, as placement sees it).
 * The loss series and drawdown read as null instead, so a missing side
 * record never hides the book.
 */
export async function readRiskDashboard(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<RiskDashboard> {
  const [account, open, run, exits, entitlements] = await Promise.all([
    getOrCreateAccount(supabase, userId),
    listOpenPositions(supabase, userId),
    readWinningRun(supabase, userId),
    supabase
      .from("protocol_exits")
      .select(
        "symbol, side, entry_price, stop_loss, applied_stop, scale_out_qty, master_qty, runner_qty, scale_out_order_id, master_order_id, runner_order_id",
      )
      .eq("user_id", userId)
      .eq("mode", "paper")
      .eq("status", "working"),
    getUserEntitlementPolicy(supabase, userId),
  ]);
  if (exits.error) throw new Error(`exit plans could not be read: ${exits.error.message}`);
  const working = await listWorkingPaperEntries(supabase, userId, open);
  if (working == null) throw new Error("resting orders could not be read");

  // The paper exit manager acts on each working plan by itself, on its own
  // entry, stop and remaining tranches; a position's own stop_loss is not
  // acted on by anything.
  const legsBy = new Map<string, StopLeg[]>();
  for (const row of (exits.data ?? []) as ExitRow[]) {
    const leg = openLegOf(row);
    if (!leg) continue;
    const key = `${row.symbol.toUpperCase()}|${row.side}`;
    legsBy.set(key, [...(legsBy.get(key) ?? []), leg]);
  }

  const equityAtCost = paperEquity(account.cash, open.map((p) => ({ side: p.side, qty: p.qty, price: p.avg_entry_price })));
  const unit = paperTradingUnit(equityAtCost, run);
  const [profitCeiling, lossSeries, drawdown30dPct] = await Promise.all([
    readProfitCeiling(supabase, userId, "paper", Math.max(equityAtCost, 0)),
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
      openingStop: p.stop_loss,
      option: p.asset_class === "option",
      legs: legsBy.get(`${p.symbol.toUpperCase()}|${p.side}`) ?? [],
    })),
    resting: working,
    noviceCeilings: entitlements.percentRiskCeilings ? { maxGroups: entitlements.maxCorrelatedRiskGroups } : null,
  });

  return { ...summary, startingCapital: STARTING_CASH, lossSeries, drawdown30dPct };
}
