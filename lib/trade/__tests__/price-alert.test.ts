import { describe, expect, it } from "vitest";
import { isPriceAlertFired } from "@/lib/trade/price-alert";

describe("isPriceAlertFired", () => {
  it("fires an 'above' alert once price reaches or exceeds the target", () => {
    expect(isPriceAlertFired("above", 100, 99.99)).toBe(false);
    expect(isPriceAlertFired("above", 100, 100)).toBe(true);
    expect(isPriceAlertFired("above", 100, 105)).toBe(true);
  });

  it("fires a 'below' alert once price reaches or drops below the target", () => {
    expect(isPriceAlertFired("below", 100, 100.01)).toBe(false);
    expect(isPriceAlertFired("below", 100, 100)).toBe(true);
    expect(isPriceAlertFired("below", 100, 95)).toBe(true);
  });
});
