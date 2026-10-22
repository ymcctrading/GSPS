/**
 * The one way a finished trade is written to `trade_logs` on the paper paths.
 *
 * Review findings S-08 and P-02 (2026-10-21). A failed insert was logged to
 * the console and the fill stood, so a closed trade could leave no ledger
 * record; and no row said which rules produced the trade. Now each row
 * carries `strategy_version` (migration 0094), and a failed insert is tried
 * again, `TRADE_LOG_ATTEMPTS` times in all, before the error is returned. A
 * unique-key hit is never retried: it means another pass already wrote this
 * trade (`exit_plan_id`, migration 0009). The position row keeps its realized
 * P&L either way (`execute_position_fill`, migration 0088).
 *
 * Every row names its account (`mode`, migration 0107, review finding R-002):
 * the paper profit peak reads paper closes only (`lib/risk/profitPeak.ts`).
 */

import { STRATEGY_VERSION } from "@/lib/backtest/strategyVersion";
import type { createClient } from "@/lib/supabase/server";
import { ledgerWriter } from "@/lib/supabase/ledger";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const TRADE_LOG_ATTEMPTS = 3;
const UNIQUE_VIOLATION = "23505";

export async function insertTradeLog(
  supabase: Supabase,
  mode: "paper" | "live",
  row: Record<string, unknown>,
): Promise<{ error: { code?: string; message: string } | null; duplicate: boolean }> {
  const stamped = { strategy_version: STRATEGY_VERSION, ...row, mode };
  let last: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < TRADE_LOG_ATTEMPTS; attempt++) {
    const { error } = await ledgerWriter(supabase).from("trade_logs").insert(stamped);
    if (!error) return { error: null, duplicate: false };
    if (error.code === UNIQUE_VIOLATION) return { error: null, duplicate: true };
    last = error;
  }
  return { error: last, duplicate: false };
}
