import { describe, expect, it } from "vitest";
import { pricePoint } from "@/lib/gann/pointScale";
import {
  MAX_OPEN_OTHER_MARKETS,
  MAX_OPEN_STOCKS,
  maxOpenMarketsFor,
  MAX_RISK_FRACTION,
  capitalPerShare,
  capitalRuleRefusal,
  maxRiskForTrade,
  profitRiskCeiling,
  maxSharesForCapital,
  maxSharesForRisk,
  riskTenthRefusal,
} from "@/lib/risk/gannCapital";

// Q4 and Q6 (owner, 2026-10-16, "Switch all nine"): A-RISK-01, $3,000 of
// capital per 100 shares (W006 p.46, Rule 1), price-scaled by the point; and
// A-RISK-08, specialise in two or three markets (W022 pp.203-204).

describe("capital per share", () => {
  it("is $30 a share at $42.50, where the point is $1 ($3,000 per 100 shares)", () => {
    expect(pricePoint(42.5)).toBeCloseTo(1, 9);
    expect(capitalPerShare(42.5)).toBeCloseTo(30, 9);
    expect(maxSharesForCapital(3000, 42.5)).toBe(100);
  });
  it("scales with the point at other prices", () => {
    expect(capitalPerShare(170)).toBeCloseTo(30 * pricePoint(170), 9);
    expect(maxSharesForCapital(10_000, 170)).toBe(Math.floor(10_000 / (30 * pricePoint(170))));
  });
});

describe("capitalRuleRefusal", () => {
  const base = { capital: 3000, symbol: "AAPL", price: 42.5, qty: 100, open: [] as { symbol: string; qty: number; price: number }[] };
  it("allows 100 shares on $3,000 and refuses 101", () => {
    expect(capitalRuleRefusal(base)).toBeNull();
    expect(capitalRuleRefusal({ ...base, qty: 101 })?.code).toBe("capital_per_share");
  });
  it("counts the shares already open against the same capital", () => {
    expect(capitalRuleRefusal({ ...base, capital: 6000, open: [{ symbol: "MSFT", qty: 100, price: 42.5 }] })).toBeNull();
    expect(capitalRuleRefusal({ ...base, capital: 6000, qty: 101, open: [{ symbol: "MSFT", qty: 100, price: 42.5 }] })?.code).toBe("capital_per_share");
  });
  // Never-failing rule 8 (WSSS Ch. II rule 8; 45 Years pp.15-16): spread the
  // risk over 4 or 5 stocks. Owner, 2026-10-16: 5 for stocks. Commodities and
  // crypto keep Tunnel pp.203-204's two or three markets.
  it("refuses a sixth stock while five are open, and allows adding to one held", () => {
    const five = ["MSFT", "NVDA", "XOM", "JPM", "KO"].map((symbol) => ({ symbol, qty: 1, price: 42.5 }));
    expect(MAX_OPEN_STOCKS).toBe(5);
    expect(capitalRuleRefusal({ ...base, capital: 1e6, open: five })?.code).toBe("max_open_symbols");
    expect(capitalRuleRefusal({ ...base, capital: 1e6, symbol: "XOM", open: five })).toBeNull();
    expect(capitalRuleRefusal({ ...base, capital: 1e6, open: five.slice(0, 4) })).toBeNull();
  });
  it("holds crypto to three pairs, counted apart from the stocks", () => {
    const pairs = ["BTC/USD", "ETH/USD", "SOL/USD"].map((symbol) => ({ symbol, qty: 1, price: 42.5 }));
    expect(MAX_OPEN_OTHER_MARKETS).toBe(3);
    expect(maxOpenMarketsFor("DOGE/USD")).toBe(3);
    expect(maxOpenMarketsFor("AAPL")).toBe(5);
    expect(capitalRuleRefusal({ ...base, capital: 1e6, symbol: "DOGE/USD", open: pairs })?.code).toBe("max_open_symbols");
    expect(capitalRuleRefusal({ ...base, capital: 1e6, symbol: "ETHUSD", open: pairs })).toBeNull();
    // Three pairs open do not use up the stock slots.
    expect(capitalRuleRefusal({ ...base, capital: 1e6, open: pairs })).toBeNull();
    // Mixed books: each class is counted on its own (review, Rule 8).
    const stocks = ["MSFT", "NVDA"].map((symbol) => ({ symbol, qty: 1, price: 42.5 }));
    expect(capitalRuleRefusal({ ...base, capital: 1e6, open: [...pairs, ...stocks] })).toBeNull();
    const threeStocks = ["MSFT", "NVDA", "XOM"].map((symbol) => ({ symbol, qty: 1, price: 42.5 }));
    expect(capitalRuleRefusal({ ...base, capital: 1e6, symbol: "DOGE/USD", open: threeStocks })).toBeNull();
    const fiveStocks = [...threeStocks, ...["JPM", "KO"].map((symbol) => ({ symbol, qty: 1, price: 42.5 }))];
    expect(capitalRuleRefusal({ ...base, capital: 1e6, symbol: "DOGE/USD", open: fiveStocks })).toBeNull();
  });
  // Commodity and currency funds stand in for Gann's commodities (Tunnel
  // pp.203-204), so they share crypto's three, not the five stocks (#454).
  it("counts commodity and currency funds with crypto among the three other markets", () => {
    expect(maxOpenMarketsFor("GLD")).toBe(3);
    expect(maxOpenMarketsFor("FXE")).toBe(3);
    const mixed = ["BTC/USD", "GLD", "UUP"].map((symbol) => ({ symbol, qty: 1, price: 42.5 }));
    expect(capitalRuleRefusal({ ...base, capital: 1e6, symbol: "USO", open: mixed })?.code).toBe("max_open_symbols");
    expect(capitalRuleRefusal({ ...base, capital: 1e6, symbol: "ETH/USD", open: mixed })?.code).toBe("max_open_symbols");
    expect(capitalRuleRefusal({ ...base, capital: 1e6, symbol: "GLD", open: mixed })).toBeNull();
    // Three funds open leave every stock slot free.
    expect(capitalRuleRefusal({ ...base, capital: 1e6, open: mixed })).toBeNull();
    const fiveStocks = ["MSFT", "NVDA", "XOM", "JPM", "KO"].map((symbol) => ({ symbol, qty: 1, price: 42.5 }));
    expect(capitalRuleRefusal({ ...base, capital: 1e6, symbol: "GLD", open: fiveStocks })).toBeNull();
  });
});

