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
import type { PublicScanResult } from "@/lib/types";

/**
 * A scan whose advised entry is the price that produced the original broker
 * rejection: `Invalid limit_price 49.755. sub-penny increment does not fulfill
 * minimum pricing criteria.`
 */
function scanWithEntry(entry: number, direction: "bullish" | "bearish" = "bullish"): PublicScanResult {
  return {
    symbol: "DRAM",
    assetClass: "us_equity",
    scannedAt: "2026-08-07T15:33:00.000Z",
    currentPrice: entry,
    direction,
    setupKind: "reversion",
    momentumElevated: false,
    trends: [],
    chartLevels: { trendLines: [], keyLevels: [], timingActive: false, longTermTimingCount: 0 },
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

  it("sends the protocol stop with an advised entry, so the server reads the crossing line from the plan", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<OrderTicket result={scanWithEntry(49.755)} />);

    await user.click(await screen.findByRole("button", { name: /Buy DRAM at \$49\.75/ }));

    const orderCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/orders"));
    const body = JSON.parse(String(orderCall![1]?.body));
    expect(body.entryStop).toBeCloseTo(49.755 * 0.88, 6);
    // And its first target, for the failed-top check (A-LEVELS-04).
    expect(body.entryTarget).toBeCloseTo(49.755 * 1.24, 6);
  });

  it("sends an old-level plan's kind with its stop", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    const scan = scanWithEntry(49.755);
    render(<OrderTicket result={{ ...scan, levels: { ...scan.levels!, entryKind: "oldLevel" } }} />);

    await user.click(await screen.findByRole("button", { name: /Buy DRAM at \$49\.75/ }));

    const orderCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/orders"));
    const body = JSON.parse(String(orderCall![1]?.body));
    expect(body.entryKind).toBe("oldLevel");
    expect(body.entryStop).toBeCloseTo(49.755 * 0.88, 6);
  });

  it("sends a held-bottom plan's kind with its stop (PLAN.md item 5, step 4)", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    const scan = scanWithEntry(49.755);
    render(<OrderTicket result={{ ...scan, levels: { ...scan.levels!, entryKind: "hold" } }} />);

    await user.click(await screen.findByRole("button", { name: /Buy DRAM at \$49\.75/ }));

    const orderCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/orders"));
    const body = JSON.parse(String(orderCall![1]?.body));
    expect(body.entryKind).toBe("hold");
    expect(body.entryStop).toBeCloseTo(49.755 * 0.88, 6);
  });

  it("leaves the protocol stop off an order placed against the plan's direction", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<OrderTicket result={scanWithEntry(49.755, "bearish")} forceSide="buy" />);

    await user.click(await screen.findByRole("button", { name: /Buy DRAM at \$49\.7/ }));

    const orderCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/orders"));
    const body = JSON.parse(String(orderCall![1]?.body));
    expect(body.side).toBe("buy");
    expect(body.entryStop).toBeUndefined();
    expect(body.entryTarget).toBeUndefined();
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

  function bullishScan(): PublicScanResult {
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

/**
 * The AVGO/IREN 2026-09-08 incident: price had already traded through the
 * setup's own stop by the time the ticket was opened, yet Protocol
 * Recommended mode still quoted the dead advised entry with no warning.
 * These lock in the fix — a bearish setup's stop sits above entry, so a
 * *rise* through it invalidates a short; a bullish setup's sits below, so a
 * *fall* through it invalidates a long.
 */
describe("OrderTicket protocol-level invalidation", () => {
  it("blocks a Protocol Recommended short once price has risen through the stop", async () => {
    mockFetch();
    const scan = scanWithEntry(43.95, "bearish"); // stop = 43.95 * 0.88 = 38.676
    render(<OrderTicket result={scan} livePrice={47.06} />);

    expect(await screen.findByText(/This setup is invalidated/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sell short DRAM/ }),
    ).toBeDisabled();
  });

  it("stays clear when price is still on the live side of the stop", async () => {
    mockFetch();
    // scanWithEntry's fixture stop is entry * 0.88 regardless of direction
    // (38.676 here) — below that is "not yet through the stop" for this short.
    const scan = scanWithEntry(43.95, "bearish");
    render(<OrderTicket result={scan} livePrice={30} />);

    expect(screen.queryByText(/This setup is invalidated/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sell short DRAM/ })).not.toBeDisabled();
  });

  it("blocks a Protocol Recommended long once price has fallen through the stop", async () => {
    mockFetch();
    const scan = scanWithEntry(100, "bullish"); // stop = 100 * 0.88 = 88
    render(<OrderTicket result={scan} livePrice={85} />);

    expect(await screen.findByText(/This setup is invalidated/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy DRAM/ })).toBeDisabled();
  });

  it("stays blocked when the scan itself retired the plan, even with price back at the entry", async () => {
    mockFetch();
    // The owner's rule (2026-09-30): a breached stop retires the plan until a
    // Gann's own test confirms it (a failed break) or a new plan replaces it. Price returning to the entry is not
    // that scan.
    const scan = { ...scanWithEntry(100, "bullish"), stopBreach: { stop: 88, price: 85, reclaimAt: 92.5 } };
    render(<OrderTicket result={scan} livePrice={100} />);

    expect(await screen.findByText(/This setup is invalidated/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy DRAM/ })).toBeDisabled();
  });

  it("keeps a live breach latched when price comes back, until a newer scan arrives", async () => {
    mockFetch();
    const scan = scanWithEntry(100, "bullish"); // stop = 88
    const { rerender } = render(<OrderTicket result={scan} livePrice={85} />);
    expect(await screen.findByText(/This setup is invalidated/)).toBeInTheDocument();

    // Price is back at the entry. No scan has run since, so the plan stays retired.
    rerender(<OrderTicket result={scan} livePrice={100} />);
    expect(screen.getByText(/This setup is invalidated/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy DRAM/ })).toBeDisabled();

    // A scan run afterwards, with price inside the stop, confirms the plan.
    rerender(<OrderTicket result={{ ...scan, scannedAt: "2026-08-07T16:10:00.000Z" }} livePrice={100} />);
    expect(screen.queryByText(/This setup is invalidated/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy DRAM/ })).not.toBeDisabled();
  });

  it("lets your own levels past the block", async () => {
    const user = userEvent.setup();
    mockFetch();
    const scan = scanWithEntry(43.95, "bearish");
    render(<OrderTicket result={scan} livePrice={47.06} />);

    await screen.findByText(/This setup is invalidated/);
    await user.click(screen.getByRole("button", { name: "My own levels" }));

    expect(screen.queryByText(/This setup is invalidated/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sell short DRAM/ })).not.toBeDisabled();
  });
});

