/**
 * Review finding S-08: a paper fill moves the cash and the position in one
 * transaction (`execute_paper_fill`, migration 0094), and runs the two older
 * calls only while that function is missing.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/alpaca", () => ({ isCryptoSymbol: () => false, fetchOptionLatestTrade: vi.fn() }));

import { executeFill } from "@/lib/brokers/simulator";

function stub(missing: boolean) {
  const calls: string[] = [];
  const account = { data: { user_id: "u1", cash: 100_000 }, error: null };
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "eq", "limit", "insert", "upsert"]) chain[k] = () => chain;
  chain.maybeSingle = () => Promise.resolve(account);
  chain.single = () => Promise.resolve(account);
  const client = {
    from: () => chain,
    rpc: (fn: string) => {
      calls.push(fn);
      if (fn === "execute_paper_fill" && missing) {
        return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
      }
      return Promise.resolve({ data: fn === "increment_paper_cash" ? 99_000 : { positionId: "pos-1", closed: null }, error: null });
    },
  };
  return { client: client as never, calls };
}

const fill = { symbol: "AAPL", assetClass: "us_equity" as const, side: "buy" as const, qty: 10, price: 100 };

describe("executeFill (S-08)", () => {
  it("moves the cash and the position in one call", async () => {
    const { client, calls } = stub(false);
    const r = await executeFill(client, "u1", fill);
    expect(r.positionId).toBe("pos-1");
    expect(calls).toEqual(["execute_paper_fill"]);
  });

  it("falls back to the two calls until the function exists", async () => {
    const { client, calls } = stub(true);
    const r = await executeFill(client, "u1", fill);
    expect(r.positionId).toBe("pos-1");
    expect(calls).toEqual(["execute_paper_fill", "increment_paper_cash", "execute_position_fill"]);
  });
});
