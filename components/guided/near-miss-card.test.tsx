/**
 * The near-miss card must not look, or behave, like something you can buy.
 *
 * The visual half of the guard in lib/guided/near-miss.ts. That module makes a
 * near miss impossible to *size*; this one makes it impossible to *press*.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NearMissCard } from "./near-miss-card";
import type { NearMiss } from "@/lib/guided/near-miss";

const nearMiss: NearMiss = {
  symbol: "NVDA",
  currentPrice: 178.42,
  score: 6,
  max: 9,
  verdict: "Watch",
  missing: [
    "Scores 6 out of 9. Guided only offers setups scoring 7 or better, so this one is worth watching rather than buying.",
    "The trade plan has no entry, stop or target priced yet, so there is nothing to place.",
  ],
  tickerHref: "/ticker/NVDA",
};

describe("the near-miss card", () => {
  it("offers no way to place an order", () => {
    // The assertion that matters most. A button here would route a Watch-tier
    // setup into the buy flow, which is the single thing Guided's Execute gate
    // exists to prevent.
    render(<NearMissCard nearMiss={nearMiss} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers exactly one way onward, and it is the full scan", () => {
    render(<NearMissCard nearMiss={nearMiss} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/ticker/NVDA");
  });

  it("says plainly that this is not a suggestion to trade", () => {
    render(<NearMissCard nearMiss={nearMiss} />);
    expect(screen.getByText(/not a suggestion to trade/i)).toBeInTheDocument();
  });

  it("shows the score openly rather than hiding it", () => {
    // A real guided card hides the score behind "Why this one?" because the
    // user has a decision to make and the number is noise. Here there is no
    // decision, so the number is the content.
    render(<NearMissCard nearMiss={nearMiss} />);
    expect(screen.getByText(/Watch · 6\/9/)).toBeInTheDocument();
  });

  it("lists every gate the candidate failed", () => {
    render(<NearMissCard nearMiss={nearMiss} />);
    for (const reason of nearMiss.missing) {
      expect(screen.getByText(reason)).toBeInTheDocument();
    }
  });

  it("does not tell the user the market is empty", () => {
    // The old empty state said "nothing worth trading" and stopped. This card
    // replaces it precisely because that reads as a broken app.
    render(<NearMissCard nearMiss={nearMiss} />);
    expect(screen.getByText(/closest the scan came/i)).toBeInTheDocument();
  });
});