/**
 * A plan armed by the structural trigger with no bar-sequence pattern — the
 * shape `/api/scan` returned for HDB and BMNR on 2026-09-28. The ticket's
 * headline used to dereference `pattern!` and took down the whole ticker page.
 */
describe("OrderTicket with no bar-sequence pattern", () => {
  it("renders a protocol plan whose pattern is null", () => {
    mockFetch();
    render(<OrderTicket result={{ ...scanWithEntry(40, "bearish"), pattern: null }} livePrice={40} />);
    expect(screen.getByText(/armed structural entry trigger is bearish/)).toBeInTheDocument();
  });
});

// A plan the protocol rates below Execute is not a recommended trade (owner
// report 2026-10-16: SPY's low-scoring plan read "Protocol Recommended").
describe("the order ticket's protocol mode follows the verdict", () => {
  afterEach(() => vi.restoreAllMocks());
  it("offers the swing plan only on an Execute verdict", async () => {
    mockFetch();
    const watch = { ...scanWithEntry(49.75), decision: { score: 4, outputState: "Watch" as const, breakdown: [] } };
    render(<OrderTicket result={watch} />);
    expect(await screen.findByRole("button", { name: "Swing plan" })).toBeDisabled();
    expect(screen.getByText(/rates this setup Watch/)).toBeInTheDocument();
  });
});

