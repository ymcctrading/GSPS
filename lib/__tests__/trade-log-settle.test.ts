import { describe, expect, it } from "vitest";
import {
  settleTradeLog,
  type ExitFill,
  type PendingTradeLog,
} from "@/lib/portfolio/trade-log-settle";

const log = (over: Partial<PendingTradeLog> = {}): PendingTradeLog => ({
  id: "log-1",
  symbol: "MSFT",
  direction: "buy",
  quantity: 10,
  entry_price: 100,
  entry_timestamp: "2026-08-01T14:00:00Z",
  created_at: "2026-08-01T14:00:00Z",
  ...over,
});

const fill = (over: Partial<ExitFill> = {}): ExitFill => ({
  orderId: "o-1",
  symbol: "MSFT",
  side: "sell",
  qty: 10,
  price: 110,
  at: "2026-08-01T18:00:00Z",
  ...over,
});

describe("settleTradeLog", () => {
  it("settles a fully-closed long from its exit fill", () => {
    const result = settleTradeLog(log(), [fill()]);
    expect(result.settled).not.toBeNull();
    expect(result.settled?.exit_price).toBeCloseTo(110);
    expect(result.settled?.profit_loss_dollars).toBeCloseTo(100);
    expect(result.settled?.profit_loss_percent).toBeCloseTo(10);
    expect(result.settled?.outcome).toBe("profit");
  });

  it("reports a loss as a loss", () => {
    const result = settleTradeLog(log(), [fill({ price: 92 })]);
    expect(result.settled?.outcome).toBe("loss");
    expect(result.settled?.profit_loss_dollars).toBeCloseTo(-80);
  });

  it("averages a staged exit by quantity, and stamps the last fill's time", () => {
    const result = settleTradeLog(log(), [
      fill({ qty: 6, price: 120, at: "2026-08-01T15:00:00Z" }),
      fill({ qty: 2, price: 140, at: "2026-08-01T16:00:00Z" }),
      fill({ qty: 2, price: 130, at: "2026-08-01T17:00:00Z" }),
    ]);
    // (6·120 + 2·140 + 2·130) / 10
    expect(result.settled?.exit_price).toBeCloseTo(126);
    expect(result.settled?.exit_timestamp).toBe("2026-08-01T17:00:00Z");
  });

  it("leaves a partially-exited trade pending rather than reporting it closed", () => {
    const result = settleTradeLog(log(), [fill({ qty: 6, price: 120 })]);
    expect(result.settled).toBeNull();
    expect(result).toMatchObject({ reason: "partial_exit", exitedQty: 6 });
  });

  it("leaves a trade with no exit fills pending", () => {
    const result = settleTradeLog(log(), []);
    expect(result.settled).toBeNull();
    expect(result).toMatchObject({ reason: "no_exit_fills" });
  });

  it("ignores fills on the entry side and on other symbols", () => {
    const result = settleTradeLog(log(), [
      fill({ side: "buy", qty: 10 }),
      fill({ symbol: "NVDA", qty: 10 }),
    ]);
    expect(result.settled).toBeNull();
  });

  it("ignores fills from before the trade started", () => {
    const result = settleTradeLog(log(), [fill({ at: "2026-07-30T18:00:00Z" })]);
    expect(result.settled).toBeNull();
  });

  it("names the protocol level that produced the exit", () => {
    const tp = settleTradeLog(log(), [fill({ orderId: "tp" })], [
      { id: "tp", type: "limit", order_class: "bracket" },
    ]);
    expect(tp.settled?.exit_condition).toBe("tp1");
    expect(tp.settled?.signal_adherence).toBe("yes");

    const stop = settleTradeLog(log(), [fill({ orderId: "sl" })], [
      { id: "sl", type: "stop", order_class: "bracket" },
    ]);
    expect(stop.settled?.exit_condition).toBe("stop_loss");
  });

  it("records a hand-placed exit as manual, and claims nothing about adherence", () => {
    const result = settleTradeLog(log(), [fill({ orderId: "mkt" })], [
      { id: "mkt", type: "market" },
    ]);
    expect(result.settled?.exit_condition).toBe("manual");
    expect(result.settled?.signal_adherence).toBeNull();
  });

  it("falls back to manual when the closing order can't be identified", () => {
    const result = settleTradeLog(log(), [fill({ orderId: null })]);
    expect(result.settled?.exit_condition).toBe("manual");
  });

  it("settles a short from its covering buys", () => {
    const result = settleTradeLog(log({ direction: "sell" }), [fill({ side: "buy", price: 90 })]);
    expect(result.settled?.profit_loss_dollars).toBeCloseTo(100);
    expect(result.settled?.outcome).toBe("profit");
  });

  it("takes only the quantity this row covers from an oversized fill", () => {
    const result = settleTradeLog(log({ quantity: 4 }), [fill({ qty: 10, price: 110 })]);
    expect(result.settled?.exit_price).toBeCloseTo(110);
    expect(result.settled?.profit_loss_dollars).toBeCloseTo(40);
  });

  it("consumes the earliest fills first, so a later trade's exits aren't borrowed", () => {
    const result = settleTradeLog(log({ quantity: 5 }), [
      fill({ qty: 5, price: 110, at: "2026-08-01T15:00:00Z" }),
      fill({ qty: 5, price: 200, at: "2026-08-05T15:00:00Z" }),
    ]);
    expect(result.settled?.exit_price).toBeCloseTo(110);
  });
});
