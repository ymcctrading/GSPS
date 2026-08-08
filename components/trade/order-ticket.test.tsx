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
      takeProfit2: entry * 1.36,
      masterProfit: entry * 1.36,
      riskPerShare: entry * 0.12,
      rewardToRiskTp1: 2,
      rewardToRiskTp2: 3,
      rewardToRiskMaster: 3,
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

/**
 * "Buy a PUT instead" is offered when a symbol can't be sold short. It sets the
 * option type and opens the options tab in one handler — and the chain load
 * used to read the option type from state that had not committed yet, so it
 * selected an at-the-money *call* while the UI showed Put selected. Pressing
 * the button then bought the opposite instrument to the one on screen.
 */
describe("OrderTicket — switching to a put", () => {
  const CHAIN = {
    underlying: "GPUS",
    price: 220,
    expirations: [
      {
        expiration: "2026-09-18",
        strikes: [
          { strike: 215, call: "GPUS260918C00215000", put: "GPUS260918P00215000" },
          { strike: 220, call: "GPUS260918C00220000", put: "GPUS260918P00220000" },
        ],
      },
    ],
  };

  /**
   * Tradability is unknown (the lookup fails), so the ticket stays permissive
   * and the short side remains clickable — the broker is what refuses it. That
   * is the reachable path to the shortcut on a bullish scan, and a bullish scan
   * is what makes this the real bug: the option type defaults to `call` there,
   * so the shortcut has to change it. On a bearish scan it already defaults to
   * `put` and the defect is invisible.
   */
  function mockShortRejected() {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.includes("/api/assets")) {
        return Promise.reject(new Error("tradability lookup unavailable"));
      }
      if (url.includes("/api/options/chain")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(CHAIN),
        } as Response);
      }
      const body = String(init?.body ?? "");
      if (body.includes('"assetClass":"equity"')) {
        return Promise.resolve({
          ok: false,
          status: 422,
          json: () =>
            Promise.resolve({
              error: "This symbol can't be sold short.",
              code: "short_not_allowed",
            }),
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

  function bullishScan(): ScanResult {
    return { ...scanWithEntry(220, "bullish"), symbol: "GPUS" };
  }

  /** Short the name, get refused by the broker, then take the offered shortcut. */
  async function takeShortcut(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: /Sell \/ Short/ }));
    await user.click(screen.getByRole("button", { name: /Sell short GPUS/ }));
    await user.click(await screen.findByRole("button", { name: /Buy a PUT instead/ }));
  }

  it("selects a put contract, not a call, after taking the shortcut", async () => {
    const user = userEvent.setup();
    mockShortRejected();
    render(<OrderTicket result={bullishScan()} />);

    await takeShortcut(user);

    // The contract actually staged for submission is a P, not a C.
    const contract = await screen.findByText(/^Contract: GPUS260918/);
    expect(contract.textContent).toMatch(/P00220000$/);
  });

  it("submits the put contract the button offered", async () => {
    const user = userEvent.setup();
    const fetchMock = mockShortRejected();
    render(<OrderTicket result={bullishScan()} />);

    await takeShortcut(user);
    await screen.findByText(/^Contract: GPUS260918/);
    await user.click(screen.getByRole("button", { name: /Buy to open PUT/ }));

    const optionCall = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("/api/orders"))
      .find(([, init]) => String((init as RequestInit)?.body ?? "").includes('"option"'));
    expect(optionCall).toBeDefined();
    const body = JSON.parse(String((optionCall![1] as RequestInit)?.body));
    expect(body.symbol).toMatch(/P00220000$/);
    expect(body.assetClass).toBe("option");
  });

  it("keeps the retry button working — its click event is not read as an option type", async () => {
    const user = userEvent.setup();
    // Fail the chain once so Retry renders, then succeed.
    let chainCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/assets")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ symbol: "DRAM", shortable: true, tradable: true }),
          } as Response);
        }
        if (url.includes("/api/options/chain")) {
          chainCalls++;
          if (chainCalls === 1) {
            return Promise.resolve({
              ok: false,
              status: 502,
              json: () => Promise.resolve({ error: "Chain unavailable" }),
            } as Response);
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ...CHAIN, underlying: "DRAM" }),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
      }),
    );

    render(<OrderTicket result={scanWithEntry(220, "bearish")} />);
    await user.click(screen.getByRole("button", { name: "Options" }));
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    // The default call/put state is a put on a bearish scan, and the retry must
    // honour it rather than treating its MouseEvent as the requested type.
    const contract = await screen.findByText(/^Contract: /);
    expect(contract.textContent).toMatch(/P00220000$/);
  });
});