describe("OrderTicket other techniques", () => {
  const aligned = {
    source: "rsiReversal",
    label: "RSI 14 reversal (overbought/oversold)",
    aligned: true,
    armedDirection: null,
    reading: {
      source: "rsiReversal",
      label: "RSI 14 reversal (overbought/oversold)",
      agrees: true,
      summary: "RSI 14 is 58 (neutral). RSI 14 reversal (overbought/oversold) leans bullish, the same way as GSPS's plan.",
      levels: [
        { level: "stopLoss", price: 43.78, text: "Stop $43.78: a close here would put RSI 14 near 29 (oversold)." },
      ],
    },
    ownLevels: null,
  };
  const against = {
    source: "macdMomentum",
    label: "MACD momentum crossover (swing)",
    aligned: false,
    armedDirection: "bearish",
    reading: null,
    ownLevels: { direction: "bearish", entry: 49.1, stopLoss: 51.2, takeProfit1: 45.95, rationale: "MACD crossed down." },
  };

  function mockTechniques() {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      const json = (body: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
      if (url.includes("/api/strategy-mode-preference")) {
        return json({ mode: "gsps", allowedModes: ["rsiReversal", "macdMomentum"] });
      }
      if (url.includes("/api/strategy-levels/compare")) return json({ techniques: [aligned, against] });
      if (url.includes("/api/strategy-plugins")) return json({ plugins: [] });
      if (url.includes("/api/assets")) return json({ symbol: "DRAM", shortable: true, tradable: true });
      return json({ order: { status: "accepted" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends GSPS's plan, lists the aligned technique first, and gives the other its own levels with no MTP", async () => {
    const user = userEvent.setup();
    const fetchMock = mockTechniques();
    render(<OrderTicket result={scanWithEntry(50)} />);

    await user.click(await screen.findByRole("button", { name: "Read every technique" }));
    expect(await screen.findByText(/aligns with GSPS's plan/)).toBeTruthy();
    expect(screen.getByText(/Stop \$43\.78: a close here would put RSI 14 near 29/)).toBeTruthy();
    expect(screen.getByText(/Entry \$49\.10 · Stop \$51\.20 · TP1 \$45\.95 · no MTP/)).toBeTruthy();
    // Only the technique that doesn't align offers its own trade.
    expect(screen.getAllByRole("button", { name: "Trade these levels" })).toHaveLength(1);

    const call = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes("/api/strategy-levels/compare"))!;
    const params = new URL(call, "http://x").searchParams;
    expect(params.get("timeframe")).toBe("15Min");
    expect(params.get("direction")).toBe("bullish");
    expect(Number(params.get("entry"))).toBe(50);
    expect(Number(params.get("stop"))).toBeCloseTo(44);
  });

  it("trades a non-aligned technique's own levels as a Manual Override, without the plan's crossing line", async () => {
    const user = userEvent.setup();
    const fetchMock = mockTechniques();
    render(<OrderTicket result={scanWithEntry(50)} />);

    await user.click(await screen.findByRole("button", { name: "Read every technique" }));
    await user.click(await screen.findByRole("button", { name: "Trade these levels" }));
    expect(screen.getByText(/Trading MACD momentum crossover \(swing\)'s own levels/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Sell short DRAM/ }));
    const order = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/orders"))!;
    const body = JSON.parse(String(order[1]!.body));
    expect(body.levelSource).toBe("own");
    expect(body.side).toBe("sell");
    expect(body.limitPrice).toBe(49.1);
    expect(body.attachLevels).toEqual({ stopLoss: 51.2, takeProfit: 45.95 });
    expect(body.entryStop).toBeUndefined();
    expect(body.entryKind).toBeUndefined();
    expect(body.entryTarget).toBeUndefined();
    expect(body.techniqueSource).toBe("macdMomentum");
  });

  it("lets the technique's levels lapse once the person changes the side", async () => {
    const user = userEvent.setup();
    mockTechniques();
    render(<OrderTicket result={scanWithEntry(50)} />);

    await user.click(await screen.findByRole("button", { name: "Read every technique" }));
    await user.click(await screen.findByRole("button", { name: "Trade these levels" }));
    await user.click(screen.getByRole("button", { name: /Buy \/ Long/ }));
    expect(screen.queryByText(/Trading MACD momentum crossover/)).toBeNull();
    expect(screen.getByRole("button", { name: "Trade these levels" })).toBeTruthy();
  });

  it("says the plan is retired and reads the techniques with no plan once its stop has broken", async () => {
    const user = userEvent.setup();
    const fetchMock = mockTechniques();
    const scan = { ...scanWithEntry(50), stopBreach: { stop: 44, price: 43, reclaimAt: 44.5 } };
    render(<OrderTicket result={scan} livePrice={50} />);

    expect(await screen.findByText(/This plan is retired, so no technique can align/)).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: "Read every technique" }));
    const call = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes("/api/strategy-levels/compare"))!;
    expect(new URL(call, "http://x").searchParams.get("direction")).toBeNull();
  });
});

// Review of #461: an intraday alert's MTP rides with the order it opens.
describe("OrderTicket from an intraday alert", () => {
  it("sends the alert's stop, first target and MTP with the order", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<OrderTicket result={scanWithEntry(50)} intradaySourced intradayPlan={{ stop: 48, target: 53, master: 55 }} />);

    expect(await screen.findByText(/MTP \$55\.00 \(where the move is measured to; nothing sells there\)/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Buy .*DRAM/ }));
    const order = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/orders"))!;
    const body = JSON.parse(String(order[1]!.body));
    expect(body.intradaySourced).toBe(true);
    expect(body.attachLevels).toEqual({ stopLoss: 48, takeProfit: 53, masterProfit: 55 });
  });
});

