/**
 * `trade_logs` had a table, an endpoint and no writer. These pin the record
 * `buildTradeLogRow` builds for a partial close — in particular that an
 * unfilled exit is `pending` rather than a fabricated one, and that a short's
 * outcome is not inverted — and the `isFullClose` split that decides whether
 * this function or `reconcilePositions` (lib/portfolio/reconcile.ts) owns the
 * resulting row. A *full* close no longer goes through `buildTradeLogRow` at
 * all: it stays open in the local ledger until `reconcilePositions` notices
 * it vanished from the broker's book and writes a row with the real fill
 * price, so it never gets stuck on 'pending'.
 */

import { describe, expect, it } from "vitest";
import { buildTradeLogRow, isFullClose, type ClosablePosition } from "@/lib/portfolio/trade-log";

const position = (over: Partial<ClosablePosition> = {}): ClosablePosition => ({
  id: "pos-1",
  symbol: "aapl",
  asset_class: "us_equity",
  qty: 10,
  avg_entry_price: 200,
  opened_at: "2026-08-07T14:00:00.000Z",
  ...over,
});

describe("buildTradeLogRow", () => {
  it("records a winning long", () => {
    const row = buildTradeLogRow({ userId: "u1", position: position(), exitPrice: 210 });

    expect(row.symbol).toBe("AAPL");
    expect(row.direction).toBe("buy");
    expect(row.outcome).toBe("profit");
    expect(row.profit_loss_dollars).toBeCloseTo(100, 10);
    expect(row.profit_loss_percent).toBeCloseTo(5, 10);
    expect(row.exit_condition).toBe("manual");
  });

  it("records a losing long", () => {
    const row = buildTradeLogRow({ userId: "u1", position: position(), exitPrice: 190 });
    expect(row.outcome).toBe("loss");
    expect(row.profit_loss_dollars).toBeCloseTo(-100, 10);
  });

  it("does not invert a short — falling out of a short is a profit", () => {
    const row = buildTradeLogRow({
      userId: "u1",
      position: position({ side: "sell" }),
      exitPrice: 190,
    });

    expect(row.direction).toBe("sell");
    expect(row.outcome).toBe("profit");
    expect(row.profit_loss_dollars).toBeCloseTo(100, 10);
  });

  it("stays pending when the close came back unfilled", () => {
    // Recording a zero exit here would put a fabricated P/L into the audit trail
    // and label a trade that has not actually resolved.
    const row = buildTradeLogRow({ userId: "u1", position: position() });

    expect(row.outcome).toBe("pending");
    expect(row.exit_price).toBeNull();
    expect(row.exit_timestamp).toBeNull();
    expect(row.profit_loss_dollars).toBeNull();
    expect(row.exit_condition).toBe("pending");
  });

  it("logs the quantity actually closed on a partial exit", () => {
    const row = buildTradeLogRow({
      userId: "u1",
      position: position(),
      closedQty: 4,
      exitPrice: 210,
    });

    expect(row.quantity).toBe(4);
    expect(row.profit_loss_dollars).toBeCloseTo(40, 10);
  });

  it("carries the position's own entry time, not the time of the close", () => {
    const row = buildTradeLogRow({ userId: "u1", position: position(), exitPrice: 210 });
    expect(row.entry_timestamp).toBe("2026-08-07T14:00:00.000Z");
  });
});

describe("isFullClose", () => {
  it("treats an omitted quantity as closing everything", () => {
    // The API contract: leaving qty off means close the whole position.
    expect(isFullClose(10)).toBe(true);
    expect(isFullClose(10, undefined)).toBe(true);
  });

  it("is full when the requested quantity covers the whole position", () => {
    expect(isFullClose(10, 10)).toBe(true);
  });

  it("is full even when the requested quantity overshoots what's held", () => {
    // The broker will only ever close what exists; asking for more is still
    // a request to close everything, not an error condition this decides.
    expect(isFullClose(10, 15)).toBe(true);
  });

  it("is partial when the requested quantity is less than the position", () => {
    expect(isFullClose(10, 4)).toBe(false);
  });

  it("is full at the exact boundary", () => {
    expect(isFullClose(10, 9.999999)).toBe(false);
    expect(isFullClose(10, 10.000001)).toBe(true);
  });
});
