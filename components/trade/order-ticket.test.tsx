/**
 * The order ticket's price-increment disclosure.
 *
 * The rounding maths is unit-tested in lib/__tests__/tick-size.test.ts. What
 * this file covers is the promise the ticket makes to the user: that a price
 * the broker will refuse is corrected *before* the button is pressed, that the
 * corrected number is impossible to miss, and that the trade-off the correction
 * makes is stated rather than buried.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderTicket } from "./order-ticket";
import type { ScanResult } from "@/lib/types";

/**
 * A scan whose advised entry is the price that produced the original broker
 * rejection: `Invalid limit_price 49.755. sub-penny increment does not fulfill
 * minimum pricing criteria.`
 */
function scanWithEntry(entry: number, direction: "bullish" | "bearish" = "bullish"): ScanResult {
  return {
    symbol: "DRAM",
    assetClass: "us_equity",
    scannedAt: "2026-08-07T15:33:00.000Z",
    currentPrice: entry,
    direction,
    setupKind: "reversion",
    momentumElevated: false,
    trends: [],
    gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
    pattern: {
      name: "2-2",
      direction,
      triggerPrice: entry,
      stopPrice: entry * 0.88,
      description: "Test setup",
    },
    armedPatterns: [],
    levels: {
      entry,
      stopLoss: entry * 0.88,
      takeProfit1: entry * 1.24,
      masterProfit: entry * 1.36,
      riskPerShare: entry * 0.12,
      rewardToRiskTp1: 2,
      rewardToRiskMaster: 3,
      masterFromStructure: false,
      stopPctOfPrice: 12,
      stopBandWarning: null,
    },
    decision: { score: 7, outputState: "Execute", breakdown: [] },
  };
}

function mockFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url.includes("/api/assets")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ symbol: "DRAM", shortable: true, tradable: true }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ order: { status: "accepted" } }),
    } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrderTicket price increments", () => {
  it("corrects a sub-penny advised entry before the order is placed", async () => {
    mockFetch();
    render(<OrderTicket result={scanWithEntry(49.755)} />);

    expect(await screen.findByText(/Price adjusted to \$49\.75/)).toBeInTheDocument();
    expect(screen.getByText(/no sub-penny prices/)).toBeInTheDocument();
  });

  it("puts the corrected price on the button, so it can't be pressed unseen", async () => {
    mockFetch();
    render(<OrderTicket result={scanWithEntry(49.755)} />);

    expect(await screen.findByRole("button", { name: /Buy DRAM at \$49\.75/ })).toBeInTheDocument();
  });

  it("explains what rounding down costs and buys on a buy order", async () => {
    mockFetch();
    render(<OrderTicket result={scanWithEntry(49.755)} />);

    expect(await screen.findByText(/never pay more than you intended/)).toBeInTheDocument();
    expect(screen.getByText(/less likely to fill/)).toBeInTheDocument();
  });

  it("lets the user override the rounding direction", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<OrderTicket result={scanWithEntry(49.755)} />);

    await user.click(await screen.findByRole("button", { name: "Round up" }));

    expect(screen.getByText(/Price adjusted to \$49\.76/)).toBeInTheDocument();
    expect(screen.getByText(/raises the most you could pay/)).toBeInTheDocument();
  });

  it("says nothing at all when the advised price is already valid", async () => {
    mockFetch();
    render(<OrderTicket result={scanWithEntry(49.75)} />);

    await screen.findByRole("button", { name: "Buy DRAM" });
    expect(screen.queryByText(/Price adjusted/)).not.toBeInTheDocument();
  });

  it("submits the corrected price and the rounding mode it disclosed", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<OrderTicket result={scanWithEntry(49.755)} />);

    await user.click(await screen.findByRole("button", { name: /Buy DRAM at \$49\.75/ }));

    const orderCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/orders"));
    expect(orderCall).toBeDefined();
    const body = JSON.parse(String(orderCall![1]?.body));
    // The server re-validates; sending the mode is what keeps its answer
    // identical to the number the user was shown.
    expect(body.rounding).toBe("down");
    expect(body.limitPrice).toBe(49.755);
  });
});