// Owner, 2026-10-28: a manual trade can take the swing plan, the intraday
// plan, or the person's own stop, TP1 and MTP.
describe("OrderTicket level choice", () => {
  const orderBody = (fetchMock: ReturnType<typeof mockFetch>) => {
    const order = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/orders"))!;
    return JSON.parse(String(order[1]!.body));
  };

  it("trades the intraday plan the panel offers, at the market and managed within the session", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(
      <OrderTicket
        result={scanWithEntry(50)}
        livePrice={50}
        sessionPlan={{ entry: 50, stop: 51, firstTarget: 47, masterTarget: 45 }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Intraday plan" }));
    expect(screen.getByText(/The intraday plan: stop \$51\.00, first target \$47\.00, MTP \$45\.00/)).toBeTruthy();
    // The side follows the plan: its stop sits above its target, so it is a short.
    await user.click(screen.getByRole("button", { name: /Sell short DRAM/ }));
    const body = orderBody(fetchMock);
    expect(body.side).toBe("sell");
    expect(body.entryMode).toBe("now");
    expect(body.limitPrice).toBeUndefined();
    expect(body.entryStop).toBeUndefined();
    expect(body.intradaySourced).toBe(true);
    expect(body.levelSource).toBe("intraday");
    expect(body.attachLevels).toEqual({ stopLoss: 51, takeProfit: 47, masterProfit: 45 });
  });

  it("leaves the intraday plan off when no intraday alert stands", () => {
    mockFetch();
    render(<OrderTicket result={scanWithEntry(50)} />);
    expect(screen.getByRole("button", { name: "Intraday plan" })).toBeDisabled();
  });

  it("lets a ticket opened from an intraday alert take the swing plan instead", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<OrderTicket result={scanWithEntry(50)} livePrice={50} intradaySourced intradayPlan={{ stop: 48, target: 53, master: 55 }} />);
    await user.click(screen.getByRole("button", { name: "Swing plan" }));
    await user.click(screen.getByRole("button", { name: /Buy DRAM/ }));
    const body = orderBody(fetchMock);
    expect(body.intradaySourced).toBe(false);
    expect(body.levelSource).toBe("swing");
    expect(body.holdOvernight).toBeUndefined();
    expect(body.attachLevels.stopLoss).toBeCloseTo(44);
    expect(body.attachLevels.takeProfit).toBeCloseTo(62);
  });

  it("sends the person's own stop, TP1 and MTP", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<OrderTicket result={scanWithEntry(50)} livePrice={50} />);
    await user.click(screen.getByRole("button", { name: "My own levels" }));
    await user.type(screen.getByLabelText("Stop loss"), "47");
    await user.type(screen.getByLabelText("TP1"), "56");
    await user.type(screen.getByLabelText("MTP"), "60");
    await user.click(screen.getByRole("button", { name: /Buy DRAM/ }));
    const body = orderBody(fetchMock);
    expect(body.levelSource).toBe("own");
    expect(body.intradaySourced).toBe(false);
    expect(body.attachLevels).toEqual({ stopLoss: 47, takeProfit: 56, masterProfit: 60 });
  });

  it("refuses an MTP short of TP1, and a stop on the wrong side", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<OrderTicket result={scanWithEntry(50)} livePrice={50} />);
    await user.click(screen.getByRole("button", { name: "My own levels" }));
    await user.type(screen.getByLabelText("Stop loss"), "47");
    await user.type(screen.getByLabelText("TP1"), "56");
    await user.type(screen.getByLabelText("MTP"), "55");
    expect(screen.getByText(/The MTP \(\$55\.00\) has to sit above TP1 \(\$56\.00\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Buy DRAM/ })).toBeDisabled();

    await user.clear(screen.getByLabelText("MTP"));
    await user.clear(screen.getByLabelText("Stop loss"));
    await user.type(screen.getByLabelText("Stop loss"), "52");
    expect(screen.getByText(/The stop \(\$52\.00\) is at or above the entry price/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Buy DRAM/ })).toBeDisabled();
  });

  it("starts own levels from the swing plan and manages own levels as intraday when asked", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(
      <OrderTicket
        result={scanWithEntry(50)}
        livePrice={50}
        sessionPlan={{ entry: 50, stop: 49, firstTarget: 52, masterTarget: null }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "My own levels" }));
    await user.click(screen.getByRole("button", { name: "Start from the swing plan" }));
    expect(Number((screen.getByLabelText("Stop loss") as HTMLInputElement).value)).toBeCloseTo(44);
    expect(Number((screen.getByLabelText("MTP") as HTMLInputElement).value)).toBeCloseTo(68);
    await user.click(screen.getByLabelText(/Manage it as an intraday trade/));
    await user.click(screen.getByRole("button", { name: /Buy DRAM/ }));
    const body = orderBody(fetchMock);
    expect(body.intradaySourced).toBe(true);
    expect(body.levelSource).toBe("own");
    expect(body.attachLevels.masterProfit).toBeCloseTo(68);
  });

  it("never sends the daily plan's limit or crossing line with own levels managed as intraday", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<OrderTicket result={scanWithEntry(50)} livePrice={50} sessionPlan={{ entry: 50, stop: 49, firstTarget: 52, masterTarget: null }} />);
    await user.click(screen.getByRole("button", { name: "My own levels" }));
    await user.click(screen.getByRole("button", { name: "Start from the intraday plan" }));
    expect(screen.getByRole("button", { name: /At reference price/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Buy DRAM/ }));
    const body = orderBody(fetchMock);
    expect(body.entryMode).toBe("now");
    expect(body.limitPrice).toBeUndefined();
    expect(body.entryStop).toBeUndefined();
    expect(body.intradaySourced).toBe(true);
  });

  it("puts the swing plan back on its own side and advised entry", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<OrderTicket result={scanWithEntry(50)} livePrice={50} sessionPlan={{ entry: 50, stop: 51, firstTarget: 47, masterTarget: null }} />);
    await user.click(screen.getByRole("button", { name: "Intraday plan" }));
    await user.click(screen.getByRole("button", { name: "Swing plan" }));
    await user.click(screen.getByRole("button", { name: /Buy DRAM/ }));
    const body = orderBody(fetchMock);
    expect(body.side).toBe("buy");
    expect(body.entryMode).toBe("advised");
    expect(body.entryStop).toBeCloseTo(44);
    expect(body.intradaySourced).toBe(false);
  });

  it("drops a sub-dollar intraday MTP that sits inside the placement gap of TP1", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    // At $0.50 the gap is 1% of price ($0.005): an MTP $0.002 past TP1 would be refused.
    render(<OrderTicket result={scanWithEntry(0.5)} livePrice={0.5} sessionPlan={{ entry: 0.5, stop: 0.48, firstTarget: 0.53, masterTarget: 0.532 }} />);
    await user.click(screen.getByRole("button", { name: "Intraday plan" }));
    await user.click(screen.getByRole("button", { name: /Buy DRAM/ }));
    expect(orderBody(fetchMock).attachLevels).toEqual({ stopLoss: 0.48, takeProfit: 0.53 });
  });
});

