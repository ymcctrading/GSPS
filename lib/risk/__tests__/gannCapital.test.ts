import { describe, expect, it } from "vitest";
import { gannPoint } from "@/lib/gann/pointScale";
import {
  MAX_OPEN_SYMBOLS,
  capitalPerShare,
  capitalRuleRefusal,
  maxSharesForCapital,
} from "@/lib/risk/gannCapital";

// Q4 and Q6 (owner, 2026-10-16, "Switch all nine"): A-RISK-01, $3,000 of
// capital per 100 shares (W006 p.46, Rule 1), price-scaled by the point; and
// A-RISK-08, specialise in two or three markets (W022 pp.203-204).

describe("capital per share", () => {
  it("is $30 a share at $42.50, where the point is $1 ($3,000 per 100 shares)", () => {
    expect(gannPoint(42.5)).toBeCloseTo(1, 9);
    expect(capitalPerShare(42.5)).toBeCloseTo(30, 9);
    expect(maxSharesForCapital(3000, 42.5)).toBe(100);
  });
  it("scales with the point at other prices", () => {
    expect(capitalPerShare(170)).toBeCloseTo(30 * gannPoint(170), 9);
    expect(maxSharesForCapital(10_000, 170)).toBe(Math.floor(10_000 / (30 * gannPoint(170))));
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
  it("refuses a fourth market while three are open, and allows adding to one held", () => {
    const three = ["MSFT", "NVDA", "XOM"].map((symbol) => ({ symbol, qty: 1, price: 42.5 }));
    expect(MAX_OPEN_SYMBOLS).toBe(3);
    expect(capitalRuleRefusal({ ...base, capital: 1e6, open: three })?.code).toBe("max_open_symbols");
    expect(capitalRuleRefusal({ ...base, capital: 1e6, symbol: "XOM", open: three })).toBeNull();
    expect(capitalRuleRefusal({ ...base, capital: 1e6, open: three.slice(0, 2) })).toBeNull();
  });
});
