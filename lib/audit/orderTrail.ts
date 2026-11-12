/**
 * A member's order audit trail (Q4 roadmap: "Compliance & audit logging —
 * complete trade audit trail"): every order they placed, with the plan it was
 * placed on, what the broker did with it, and how the trade that came of it
 * closed, as one CSV a member can keep or hand to an accountant or reviewer.
 *
 * It reads what the ledger already holds and adds nothing to it: `orders`
 * (the levels, the source of those levels, the rules version stored with the
 * order, status, fill, the broker's refusal in its own words), the plan behind
 * it through `orders.source_plan_id` (`trade_plans`: when it was made, its
 * entry trigger, invalidation, TP1 and MTP, its state), and the trade log
 * that closed it (`trade_logs.order_id`). The plan's evidence (its per-rule
 * breakdown and regime) is never exported, the same as on every member
 * surface (R-021).
 *
 * The method's ground: keep a record of every trade, the plan it was taken on
 * and how it ended, and read it back (ref: SRC-003 pp. 34-38; ref: SRC-002).
 * The trail is that record with the cause (the plan) beside the effect (the
 * fill and the close).
 *
 * Three-question basis:
 * 1. Method: as above.
 * 2. Cycles: no periodicity claim.
 * 3. Hermetic: Cause and Effect (each row joins the decision to its result)
 *    and Correspondence (the export reads the same rows the Portfolio page and
 *    the record card read, so the three can't disagree).
 */

import { LEVEL_SOURCE_LABELS, type LevelSource } from "@/lib/trade/level-source";

export interface TrailOrder {
  id: string;
  created_at: string;
  mode: string | null;
  symbol: string;
  side: string;
  order_type: string;
  qty: number | string | null;
  limit_price: number | string | null;
  stop_price: number | string | null;
  take_profit: number | string | null;
  master_profit: number | string | null;
  level_source: string | null;
  strategy_version: string | null;
  status: string;
  broker_submitted_at: string | null;
  reject_reason: string | null;
  filled_qty: number | string | null;
  filled_avg_price: number | string | null;
  source_plan_id: string | null;
}

export interface TrailPlan {
  plan_id: string;
  generated_at: string;
  entry_trigger: number | string | null;
  invalidation: number | string | null;
  take_profit_1: number | string | null;
  master_profit: number | string | null;
  state: string;
}

export interface TrailTradeLog {
  order_id: string | null;
  exit_timestamp: string | null;
  exit_price: number | string | null;
  outcome: string | null;
  profit_loss_dollars: number | string | null;
  exit_condition: string | null;
}

export const TRAIL_COLUMNS = [
  ["order_id", "Order"],
  ["placed_at", "Placed (UTC)"],
  ["account", "Account"],
  ["symbol", "Symbol"],
  ["side", "Side"],
  ["order_type", "Type"],
  ["qty", "Qty"],
  ["limit_price", "Limit"],
  ["stop", "Stop"],
  ["tp1", "TP1"],
  ["mtp", "MTP"],
  ["levels_from", "Levels from"],
  ["rules_version", "Rules version"],
  ["status", "Status"],
  ["broker_accepted_at", "Broker accepted (UTC)"],
  ["refused_because", "Refused because"],
  ["filled_qty", "Filled qty"],
  ["fill_price", "Fill price"],
  ["plan_id", "Plan"],
  ["plan_made_at", "Plan made (UTC)"],
  ["plan_entry", "Plan entry"],
  ["plan_invalidation", "Plan invalidation"],
  ["plan_tp1", "Plan TP1"],
  ["plan_mtp", "Plan MTP"],
  ["plan_state", "Plan state"],
  ["closed_at", "Closed (UTC)"],
  ["exit_price", "Exit price"],
  ["outcome", "Outcome"],
  ["pl_dollars", "P/L ($)"],
  ["exit_reason", "Exit reason"],
] as const;

export type TrailKey = (typeof TRAIL_COLUMNS)[number][0];
export type TrailRow = Record<TrailKey, string>;

const EXIT_REASON: Record<string, string> = {
  tp1: "TP1",
  master_target: "MTP",
  stop_loss: "Stop",
  manual: "Closed by you",
};

