import { afterEach, describe, expect, it, vi } from "vitest";
import { getNetDeposits, placeExitOrder, placeOrder, qtyString } from "@/lib/brokers/alpaca";

const creds = { key: "k", secret: "s", mode: "live" as const };

function stubFetch(responses: unknown[]) {
  const calls: { url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const next = responses.shift();
      return { ok: true, status: 200, json: async () => next, text: async () => "" };
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("qtyString", () => {
  it("writes whole numbers as they are and fractions in plain decimals", () => {
    expect(qtyString(10)).toBe("10");
    expect(qtyString(0.003333)).toBe("0.003333");
    expect(qtyString(1e-7)).toBe("0.0000001");
  });
});

describe("crypto orders", () => {
  it("sends a good-till-cancelled limit and a stop-limit exit", async () => {
    const calls = stubFetch([{ id: "o1" }, { id: "s1" }]);
    await placeOrder(creds, { symbol: "ETH/USD", side: "buy", qty: 0.003333, type: "limit", limitPrice: 3000.3, timeInForce: "gtc" });
    await placeExitOrder(creds, { symbol: "ETH/USD", side: "sell", qty: 0.003325, stopLoss: 2950, stopLimit: 2891 });
    expect(calls[0].body).toMatchObject({ qty: "0.003333", time_in_force: "gtc", type: "limit", limit_price: "3000.3" });
    expect(calls[1].body).toMatchObject({ qty: "0.003325", type: "stop_limit", stop_price: "2950", limit_price: "2891", time_in_force: "gtc" });
  });

  it("keeps a stock order a day order with a plain stop", async () => {
    const calls = stubFetch([{ id: "o1" }, { id: "s1" }]);
    await placeOrder(creds, { symbol: "AAA", side: "buy", qty: 2, type: "market" });
    await placeExitOrder(creds, { symbol: "AAA", side: "sell", qty: 2, stopLoss: 9.5 });
    expect(calls[0].body).toMatchObject({ qty: "2", time_in_force: "day" });
    expect(calls[1].body).toMatchObject({ type: "stop", stop_price: "9.5" });
    expect((calls[1].body as Record<string, unknown>).limit_price).toBeUndefined();
  });
});

describe("getNetDeposits", () => {
  it("adds deposits, takes away withdrawals and keeps a journal's sign", async () => {
    stubFetch([
      [
        { id: "a1", activity_type: "CSD", net_amount: "30" },
        { id: "a2", activity_type: "CSD", net_amount: "20" },
        { id: "a3", activity_type: "CSW", net_amount: "-5" },
        { id: "a4", activity_type: "JNLC", net_amount: "-1" },
      ],
    ]);
    expect(await getNetDeposits(creds)).toBe(44);
  });

  it("throws on an amount it can't read, rather than guessing", async () => {
    stubFetch([[{ id: "a1", activity_type: "CSD", net_amount: "" }]]);
    await expect(getNetDeposits(creds)).rejects.toThrow(/no readable amount/);
  });
});
