import { describe, expect, it } from "vitest";
import { checkBracket } from "@/lib/trade/bracket";

describe("checkBracket", () => {
  describe("long entries", () => {
    it("accepts a stop below and a target above the entry", () => {
      expect(checkBracket({ side: "buy", basePrice: 487.52, stopLoss: 484.76, takeProfit: 493.04 }))
        .toEqual({ ok: true });
    });

    /**
     * The MSFT rejection from the field: protocol levels were computed against
     * the advised entry of $487.52, but the order routed at market ($483.51),
     * putting the stop above the fill. Alpaca answered
     * `stop_loss.stop_price must be <= base_price - 0.01`.
     */
    it("rejects a stop above the market entry", () => {
      const check = checkBracket({
        side: "buy",
        basePrice: 483.505,
        stopLoss: 484.76,
        takeProfit: 493.04,
      });
      expect(check.ok).toBe(false);
      expect(check.problem).toBe("stop_wrong_side");
      expect(check.reason).toContain("$484.76");
      expect(check.reason).toContain("$483.51");
    });

    it("rejects a stop exactly at the entry — the broker needs a cent of room", () => {
      expect(checkBracket({ side: "buy", basePrice: 100, stopLoss: 100, takeProfit: 110 }).ok).toBe(false);
    });

    it("accepts a stop exactly one cent below the entry", () => {
      expect(checkBracket({ side: "buy", basePrice: 100, stopLoss: 99.99, takeProfit: 110 }).ok).toBe(true);
    });

    it("rejects a target at or below the entry", () => {
      const check = checkBracket({ side: "buy", basePrice: 100, stopLoss: 95, takeProfit: 100 });
      expect(check.ok).toBe(false);
      expect(check.problem).toBe("target_wrong_side");
    });
  });

  describe("short entries", () => {
    it("accepts a stop above and a target below the entry", () => {
      expect(checkBracket({ side: "sell", basePrice: 0.11, stopLoss: 0.13, takeProfit: 0.07 }))
        .toEqual({ ok: true });
    });

    it("rejects a stop below the entry", () => {
      const check = checkBracket({ side: "sell", basePrice: 100, stopLoss: 95, takeProfit: 90 });
      expect(check.ok).toBe(false);
      expect(check.problem).toBe("stop_wrong_side");
    });

    it("rejects a target above the entry", () => {
      const check = checkBracket({ side: "sell", basePrice: 100, stopLoss: 105, takeProfit: 101 });
      expect(check.ok).toBe(false);
      expect(check.problem).toBe("target_wrong_side");
    });
  });

  describe("missing reference price", () => {
    it.each([0, -1, NaN, Infinity])("reports %s as unusable rather than passing it through", (basePrice) => {
      const check = checkBracket({ side: "buy", basePrice, stopLoss: 95, takeProfit: 110 });
      expect(check.ok).toBe(false);
      expect(check.problem).toBe("no_base_price");
    });
  });
});