function num(v: number | string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

function text(v: string | null | undefined): string {
  return v == null ? "" : String(v);
}

/**
 * One row per order, newest first as given. A trade log is matched by its
 * `order_id`; when several share one (partial closes), the latest close wins
 * and the P/L is their sum.
 */
export function buildOrderTrail(
  orders: readonly TrailOrder[],
  plans: readonly TrailPlan[],
  logs: readonly TrailTradeLog[],
): TrailRow[] {
  const planById = new Map(plans.map((p) => [p.plan_id, p]));
  const closeByOrder = new Map<string, { last: TrailTradeLog; pl: number | null }>();
  for (const l of logs) {
    if (!l.order_id || !l.exit_timestamp || l.outcome === "pending") continue;
    const prev = closeByOrder.get(l.order_id);
    const pl = l.profit_loss_dollars == null || !Number.isFinite(Number(l.profit_loss_dollars)) ? null : Number(l.profit_loss_dollars);
    if (!prev) {
      closeByOrder.set(l.order_id, { last: l, pl });
      continue;
    }
    const later = Date.parse(l.exit_timestamp) > Date.parse(prev.last.exit_timestamp ?? "") ? l : prev.last;
    closeByOrder.set(l.order_id, { last: later, pl: prev.pl == null && pl == null ? null : (prev.pl ?? 0) + (pl ?? 0) });
  }

  return orders.map((o) => {
    const plan = o.source_plan_id ? planById.get(o.source_plan_id) : undefined;
    const close = closeByOrder.get(o.id);
    const sum = close?.pl;
    return {
      order_id: o.id,
      placed_at: text(o.created_at),
      account: o.mode === "live" ? "Live" : "Paper",
      symbol: o.symbol,
      side: o.side,
      order_type: o.order_type,
      qty: num(o.qty),
      limit_price: num(o.limit_price),
      stop: num(o.stop_price),
      tp1: num(o.take_profit),
      mtp: num(o.master_profit),
      levels_from: o.level_source && o.level_source in LEVEL_SOURCE_LABELS ? LEVEL_SOURCE_LABELS[o.level_source as LevelSource] : "",
      rules_version: text(o.strategy_version),
      status: o.status,
      broker_accepted_at: text(o.broker_submitted_at),
      refused_because: text(o.reject_reason),
      filled_qty: num(o.filled_qty),
      fill_price: num(o.filled_avg_price),
      plan_id: plan ? plan.plan_id : text(o.source_plan_id),
      plan_made_at: plan ? text(plan.generated_at) : "",
      plan_entry: plan ? num(plan.entry_trigger) : "",
      plan_invalidation: plan ? num(plan.invalidation) : "",
      plan_tp1: plan ? num(plan.take_profit_1) : "",
      plan_mtp: plan ? num(plan.master_profit) : "",
      plan_state: plan ? plan.state : "",
      closed_at: close ? text(close.last.exit_timestamp) : "",
      exit_price: close ? num(close.last.exit_price) : "",
      outcome: close?.last.outcome === "profit" ? "Gain" : close?.last.outcome === "loss" ? "Loss" : "",
      pl_dollars: sum == null ? "" : String(Math.round(sum * 100) / 100),
      exit_reason: close?.last.exit_condition ? (EXIT_REASON[close.last.exit_condition] ?? "") : "",
    };
  });
}

/**
 * A CSV cell: quoted when it holds a comma, quote or line break, and a leading
 * `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'` so a
 * spreadsheet never runs a cell as a formula (a symbol or a broker's refusal
 * text is not ours to trust). Plain negative numbers stay numbers.
 */
export function csvCell(v: string): string {
  let s = v;
  if (/^[=+\-@\t\r]/.test(s) && !/^-\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function trailCsv(rows: readonly TrailRow[]): string {
  const header = TRAIL_COLUMNS.map(([, label]) => csvCell(label)).join(",");
  const body = rows.map((r) => TRAIL_COLUMNS.map(([key]) => csvCell(r[key])).join(","));
  return [header, ...body].join("\r\n") + "\r\n";
}