describe("OrderTicket on a sell setup for shares already held", () => {
  function mockHeld(held: { side: "long" | "short"; qty: number; managed: boolean } | null, asset = { shortable: true, easyToBorrow: true }) {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
      if (url.includes("/api/assets")) return json({ symbol: "DRAM", tradable: true, ...asset });
      if (url.includes("/api/positions/held")) return json({ held });
      if (url.includes("/api/positions/close")) return json({ ok: true, order: { status: "filled" } });
      return json({ order: { status: "accepted" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("offers to sell the shares owned instead of opening a short", async () => {
    const user = userEvent.setup();
    const fetchMock = mockHeld({ side: "long", qty: 40, managed: true });
    render(<OrderTicket result={scanWithEntry(50, "bearish")} />);

    expect(await screen.findByText("You own 40 shares of DRAM.")).toBeInTheDocument();
    expect(screen.getByText(/reason to sell what you hold, not to open a short/)).toBeInTheDocument();
    // The short itself can't be pressed while the shares are held.
    expect(screen.getByRole("button", { name: /Sell short DRAM/ })).toBeDisabled();
    // A managed position closes whole: no partial offer.
    expect(screen.queryByRole("button", { name: /of them/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sell all 40 shares" }));
    const closeCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/positions/close"));
    expect(JSON.parse(String((closeCall as unknown as [string, RequestInit])[1].body))).toEqual({ symbol: "DRAM" });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/orders"))).toBe(false);
  });

  it("offers part of an unmanaged position at the ticket's quantity", async () => {
    const user = userEvent.setup();
    const fetchMock = mockHeld({ side: "long", qty: 4000, managed: false });
    render(<OrderTicket result={scanWithEntry(50, "bearish")} />);

    const part = await screen.findByRole("button", { name: /Sell \d+ of them/ });
    await user.click(part);
    const closeCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/positions/close"));
    const body = JSON.parse(String((closeCall as unknown as [string, RequestInit])[1].body));
    expect(body.symbol).toBe("DRAM");
    expect(body.qty).toBeGreaterThan(0);
    expect(body.qty).toBeLessThan(4000);
  });

  it("shows the short as usual when nothing is held, with a note on a hard-to-borrow stock", async () => {
    mockHeld(null, { shortable: true, easyToBorrow: false });
    render(<OrderTicket result={scanWithEntry(50, "bearish")} />);

    expect(await screen.findByText(/DRAM is hard to borrow/)).toBeInTheDocument();
    expect(screen.queryByText(/You own/)).not.toBeInTheDocument();
  });

  it("offers to cover a short held when the ticket is on the buy side", async () => {
    mockHeld({ side: "short", qty: 12, managed: false });
    render(<OrderTicket result={scanWithEntry(50)} />);
    expect(await screen.findByText("You're short 12 shares of DRAM.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cover all 12 shares" })).toBeInTheDocument();
  });
});
