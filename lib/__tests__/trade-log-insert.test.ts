/** Review findings S-08 and P-02: trade-log writes are stamped and retried. */
import { describe, expect, it } from "vitest";
import { STRATEGY_VERSION } from "@/lib/backtest/strategyVersion";
import { insertTradeLog, TRADE_LOG_ATTEMPTS } from "@/lib/portfolio/trade-log-insert";

function stub(errors: ({ code?: string; message: string } | null)[]) {
  const rows: Record<string, unknown>[] = [];
  let i = 0;
  const client = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        rows.push(row);
        return Promise.resolve({ error: errors[i++] ?? null });
      },
    }),
  };
  return { client: client as never, rows };
}

describe("insertTradeLog", () => {
  it("stamps the strategy version", async () => {
    const { client, rows } = stub([null]);
    expect((await insertTradeLog(client, "paper", { symbol: "AAPL" })).error).toBeNull();
    expect(rows[0]).toMatchObject({ symbol: "AAPL", strategy_version: STRATEGY_VERSION });
  });

  it("names the account the trade belongs to (R-002)", async () => {
    const { client, rows } = stub([null, null]);
    await insertTradeLog(client, "live", { symbol: "AAPL" });
    await insertTradeLog(client, "paper", { symbol: "AAPL", mode: "live" });
    expect(rows.map((r) => r.mode)).toEqual(["live", "paper"]);
  });

  it("tries again after a failed insert", async () => {
    const { client, rows } = stub([{ message: "timeout" }, null]);
    expect((await insertTradeLog(client, "paper", { symbol: "AAPL" })).error).toBeNull();
    expect(rows).toHaveLength(2);
  });

  it("returns the error after the last attempt", async () => {
    const fail = { message: "down" };
    const { client, rows } = stub(Array(TRADE_LOG_ATTEMPTS).fill(fail));
    expect((await insertTradeLog(client, "paper", { symbol: "AAPL" })).error).toEqual(fail);
    expect(rows).toHaveLength(TRADE_LOG_ATTEMPTS);
  });

  it("never retries a row another pass already wrote", async () => {
    const { client, rows } = stub([{ code: "23505", message: "duplicate key" }]);
    expect(await insertTradeLog(client, "paper", { symbol: "AAPL" })).toEqual({ error: null, duplicate: true });
    expect(rows).toHaveLength(1);
  });
});
