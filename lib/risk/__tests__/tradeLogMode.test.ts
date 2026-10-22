/**
 * Review finding R-002: the trader rules read the closes GSPS placed, paper
 * and live, never a journal entry typed by hand, and the live exit's trade log
 * names its account.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/ledger", () => ({ ledgerWriter: (s: unknown) => s }));

import { readUserLossSeries } from "@/lib/risk/lossSeries";
import { readWinningRun } from "@/lib/risk/dynamic-risk";
import { recordPendingExit } from "@/lib/portfolio/trade-log-record";

type Row = Record<string, unknown>;

/** A query stub that applies `eq` and `in` filters to its rows, newest first as given. */
function table(rows: Row[]) {
  const filters: ((r: Row) => boolean)[] = [];
  const q: Record<string, unknown> = {};
  for (const k of ["select", "not", "order", "limit"]) q[k] = () => q;
  q.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), q);
  q.in = (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q);
  q.then = (ok: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }).then(ok);
  return { from: () => q } as unknown as SupabaseClient;
}

const at = "2026-10-21T15:00:00.000Z";
const close = (mode: string, outcome: string, profit = 0) => ({
  user_id: "u1", mode, outcome, profit_loss_dollars: profit, exit_timestamp: at,
});

describe("trade-log mode in the trader rules", () => {
  it("a journal win typed after a series of losses does not end the pause", async () => {
    const supabase = table([close("journal", "profit", 500), close("paper", "loss"), close("live", "loss"), close("paper", "loss")]);
    const series = await readUserLossSeries(supabase, "u1", new Date("2026-10-21T16:00:00.000Z"));
    expect(series.consecutiveLosses).toBe(3);
    expect(series.paused).toBe(true);
  });

  it("the winning run counts paper and live wins, never journal ones", async () => {
    const supabase = table([close("journal", "profit", 900), close("paper", "profit", 100), close("live", "profit", 50), close("paper", "loss", -20)]);
    expect(await readWinningRun(supabase, "u1")).toMatchObject({ consecutiveWins: 2, streakProfitUsd: 150 });
  });

  it("the broker exit manager's trade log names the live account", async () => {
    const inserted: Row[] = [];
    const q: Record<string, unknown> = {};
    q.insert = (row: Row) => (inserted.push(row), q);
    q.select = () => q;
    q.maybeSingle = () => Promise.resolve({ data: { id: "t1" }, error: null });
    const supabase = { from: () => q } as never;
    await recordPendingExit(supabase, "u1", {
      symbol: "AAPL", direction: "buy", quantity: 1, entryPrice: 100, signalCalled: "Protocol levels",
    } as never);
    expect(inserted[0]).toMatchObject({ mode: "live" });
  });
});
