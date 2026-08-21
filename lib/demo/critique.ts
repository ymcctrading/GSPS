/**
 * GSPS — LLM-written critiques for automated trades.
 *
 * Every trade the demo account's auto-trader closes (lib/demo/auto-trade.ts)
 * gets a short, plain-English writeup: why the setup was taken, and how it
 * actually played out. Written by Claude from `trade_logs`' own fields — the
 * same data the trade-journal spreadsheet already reads (see
 * lib/journal/build-workbook.ts) — and stored in `trade_critiques`
 * (migration 0034), one row per finished trade.
 *
 * Fails closed and silent: no `ANTHROPIC_API_KEY` configured, or any error
 * calling the API, just means fewer critiques exist yet — never a reason to
 * fail the request that triggered this (the auto-trade cron run). A trade
 * missing its critique is picked up again next time this runs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

/** claude-opus-5 by default — see the claude-api skill's model table. Short, single-call, no reasoning depth needed for a five-sentence recap. */
const MODEL = "claude-opus-5";
/** How many un-critiqued trades one sweep writes. Bounded so a backlog can't turn one cron run into dozens of API calls. */
const MAX_PER_SWEEP = 5;

interface TradeForCritique {
  id: string;
  symbol: string;
  direction: "buy" | "sell";
  quantity: number;
  entry_price: number;
  entry_timestamp: string;
  exit_price: number | null;
  exit_timestamp: string | null;
  outcome: "profit" | "loss" | "pending" | null;
  profit_loss_dollars: number | null;
  profit_loss_percent: number | null;
  exit_condition: string | null;
  signal_called: string;
  signal_adherence: string | null;
}

let client: Anthropic | null | undefined;
/** Constructed once per process, lazily — undefined means "not tried yet", null means "no key configured". */
function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  return client;
}

function describeTrade(t: TradeForCritique): string {
  const lines = [
    `Symbol: ${t.symbol}`,
    `Side: ${t.direction === "buy" ? "long" : "short"}`,
    `Quantity: ${t.quantity}`,
    `Entry: $${t.entry_price} at ${t.entry_timestamp}`,
    t.exit_price != null ? `Exit: $${t.exit_price} at ${t.exit_timestamp}` : "Exit: not yet closed",
    `Outcome: ${t.outcome ?? "unknown"}`,
    t.profit_loss_dollars != null ? `P/L: $${t.profit_loss_dollars.toFixed(2)} (${t.profit_loss_percent?.toFixed(2) ?? "?"}%)` : "",
    t.exit_condition ? `Exited via: ${t.exit_condition}` : "",
    `Signal that called it: ${t.signal_called}`,
    t.signal_adherence ? `Followed the signal: ${t.signal_adherence}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/** One trade's critique, or null if it couldn't be generated (no key, or the API call failed). */
export async function generateTradeCritique(trade: TradeForCritique): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      output_config: { effort: "low" },
      system:
        "You write short, honest trade critiques for a demo trading account shown to prospective " +
        "investors and users. Given one closed trade's numbers, write 3-5 plain-English sentences: " +
        "why the setup was taken (from the signal that called it), and how it actually played out. " +
        "Neutral and factual — praise a good outcome plainly, but a loss gets the same even tone as a " +
        "win. No hedging disclaimers, no headers, no bullet points, just the paragraph.",
      messages: [{ role: "user", content: describeTrade(trade) }],
    });
    const text = response.content.find((b) => b.type === "text");
    return text && "text" in text ? text.text.trim() : null;
  } catch (err) {
    console.error(`demo critique: generation failed for trade ${trade.id} — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Writes critiques for whatever closed trades don't have one yet, for one
 * user, oldest first, up to MAX_PER_SWEEP. Meant to be called after
 * lib/demo/auto-trade.ts's run, from the same cron — a sweep rather than a
 * write hooked into every trade-closing code path (positions/close,
 * exit-manager-sim, place-order's plain-close logging) because a trade can
 * close from any of those, and a missed hook would silently mean a trade
 * with no critique forever. Idempotent: a trade already critiqued is never
 * revisited.
 */
export async function generateMissingCritiques(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ generated: number; errors: number }> {
  if (!getClient()) return { generated: 0, errors: 0 };

  const { data: closedTrades } = await supabase
    .from("trade_logs")
    .select(
      "id, symbol, direction, quantity, entry_price, entry_timestamp, exit_price, exit_timestamp, outcome, profit_loss_dollars, profit_loss_percent, exit_condition, signal_called, signal_adherence",
    )
    .eq("user_id", userId)
    .neq("outcome", "pending")
    .order("exit_timestamp", { ascending: true })
    .limit(200);

  const trades = (closedTrades ?? []) as TradeForCritique[];
  if (trades.length === 0) return { generated: 0, errors: 0 };

  const { data: existing } = await supabase
    .from("trade_critiques")
    .select("trade_log_id")
    .in(
      "trade_log_id",
      trades.map((t) => t.id),
    );
  const critiqued = new Set(((existing ?? []) as { trade_log_id: string }[]).map((r) => r.trade_log_id));

  const pending = trades.filter((t) => !critiqued.has(t.id)).slice(0, MAX_PER_SWEEP);

  let generated = 0;
  let errors = 0;
  for (const trade of pending) {
    const critique = await generateTradeCritique(trade);
    if (!critique) {
      errors += 1;
      continue;
    }
    const { error } = await supabase
      .from("trade_critiques")
      .insert({ trade_log_id: trade.id, user_id: userId, critique, model: MODEL });
    if (error) {
      // A concurrent sweep writing the same trade_log_id loses the unique
      // constraint race, not a real failure — anything else is.
      if (!error.message.includes("duplicate key")) errors += 1;
      continue;
    }
    generated += 1;
  }

  return { generated, errors };
}
