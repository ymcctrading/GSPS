import { describe, expect, it } from "vitest";
import { splitAdjustedSharesAsOf, type SharesPoint } from "@/lib/data/instrumentReference";

const p = (asOf: string, filed: string, shares: number): SharesPoint => ({ asOf, filed, shares });

describe("share count as of a session, on the bars' split basis", () => {
  // A 10-for-1 split between the May and August filings; the August 10-Q
  // also restates the prior year-end on the new basis.
  const history = [
    p("2024-01-31", "2024-02-20", 2_460_000_000),
    p("2024-04-30", "2024-05-25", 2_450_000_000),
    p("2023-12-31", "2024-08-25", 24_700_000_000), // restated comparative
    p("2024-07-31", "2024-08-25", 24_400_000_000),
    p("2024-10-31", "2024-11-20", 24_300_000_000),
  ];

  it("reads only filings made before the session", () => {
    expect(splitAdjustedSharesAsOf(history, "2024-02-20")).toBeNull();
    expect(splitAdjustedSharesAsOf(history, "2024-12-01")).toBe(24_300_000_000);
  });

  it("restates a pre-split count to today's basis", () => {
    expect(splitAdjustedSharesAsOf(history, "2024-06-01")).toBe(24_500_000_000);
    expect(splitAdjustedSharesAsOf(history, "2024-03-01")).toBe(24_600_000_000);
  });

  it("leaves ordinary buybacks alone", () => {
    const buybacks = [p("2024-01-31", "2024-02-20", 1_000_000), p("2024-04-30", "2024-05-25", 960_000)];
    expect(splitAdjustedSharesAsOf(buybacks, "2024-03-01")).toBe(1_000_000);
  });

  it("handles a reverse split", () => {
    const reverse = [p("2024-01-31", "2024-02-20", 800_000_000), p("2024-04-30", "2024-05-25", 100_000_000)];
    expect(splitAdjustedSharesAsOf(reverse, "2024-03-01")).toBe(100_000_000);
  });
});
