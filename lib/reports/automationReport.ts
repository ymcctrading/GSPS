/**
 * GSPS — the owner's daily comparison of the portfolio manager's paper
 * accounts (owner, 2026-10-28: "turn on the auto trader/portfolio managers ...
 * I desire to see how differently they may or may not trade ... Send the
 * results to the ymcctrading account daily at 5pm").
 *
 * One section per account the manager runs for: its settings, what it did
 * today (plans taken up, orders placed and filled, trades closed and their
 * result) and its record since its settings last changed (closed trades, won and
 * lost, total P&L), with its cash and open positions. Losses stay in. Pure:
 * the route (`app/api/automation-report/route.ts`) reads the rows and sends.
 * Paper only: the manager runs every profile on paper in the proving period
 * (`AUTONOMOUS_PROVING_PERIOD`). No rule names or sources appear in it.
 */

export interface AccountSettings {
  userId: string;
  email: string;
  riskProfile: string | null;
  directionalBias: string | null;
  executionMode: string | null;
  enabledSince: string | null;
}

export interface OrderRow {
  user_id: string;
  symbol: string;
  side: string;
  status: string;
  qty: number | string | null;
  filled_avg_price: number | string | null;
  created_at: string;
  mode: string | null;
}

export interface TradeRow {
  user_id: string;
  symbol: string;
  direction: string | null;
  outcome: string | null;
  profit_loss_dollars: number | string | null;
  exit_timestamp: string | null;
  mode: string | null;
}

export interface PositionRow {
  user_id: string;
  symbol: string;
  side: string | null;
  qty: number | string | null;
  avg_entry_price: number | string | null;
  stop_loss: number | string | null;
}

export interface ActivationRow {
  user_id: string;
  activated_at: string | null;
}

export interface AccountSection {
  settings: AccountSettings;
  cash: number | null;
  today: { activations: number; ordersPlaced: number; ordersFilled: number; closed: number; won: number; lost: number; pl: number; trades: string[] };
  sinceStart: { closed: number; won: number; lost: number; pl: number; winRate: number | null };
  open: PositionRow[];
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number) => `${n < 0 ? "-" : n > 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}`;
const isWin = (t: TradeRow) => num(t.profit_loss_dollars) > 0;
const isLoss = (t: TradeRow) => num(t.profit_loss_dollars) < 0;

/** The New York date of an instant. */
function etDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** One section per account, in the order given. `day` is the New York date reported. Pure. */
export function buildAccountSections(args: {
  day: string;
  accounts: AccountSettings[];
  cash: Map<string, number>;
  orders: OrderRow[];
  trades: TradeRow[];
  positions: PositionRow[];
  activations: ActivationRow[];
}): AccountSection[] {
  return args.accounts.map((settings) => {
    const mine = <T extends { user_id: string }>(rows: T[]) => rows.filter((r) => r.user_id === settings.userId);
    const orders = mine(args.orders).filter((o) => o.mode === "paper" && etDay(o.created_at) === args.day);
    const trades = mine(args.trades).filter((t) => t.mode === "paper" && t.exit_timestamp);
    const since = settings.enabledSince ? Date.parse(settings.enabledSince) : -Infinity;
    const sinceTrades = trades.filter((t) => Date.parse(t.exit_timestamp!) >= since);
    const todayTrades = trades.filter((t) => etDay(t.exit_timestamp!) === args.day);
    const sinceWon = sinceTrades.filter(isWin).length;
    const sinceLost = sinceTrades.filter(isLoss).length;
    return {
      settings,
      cash: args.cash.get(settings.userId) ?? null,
      today: {
        activations: mine(args.activations).filter((a) => a.activated_at && etDay(a.activated_at) === args.day).length,
        ordersPlaced: orders.length,
        ordersFilled: orders.filter((o) => o.status === "filled").length,
        closed: todayTrades.length,
        won: todayTrades.filter(isWin).length,
        lost: todayTrades.filter(isLoss).length,
        pl: todayTrades.reduce((s, t) => s + num(t.profit_loss_dollars), 0),
        trades: todayTrades.map((t) => `${t.symbol} ${t.direction === "sell" || t.direction === "short" ? "short" : "long"} ${money(num(t.profit_loss_dollars))}`),
      },
      sinceStart: {
        closed: sinceTrades.length,
        won: sinceWon,
        lost: sinceLost,
        pl: sinceTrades.reduce((s, t) => s + num(t.profit_loss_dollars), 0),
        winRate: sinceWon + sinceLost > 0 ? sinceWon / (sinceWon + sinceLost) : null,
      },
      open: mine(args.positions),
    };
  });
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function settingsLine(s: AccountSettings): string {
  const parts = [s.riskProfile ? s.riskProfile.toLowerCase() : "no risk setting", s.directionalBias ? `bias ${s.directionalBias.toLowerCase()}` : null, s.executionMode ?? null];
  return parts.filter(Boolean).join(", ");
}

/** The email: subject, plain text and HTML. Pure. */
export function automationReportEmail(day: string, sections: AccountSection[]): { subject: string; text: string; html: string } {
  const subject = `Portfolio manager accounts — ${day}`;
  const lines: string[] = [`Portfolio manager accounts, paper, ${day} (New York).`, ""];
  if (sections.length === 0) lines.push("No account has the portfolio manager switched on.");
  for (const s of sections) {
    const t = s.today;
    const a = s.sinceStart;
    lines.push(
      `${s.settings.email} (${settingsLine(s.settings)})`,
      `  Today: ${t.activations} plans taken up, ${t.ordersPlaced} orders placed, ${t.ordersFilled} filled, ${t.closed} trades closed (${t.won} won, ${t.lost} lost), ${money(t.pl)}.`,
      ...(t.trades.length ? [`  Closed today: ${t.trades.join("; ")}`] : []),
      `  Since its settings were last changed${s.settings.enabledSince ? ` (${etDay(s.settings.enabledSince)})` : ""}: ${a.closed} closed, ${a.won} won, ${a.lost} lost${a.winRate != null ? ` (${(a.winRate * 100).toFixed(0)}% won)` : ""}, ${money(a.pl)}.`,
      `  Open: ${s.open.length ? s.open.map((p) => `${p.symbol} ${p.side ?? ""} ${num(p.qty)} @ ${num(p.avg_entry_price).toFixed(2)}`.replace(/\s+/g, " ")).join("; ") : "none"}. Cash ${s.cash != null ? `$${s.cash.toFixed(2)}` : "not read"}.`,
      "",
    );
  }
  lines.push("Paper accounts only. The running totals restart whenever an account's portfolio manager settings change. One day is not a record; read the totals over weeks.");
  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${lines
    .map((l) => (l === "" ? "<br>" : `<div>${escape(l).replace(/^ {2}/, "&nbsp;&nbsp;")}</div>`))
    .join("")}</div>`;
  return { subject, text, html };
}
