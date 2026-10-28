import { describe, expect, it } from "vitest";
import { ownMasterToCheck } from "@/lib/trade/place-order";

// The MTP a person priced is checked against TP1 at placement; an automated
// plan's order goes as its plan priced it (owner, 2026-10-28).
describe("ownMasterToCheck", () => {
  const levels = { stopLoss: 48, takeProfit: 54, masterProfit: 53 };
  it("checks the MTP on an order with no plan behind it", () => {
    expect(ownMasterToCheck({ attachLevels: levels })).toBe(53);
  });
  it("leaves an automated plan's MTP alone", () => {
    expect(ownMasterToCheck({ attachLevels: levels, sourcePlanId: "6f1c0d4e-2b8a-4c3e-9f7d-1a2b3c4d5e6f" })).toBeNull();
  });
  it("has nothing to check without an MTP", () => {
    expect(ownMasterToCheck({ attachLevels: { stopLoss: 48, takeProfit: 54 } })).toBeNull();
    expect(ownMasterToCheck({})).toBeNull();
  });
});
