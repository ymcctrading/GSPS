import { describe, expect, it } from "vitest";
import { summarizeLiveAccount } from "@/lib/portfolio/live-account";
import type { AlpacaAccount, AlpacaOrder, AlpacaPosition } from "@/lib/brokers/alpaca";

const account = { equity: "31.50", last_equity: "30.00", cash: "6.50", buying_power: "6.50", currency: "USD", daytrade_count: 1 } as AlpacaAccount;
const position = {
  symbol: "LOW", qty: "2", side: "long", avg_entry_price: "12.40", current_price: "12.50", market_value: "25.00",
  unrealized_pl: "0.20", unrealized_plpc: "0.0081", unrealized_intraday_pl: "0.20", unrealized_intraday_plpc: "0.0081",
} as AlpacaPosition;
const stop = { id: "s1", symbol: "LOW", side: "sell", type: "stop", qty: "2", stop_price: "11.00", status: "new", filled_qty: "0", filled_avg_price: null } as AlpacaOrder;

describe("summarizeLiveAccount", () => {
  it("turns the broker's strings into figures and finds each position's resting stop", () => {
    const s = summarizeLiveAccount(account, [position], [stop]);
    expect(s.account).toEqual({ equity: 31.5, cash: 6.5, buyingPower: 6.5, dayPl: 1.5, dayPlPct: 0.05, dayTradeCount: 1 });
    expect(s.positions[0]).toMatchObject({ symbol: "LOW", side: "long", qty: 2, avgEntryPrice: 12.4, stopPrice: 11, stopPartial: false });
    expect(summarizeLiveAccount(account, [position], [{ ...stop, qty: "1" }]).positions[0].stopPartial).toBe(true);
    expect(s.orders[0]).toMatchObject({ symbol: "LOW", side: "sell", stopPrice: 11, limitPrice: null });
  });

  it("shows an unreadable figure as unknown, never as zero, and flags a position with no stop", () => {
    const s = summarizeLiveAccount({ ...account, equity: "", last_equity: "0" } as AlpacaAccount, [position], []);
    expect(s.account.equity).toBeNull();
    expect(s.account.dayPl).toBeNull();
    expect(s.account.dayPlPct).toBeNull();
    expect(s.positions[0].stopPrice).toBeNull();
  });
});
