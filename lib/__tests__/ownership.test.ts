/**
 * Ownership containment for the shared paper account.
 *
 * These tests describe the rule that stops one user's request from reaching
 * another user's shares. The scenarios are written from the failure they
 * prevent, because that is what makes a regression here recognisable: before
 * this layer existed, `POST /api/positions/close {"symbol":"AAPL"}` liquidated
 * every AAPL share in the account, whoever had bought them.
 */

import { describe, expect, it } from "vitest";
import { authorizeClose, mergeOwnership, ownedQty } from "@/lib/portfolio/ownership";
import {
  scopePositionsToOwner,
  summarizeOwnedPositions,
} from "@/app/api/portfolio/route";
import type { AlpacaPosition } from "@/lib/brokers/alpaca";

const ledgerOf = (bySymbol: Map<string, number>) => ({ bySymbol, error: null });

/** A broker position with the fields the scoping logic reads. */
function position(over: Partial<AlpacaPosition> & { symbol: string }): AlpacaPosition {
  return {
    qty: "100",
    side: "long",
    avg_entry_price: "10",
    current_price: "12",
    market_value: "1200",
    unrealized_pl: "200",
    unrealized_plpc: "0.2",
    unrealized_intraday_pl: "50",
    unrealized_intraday_plpc: "0.04",
    ...over,
  };
}

describe("mergeOwnership", () => {
  it("sums plain positions and protocol plans without double counting", () => {
    // The two tables are disjoint by construction — a protocol-managed symbol
    // never gets a `positions` row — so a user holding both is holding both.
    const owned = mergeOwnership(
      [{ symbol: "AAPL", qty: 40 }],
      [{ symbol: "MSFT", qty: 25 }],
    );

    expect(owned.get("AAPL")).toBe(40);
    expect(owned.get("MSFT")).toBe(25);
  });

  it("adds multiple rows for the same symbol", () => {
    const owned = mergeOwnership(
      [
        { symbol: "AAPL", qty: 40 },
        { symbol: "aapl", qty: 10 },
      ],
      [{ symbol: "AAPL", qty: 5 }],
    );

    expect(owned.get("AAPL")).toBe(55);
  });

  it("treats a short's negative quantity as exposure, not as a subtraction", () => {
    const owned = mergeOwnership([{ symbol: "TSLA", qty: -30 }], []);
    expect(owned.get("TSLA")).toBe(30);
  });

  it("accepts the string quantities Supabase returns for numerics", () => {
    const owned = mergeOwnership([{ symbol: "NVDA", qty: "12.5" }], []);
    expect(owned.get("NVDA")).toBe(12.5);
  });

  it("skips rows that carry no usable quantity or symbol", () => {
    const owned = mergeOwnership(
      [
        { symbol: "", qty: 10 },
        { symbol: "AMD", qty: Number.NaN },
        { symbol: "INTC", qty: 0 },
      ],
      [],
    );

    expect(owned.size).toBe(0);
  });
});

