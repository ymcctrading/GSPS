import { describe, expect, it } from "vitest";
import { isInvalidatedByStop, invalidationReason } from "@/lib/trade/invalidate-pending";

describe("isInvalidatedByStop", () => {
  it("a long entry is invalidated once price falls to the stop", () => {
    const order = { side: "buy" as const, limit_price: 100, stop_price: 90 };
    expect(isInvalidatedByStop(order, 91)).toBe(false);
    expect(isInvalidatedByStop(order, 90)).toBe(true);
    expect(isInvalidatedByStop(order, 85)).toBe(true);
  });

  it("a short entry is invalidated once price rises to the stop", () => {
    const order = { side: "sell" as const, limit_price: 100, stop_price: 110 };
    expect(isInvalidatedByStop(order, 109)).toBe(false);
    expect(isInvalidatedByStop(order, 110)).toBe(true);
    expect(isInvalidatedByStop(order, 120)).toBe(true);
  });

  it("no stop means never invalidated", () => {
    const order = { side: "buy" as const, limit_price: 100, stop_price: null };
    expect(isInvalidatedByStop(order, 1)).toBe(false);
  });

  it("takes a bare StopCheck — no limit_price required", () => {
    // A scan setup or an order-ticket draft has a side and a stop before it
    // ever has a resting order to attach a limit_price to (see StopCheck's
    // doc comment) — this is what components/scan/results-table.tsx and
    // components/trade/order-ticket.tsx actually call.
    expect(isInvalidatedByStop({ side: "sell", stop_price: 44.31 }, 47.06)).toBe(true);
    expect(isInvalidatedByStop({ side: "sell", stop_price: 44.31 }, 43.95)).toBe(false);
  });
});

describe("invalidationReason", () => {
  it("mentions both the stop and the entry that was never reached", () => {
    const order = { side: "buy" as const, limit_price: 100, stop_price: 90 };
    const reason = invalidationReason(order, 89);
    expect(reason).toContain("$90.00");
    expect(reason).toContain("$100.00");
  });
});