// Never-failing rule 1 (W006 p.46; Commodities pp.29-30 and rule 1, pp.43-45):
// divide the capital into ten parts and never risk more than one on a trade.
describe("the one-tenth risk ceiling", () => {
  it("is a tenth of the capital", () => {
    expect(MAX_RISK_FRACTION).toBe(0.1);
    expect(maxRiskForTrade(25_000)).toBeCloseTo(2_500, 9);
    expect(maxRiskForTrade(-5)).toBe(0);
  });
  it("sizes the shares a tenth carries at the stop", () => {
    expect(maxSharesForRisk(10_000, 5)).toBe(200);
    expect(maxSharesForRisk(10_000, 3.3)).toBe(303);
    expect(maxSharesForRisk(10_000, 0)).toBe(0);
    expect(maxSharesForRisk(0, 5)).toBe(0);
  });
  it("agrees with the 30-point capital rule at a 3-point stop, and binds when the stop is wider", () => {
    const price = 42.5;
    const three = 3 * pricePoint(price);
    expect(maxSharesForRisk(30_000, three)).toBe(maxSharesForCapital(30_000, price));
    const five = 5 * pricePoint(price);
    expect(maxSharesForRisk(30_000, five)).toBeLessThan(maxSharesForCapital(30_000, price));
  });
  it("allows a trade risking exactly a tenth and refuses one risking more", () => {
    const base = { capital: 10_000, symbol: "AAPL", entry: 100, stop: 95, qty: 200 };
    expect(riskTenthRefusal(base)).toBeNull();
    const over = riskTenthRefusal({ ...base, qty: 201 });
    expect(over?.code).toBe("risk_one_tenth");
    expect(over?.error).toMatch(/200/);
    expect(over?.error).not.toMatch(/gann/i);
  });
  it("reads a short's stop above its entry the same way", () => {
    expect(riskTenthRefusal({ capital: 10_000, symbol: "AAPL", entry: 95, stop: 100, qty: 200 })).toBeNull();
    expect(riskTenthRefusal({ capital: 10_000, symbol: "AAPL", entry: 95, stop: 100, qty: 201 })?.code).toBe("risk_one_tenth");
  });
  it("refuses any risk when there is no capital", () => {
    expect(riskTenthRefusal({ capital: 0, symbol: "AAPL", entry: 100, stop: 95, qty: 1 })?.code).toBe("risk_one_tenth");
  });
});

describe("a tenth of the profits after large profits (A-RISK-07, W022 pp.198-199)", () => {
  it("applies once profits equal the starting capital", () => {
    expect(profitRiskCeiling(150_000, 100_000)).toBeNull();
    expect(profitRiskCeiling(200_000, 100_000)).toBe(10_000);
    expect(profitRiskCeiling(250_000, 100_000)).toBe(15_000);
  });
  it("shrinks after a loss to a tenth of the profits that remain", () => {
    // 150,000 of profit, then a 20,000 loss: the next trade risks 13,000.
    expect(profitRiskCeiling(230_000, 100_000)).toBe(13_000);
  });
  it("keeps applying after a loss takes profits back under the starting capital", () => {
    // 100,000 grew to 200,000, then a 10,000 loss: a tenth of the 90,000 left.
    expect(profitRiskCeiling(190_000, 100_000, 100_000)).toBe(9_000);
    expect(profitRiskCeiling(150_000, 100_000, 100_000)).toBe(5_000);
    // Never reached: the tenth of the unit governs alone.
    expect(profitRiskCeiling(190_000, 100_000, 99_000)).toBeNull();
    // Every profit gone: back to the tenth of the unit.
    expect(profitRiskCeiling(100_000, 100_000, 100_000)).toBeNull();
  });
  it("does not apply with no starting capital on record", () => {
    expect(profitRiskCeiling(500_000, 0)).toBeNull();
  });
  it("lowers the most a trade may risk only when it is below a tenth of the unit", () => {
    expect(maxRiskForTrade(200_000, 15_000)).toBe(15_000);
    expect(maxRiskForTrade(200_000, 30_000)).toBe(20_000);
    expect(maxRiskForTrade(200_000, null)).toBe(20_000);
    expect(maxSharesForRisk(200_000, 10, 15_000)).toBe(1_500);
  });
  it("refuses a trade risking more than a tenth of the profits", () => {
    const base = { capital: 200_000, symbol: "AAPL", entry: 100, stop: 90, qty: 1_500, profitCeiling: 15_000 };
    expect(riskTenthRefusal(base)).toBeNull();
    const over = riskTenthRefusal({ ...base, qty: 1_501 });
    expect(over?.code).toBe("risk_tenth_of_profits");
    expect(over?.error).toMatch(/1500/);
    expect(over?.error).not.toMatch(/gann/i);
  });
});