describe("ownedQty", () => {
  it("is zero for a symbol the ledger has never seen", () => {
    // The account owner's own manual trades land here: held at the broker,
    // absent from every user's ledger, and therefore nobody's to close.
    expect(ownedQty(ledgerOf(new Map()), "AAPL")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(ownedQty(ledgerOf(new Map([["AAPL", 10]])), "aapl")).toBe(10);
  });
});

describe("authorizeClose", () => {
  it("refuses a symbol the caller owns none of", () => {
    // The original vulnerability, in one assertion: another user is long 100
    // AAPL, this caller owns none, and asks to close the position.
    const decision = authorizeClose({ owned: 0, brokerHeld: 100, requested: undefined });

    expect(decision.allowed).toBe(false);
    expect(decision.qty).toBe(0);
    expect(decision.reason).toMatch(/isn't in your account's records/);
  });

  it("closes only the caller's share when the account holds more", () => {
    // Two users hold 40 and 60 of the same symbol. A full close by the first
    // must send 40 — not the 100 the broker reports.
    const decision = authorizeClose({ owned: 40, brokerHeld: 100, requested: undefined });

    expect(decision.allowed).toBe(true);
    expect(decision.qty).toBe(40);
  });

  it("never returns an undefined quantity for a full close", () => {
    // `closePosition` with no quantity liquidates the account's whole position,
    // so "close everything" must still arrive at the broker as a number.
    const decision = authorizeClose({ owned: 25, brokerHeld: 25, requested: undefined });

    expect(decision.allowed).toBe(true);
    expect(typeof decision.qty).toBe("number");
    expect(decision.qty).toBe(25);
  });

  it("allows a partial close within what the caller owns", () => {
    const decision = authorizeClose({ owned: 40, brokerHeld: 100, requested: 15 });

    expect(decision.allowed).toBe(true);
    expect(decision.qty).toBe(15);
  });

  it("refuses — rather than silently clamping — a request larger than the holding", () => {
    // Clamping would look identical to success and leave the user believing
    // they were flat.
    const decision = authorizeClose({ owned: 40, brokerHeld: 100, requested: 90 });

    expect(decision.allowed).toBe(false);
    expect(decision.qty).toBe(0);
    expect(decision.reason).toMatch(/You hold 40/);
  });

  it("refuses when the broker's position couldn't be read", () => {
    const decision = authorizeClose({ owned: 40, brokerHeld: null, requested: undefined });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/couldn't be read/);
  });

  it("refuses when the ledger claims more than the broker holds", () => {
    // A reconciliation gap. Closing on the ledger's word here could reach past
    // what is actually there and into another user's shares.
    const decision = authorizeClose({ owned: 40, brokerHeld: 10, requested: undefined });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/don't agree/);
  });

  it("tolerates float slop between two quantities that are the same", () => {
    const decision = authorizeClose({
      owned: 40,
      brokerHeld: 40 - 1e-9,
      requested: 40 + 1e-9,
    });

    expect(decision.allowed).toBe(true);
  });
});

describe("scopePositionsToOwner", () => {
  it("drops a position the caller owns none of", () => {
    const scoped = scopePositionsToOwner(
      [position({ symbol: "AAPL" })],
      ledgerOf(new Map([["MSFT", 10]])),
    );

    expect(scoped).toEqual([]);
  });

  it("passes a wholly-owned position through untouched", () => {
    const p = position({ symbol: "AAPL", qty: "100" });
    const scoped = scopePositionsToOwner([p], ledgerOf(new Map([["AAPL", 100]])));

    expect(scoped).toEqual([p]);
  });

  it("scales quantity and dollar figures to the caller's share", () => {
    // The account is long 100; this caller owns 40 of them.
    const scoped = scopePositionsToOwner(
      [position({ symbol: "AAPL", qty: "100", market_value: "1200", unrealized_pl: "200", unrealized_intraday_pl: "50" })],
      ledgerOf(new Map([["AAPL", 40]])),
    );

    expect(Number(scoped[0].qty)).toBe(40);
    expect(Number(scoped[0].market_value)).toBeCloseTo(480);
    expect(Number(scoped[0].unrealized_pl)).toBeCloseTo(80);
    expect(Number(scoped[0].unrealized_intraday_pl)).toBeCloseTo(20);
  });

  it("leaves per-share and percentage fields alone when scaling", () => {
    // A ratio doesn't depend on how many shares it is measured over.
    const scoped = scopePositionsToOwner(
      [position({ symbol: "AAPL", qty: "100", current_price: "12", avg_entry_price: "10", unrealized_plpc: "0.2" })],
      ledgerOf(new Map([["AAPL", 40]])),
    );

    expect(scoped[0].current_price).toBe("12");
    expect(scoped[0].avg_entry_price).toBe("10");
    expect(scoped[0].unrealized_plpc).toBe("0.2");
  });

  it("keeps a short position negative when scaling it", () => {
    const scoped = scopePositionsToOwner(
      [position({ symbol: "TSLA", qty: "-100", side: "short" })],
      ledgerOf(new Map([["TSLA", 40]])),
    );

    expect(Number(scoped[0].qty)).toBe(-40);
  });

  it("never reports more than the broker actually holds", () => {
    // The ledger has run ahead — a close recorded locally, not yet at the
    // broker. The caller's position must not inflate to the ledger's figure.
    const scoped = scopePositionsToOwner(
      [position({ symbol: "AAPL", qty: "10" })],
      ledgerOf(new Map([["AAPL", 100]])),
    );

    expect(Math.abs(Number(scoped[0].qty))).toBe(10);
  });
});

describe("summarizeOwnedPositions", () => {
  it("totals only the positions it is given", () => {
    const summary = summarizeOwnedPositions([
      position({ symbol: "AAPL", market_value: "480", unrealized_intraday_pl: "20" }),
      position({ symbol: "MSFT", market_value: "300", unrealized_intraday_pl: "-5" }),
    ]);

    expect(summary.equity).toBeCloseTo(780);
    expect(summary.dayPl).toBeCloseTo(15);
  });

  it("expresses day P/L against the positions' opening value", () => {
    // 480 now, +20 on the day, so the day opened at 460.
    const summary = summarizeOwnedPositions([
      position({ symbol: "AAPL", market_value: "480", unrealized_intraday_pl: "20" }),
    ]);

    expect(summary.dayPlPct).toBeCloseTo((20 / 460) * 100);
  });

  it("reports zeroes rather than NaN for an empty book", () => {
    const summary = summarizeOwnedPositions([]);

    expect(summary).toEqual({ equity: 0, dayPl: 0, dayPlPct: 0 });
  });

  it("does not divide by zero when the opening value nets out", () => {
    const summary = summarizeOwnedPositions([
      position({ symbol: "AAPL", market_value: "20", unrealized_intraday_pl: "20" }),
    ]);

    expect(Number.isFinite(summary.dayPlPct)).toBe(true);
  });
});
