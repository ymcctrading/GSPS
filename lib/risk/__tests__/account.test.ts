import { describe, expect, it } from "vitest";
import { netLiquidationValue, netExternalFlow, investmentPnl, ESTIMATE_LABEL } from "@/lib/risk/account";

describe("netLiquidationValue", () => {
  it("is cash + holdings - liabilities", () => {
    const v = netLiquidationValue({
      cash: 100,
      marketValueOfHoldings: 400,
      debitBalancesAndLiabilities: 50,
      verified: true,
    });
    expect(v.netLiquidationValue).toBe(450);
    expect(v.label).toBeNull();
  });

  it("labels an unverified figure as a GSPS estimate", () => {
    const v = netLiquidationValue({
      cash: 100,
      marketValueOfHoldings: 400,
      debitBalancesAndLiabilities: 50,
      verified: false,
    });
    expect(v.label).toBe(ESTIMATE_LABEL);
  });
});

describe("netExternalFlow / investmentPnl", () => {
  it("strips deposits out of a raw equity delta", () => {
    const flows = [{ amount: 100, kind: "deposit" as const }];
    // Equity rose $150, but $100 of that was a deposit — real P&L is $50.
    expect(investmentPnl(450, 600, flows)).toBe(50);
  });

  it("does not let a deposit mask a real drawdown", () => {
    const flows = [{ amount: 200, kind: "deposit" as const }];
    // Equity rose $50 on paper, but a $200 deposit means the account actually
    // lost $150 of investment value.
    expect(investmentPnl(450, 500, flows)).toBe(-150);
  });

  it("nets multiple flows in the same window", () => {
    const flows = [
      { amount: 200, kind: "deposit" as const },
      { amount: -50, kind: "withdrawal" as const },
    ];
    expect(netExternalFlow(flows)).toBe(150);
  });
});
