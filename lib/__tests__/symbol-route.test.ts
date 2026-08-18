/**
 * `/ticker/${symbol}` on `BTC/USD` produced a two-segment path against a
 * one-segment route, so every link to a crypto pair 404'd. The fix is a
 * catch-all route plus `tickerHref`; these pin the round trip between them,
 * which nothing else asserts — `tickerHref` is tested here against the same
 * rejoin the page performs, so a change to either side that breaks the pair
 * fails a test rather than a page.
 */

import { describe, expect, it } from "vitest";
import { tickerHref } from "@/lib/routes";

/**
 * What `app/(app)/ticker/[...symbol]/page.tsx` does with the route parameter:
 * decode each segment and rejoin them on the separator. Kept in step with that
 * file by hand — it is four lines and a server component, so importing it here
 * would drag React rendering into a string test for no gain.
 */
function symbolFromSegments(segments: string[]): string {
  return segments.map((s) => decodeURIComponent(s)).join("/").toUpperCase();
}

/** The path a browser would send back, split the way the router splits it. */
function segmentsOf(href: string): string[] {
  return href.replace("/ticker/", "").split("/");
}

describe("tickerHref", () => {
  it("keeps a crypto pair's separator as a real path separator", () => {
    expect(tickerHref("BTC/USD")).toBe("/ticker/BTC/USD");
  });

  it("leaves an ordinary ticker alone", () => {
    expect(tickerHref("AAPL")).toBe("/ticker/AAPL");
  });

  it("encodes within a segment without encoding the separator itself", () => {
    // %2F inside a segment is normalised back to a slash before the route
    // matches, so the separator has to stay a literal slash and everything
    // else has to be escaped.
    expect(tickerHref("BRK B/USD")).toBe("/ticker/BRK%20B/USD");
  });
});

describe("round trip through the catch-all route", () => {
  it("returns every symbol the app links to unchanged", () => {
    for (const symbol of ["AAPL", "BTC/USD", "ETH/USD", "SOL/USD", "BRK.B"]) {
      expect(symbolFromSegments(segmentsOf(tickerHref(symbol)))).toBe(symbol.toUpperCase());
    }
  });

  it("uppercases a lowercased URL", () => {
    expect(symbolFromSegments(segmentsOf(tickerHref("aapl")))).toBe("AAPL");
  });
});
