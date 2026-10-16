import { describe, expect, it } from "vitest";
import { buildScanMarketGates } from "../scanGates";
import { allSafetyGatesPass, evaluateDisqualifiers } from "../disqualifiers";

describe("buildScanMarketGates", () => {
  it("blocks on unknown binary-event status rather than assuming it's clear", () => {
    const gates = buildScanMarketGates({
      liquidity: null,
      liquidityOk: true,
      binaryEventInHoldPeriod: null,
      dataLagged: false,
    });
    const disqualifiers = evaluateDisqualifiers(gates);
    expect(disqualifiers.some((d) => d.key === "binaryEvent")).toBe(true);
  });

  it("fails the liquidity/universe gates when the liquidity floor isn't met", () => {
    const gates = buildScanMarketGates({
      liquidity: null,
      liquidityOk: false,
      binaryEventInHoldPeriod: false,
      dataLagged: false,
    });
    expect(gates.eligibleUniverse).toBe(false);
    expect(gates.liquiditySpreadPass).toBe(false);
  });

  it("has no benchmark or sector gate: each stock is read on its own trend", () => {
    const gates = buildScanMarketGates({
      liquidity: null,
      liquidityOk: true,
      binaryEventInHoldPeriod: false,
      dataLagged: false,
    });
    expect(allSafetyGatesPass(gates)).toBe(true);
  });

  it("passes clean when liquidity is fine, no event, and no lag", () => {
    const gates = buildScanMarketGates({
      liquidity: null,
      liquidityOk: true,
      binaryEventInHoldPeriod: false,
      dataLagged: false,
    });
    expect(evaluateDisqualifiers(gates)).toHaveLength(0);
  });
});
