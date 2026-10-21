import { describe, expect, it } from "vitest";
import { instrumentKindOf, instrumentSpec, futuresContractOf, riskPerContract, instrumentAllowancePct } from "@/lib/instruments/spec";

describe("instrument specification", () => {
  it("names each market from its symbol", () => {
    expect(instrumentKindOf("SPY")).toBe("us_equity");
    expect(instrumentKindOf("BTC/USD")).toBe("crypto");
    expect(instrumentKindOf("EUR/USD")).toBe("forex");
    expect(instrumentKindOf("EUR_USD")).toBe("forex");
    expect(instrumentKindOf("/ES")).toBe("future");
    expect(instrumentKindOf("ZCZ6")).toBe("future");
    expect(instrumentKindOf("6EZ26")).toBe("future");
    expect(instrumentKindOf("SPY261120C00600000")).toBe("option");
  });

  it("keeps a bare ticker that shares a futures root a stock", () => {
    expect(futuresContractOf("GC")).toBeNull();
    expect(instrumentKindOf("ES")).toBe("us_equity");
  });

  it("prices risk per contract, and an option's risk is its premium", () => {
    expect(riskPerContract(instrumentSpec("/ES"), 6000, 5980, undefined)).toBe(1000);
    expect(riskPerContract(instrumentSpec("ZSF7"), 1050, 1047, undefined)).toBe(150);
    expect(riskPerContract(instrumentSpec("SPY261120C00600000"), 600, 590, 4.2)).toBeCloseTo(420, 6);
  });

  it("reads crypto on the calendar day and futures on the exchange session", () => {
    expect(instrumentSpec("ETH/USD").session).toBe("calendar_day");
    expect(instrumentSpec("/CL").session).toBe("exchange_23h");
    expect(instrumentSpec("GBP/USD").session).toBe("fx_24x5");
  });

  it("reads a forex pair's allowance in pips, so it is a sane share of price", () => {
    const pct = instrumentAllowancePct(instrumentSpec("EUR/USD"), 1.08, "EUR/USD");
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(2);
  });
});
