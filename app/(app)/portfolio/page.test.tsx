/**
 * Rendering tests for the Portfolio tab's five sections.
 *
 * The sectioning rule itself is unit-tested in lib/__tests__/sections.test.ts,
 * the status vocabulary in lib/__tests__/order-status.test.ts, and the open
 * timestamp in lib/__tests__/opened-at.test.ts. What this file covers is the
 * part that only exists in the component: that each bucket lands in the right
 * panel with the right count, that an empty bucket still renders its header and
 * empty-state line, that the collapsible sections open on click, and — the
 * behaviours this pass added — that shares never render Greek columns, that
 * options keep theirs behind a toggle, that every leg shows when it opened, and
 * that a stale or failed sync is visible rather than silent.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PortfolioPage from "./page";
import type { OrderRow } from "@/components/portfolio/types";
import type { EquityLeg, OptionLeg } from "@/lib/portfolio/blend";

const account = { equity: 100000, cash: 40000, buyingPower: 80000, dayPlPct: 1.4 };

const aaplShares: EquityLeg = {
  assetType: "EQUITY",
  symbol: "AAPL",
  avgFillPrice: 201.4,
  totalShares: 50,
  currentPrice: 214.2,
  marketValue: 10710,
  equityPl: 640,
  equityPlPct: 6.35,
  todayPlPct: 0.82,
  opened: { openedAt: "2026-08-07T14:14:00.000Z", reason: "derived" },
};

const aaplCall: OptionLeg = {
  assetType: "OPTION",
  symbol: "AAPL260918C00220000",
  underlying: "AAPL",
  strike: 220,
  expiration: "2026-09-18",
  type: "call",
  qty: 2,
  side: "long",
  premium: 5.1,
  currentPremium: 6.4,
  marketValue: 1280,
  optionPl: 260,
  optionPlPct: 25.49,
  todayPlPct: 3.1,
  greeks: { delta: 0.54, gamma: 0.0312, theta: -0.08, vega: 0.19 },
  impliedVol: 0.31,
  greeksModeled: true,
  greeksAvailable: true,
  opened: { openedAt: "2026-08-07T18:02:00.000Z", reason: "derived" },
};

const blendedPositions = [
  {
    underlying: "AAPL",
    equity: aaplShares,
    options: [],
    totalMarketValue: 10710,
    totalPl: 640,
  },
];

const blendedWithOption = [
  {
    underlying: "AAPL",
    equity: aaplShares,
    options: [aaplCall],
    totalMarketValue: 11990,
    totalPl: 900,
  },
];

function order(o: {
  id: string;
  symbol: string;
  status: string;
  created_at?: string;
  broker_submitted_at?: string | null;
  reject_reason?: string | null;
  asset_type?: "EQUITY" | "OPTION";
}): OrderRow {
  return {
    id: o.id,
    symbol: o.symbol,
    side: "buy",
    order_type: "market",
    qty: 10,
    limit_price: null,
    requested_limit_price: null,
    status: o.status,
    created_at: o.created_at ?? "2026-08-01T14:30:00.000Z",
    broker_submitted_at: o.broker_submitted_at ?? null,
    reject_reason: o.reject_reason ?? null,
    filled_qty: null,
    filled_avg_price: null,
    asset_type: o.asset_type ?? ("EQUITY" as const),
    purchase_price: 100,
    contract_cost: null,
    option_type: null,
    strike: null,
    expiration: null,
    delta: null,
    gamma: null,
    theta: null,
    vega: null,
    take_profit: null,
    master_profit: null,
    stop_price: null,
    currentPrice: null,
    dayPl: null,
    dayPlPct: null,
    targets: { tp1: "none", mp: "none", sl: "none" },
  };
}

function optionOrder(o: { id: string; symbol: string; status: string }): OrderRow {
  return {
    ...order({ ...o, asset_type: "OPTION" }),
    option_type: "call" as const,
    strike: 220,
    expiration: "2026-09-18",
    contract_cost: 1020,
    delta: 0.54,
    gamma: 0.0312,
    theta: -0.08,
    vega: 0.19,
  };
}

const OK_SYNC = { syncedAt: "2026-08-07T15:33:00.000Z", syncError: null };

/**
 * Route the page's two fetches to canned payloads. `portfolioFails` models the
 * real asymmetry: /api/portfolio 503s when the paper account has no Alpaca
 * keys, while /api/orders still serves rows out of Supabase.
 */
function mockApi(payload: {
  positions?: typeof blendedPositions | typeof blendedWithOption;
  orders?: OrderRow[];
  portfolioFails?: boolean;
  ordersFail?: boolean;
  sync?: { syncedAt: string | null; syncError: string | null };
}) {
  const isAnalytics = (url: string) => url.includes("/api/portfolio/analytics");
  const isPortfolio = (url: string) => url.includes("/api/portfolio") && !isAnalytics(url);
  const calls: string[] = [];

  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    // The analytics dashboard fetches its own endpoint independently of the
    // page's portfolio/orders loaders — always serve it an empty-but-ok
    // payload here so it doesn't interfere with assertions about the other
    // two fetches (its own rendering is covered by analytics-dashboard tests
    // and the pure functions it calls are covered in lib/__tests__).
    if (isAnalytics(url)) {
      const metric = new URL(url, "http://localhost").searchParams.get("metric");
      const body = metric === "summary" ? { total_trades: 0 } : [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      } as Response);
    }
    if (isPortfolio(url) && payload.portfolioFails) {
      return Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: "Paper account is not configured." }),
      } as Response);
    }
    if (!isPortfolio(url) && payload.ordersFail) {
      return Promise.resolve({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ error: "Broker unreachable" }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          isPortfolio(url)
            ? { mode: "paper", account, blendedPositions: payload.positions ?? [] }
            : { orders: payload.orders ?? [], sync: payload.sync ?? OK_SYNC },
        ),
    } as Response);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

/** The panel a section heading belongs to, for scoping queries to one section. */
function section(name: RegExp): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const card = heading.closest("div.rounded-xl");
  if (!card) throw new Error(`No panel found for ${name}`);
  return card as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Portfolio sections", () => {
  it("renders the five sections in order: Open, Pending, Rejected, Closed, Canceled & Expired", async () => {
    mockApi({});
    render(<PortfolioPage />);

    const headings = (await screen.findAllByRole("heading", { level: 3 })).map((h) => h.textContent);
    expect(headings).toEqual([
      "Open Positions (0)",
      "Pending Positions (0)",
      "Rejected Orders (0)",
      "Closed Positions (0)",
      "Canceled & Expired (0)",
    ]);
  });

  it("puts each order in its own section, with a count in the header", async () => {
    mockApi({
      positions: blendedPositions,
      orders: [
        order({ id: "1", symbol: "AAPL", status: "filled" }), // held → open
        order({ id: "2", symbol: "MSFT", status: "new" }),
        order({ id: "3", symbol: "NVDA", status: "accepted" }),
        order({ id: "4", symbol: "TSLA", status: "filled" }), // not held → closed
        order({ id: "5", symbol: "AMD", status: "canceled" }),
        order({ id: "6", symbol: "GME", status: "rejected" }),
      ],
    });
    render(<PortfolioPage />);

    expect(await screen.findByRole("heading", { name: "Open Positions (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pending Positions (2)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rejected Orders (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Closed Positions (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Canceled & Expired (1)" })).toBeInTheDocument();

    const pending = section(/^Pending Positions/);
    expect(within(pending).getAllByText("MSFT").length).toBeGreaterThan(0);
    expect(within(pending).getAllByText("NVDA").length).toBeGreaterThan(0);
    expect(within(pending).queryByText("TSLA")).not.toBeInTheDocument();
  });

  it("keeps an empty section on the page with its own empty-state line", async () => {
    mockApi({ orders: [order({ id: "1", symbol: "MSFT", status: "new" })] });
    render(<PortfolioPage />);

    expect(await screen.findByText(/No open positions/)).toBeInTheDocument();
    expect(screen.getByText("No closed positions.")).toBeInTheDocument();
    expect(screen.getByText("No canceled or expired orders.")).toBeInTheDocument();
    expect(screen.getByText("No rejected orders.")).toBeInTheDocument();
    expect(screen.queryByText(/No pending positions/)).not.toBeInTheDocument();
  });

  it("collapses Closed by default and expands it on click", async () => {
    const user = userEvent.setup();
    mockApi({ orders: [order({ id: "1", symbol: "TSLA", status: "filled" })] });
    render(<PortfolioPage />);

    const toggle = await screen.findByRole("button", { name: /Closed Positions \(1\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("TSLA")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(section(/^Closed Positions/)).getAllByText("TSLA").length).toBeGreaterThan(0);
  });

  it("drops the toggle on an empty collapsible section — there is nothing to hide", async () => {
    mockApi({});
    render(<PortfolioPage />);

    await screen.findByRole("heading", { name: "Closed Positions (0)" });
    expect(screen.queryByRole("button", { name: /Closed Positions/ })).not.toBeInTheDocument();
    expect(screen.getByText("No closed positions.")).toBeInTheDocument();
  });

  it("never collapses Pending or Rejected — both hold things the user may need to act on", async () => {
    mockApi({
      orders: [
        order({ id: "1", symbol: "MSFT", status: "new" }),
        order({ id: "2", symbol: "GME", status: "rejected" }),
      ],
    });
    render(<PortfolioPage />);

    await screen.findByRole("heading", { name: "Pending Positions (1)" });
    expect(screen.queryByRole("button", { name: /Pending Positions/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rejected Orders/ })).not.toBeInTheDocument();
  });

  it("separates the routine unfilled endings by disposition", async () => {
    const user = userEvent.setup();
    mockApi({
      orders: [
        order({ id: "1", symbol: "AMD", status: "canceled" }),
        order({ id: "2", symbol: "PLTR", status: "cancelled" }),
        order({ id: "3", symbol: "INTC", status: "expired" }),
      ],
    });
    render(<PortfolioPage />);

    await user.click(await screen.findByRole("button", { name: /Canceled & Expired \(3\)/ }));

    const panel = section(/^Canceled & Expired/);
    expect(within(panel).getByText("Canceled (2)")).toBeInTheDocument();
    expect(within(panel).getByText("Expired (1)")).toBeInTheDocument();
    expect(within(panel).queryByText(/^Rejected \(/)).not.toBeInTheDocument();

    // Each group explains what that ending means, so the two aren't conflated.
    expect(within(panel).getByText(/Pulled before filling/)).toBeInTheDocument();
    expect(within(panel).getByText(/end of its time in force/)).toBeInTheDocument();
  });

  it("does not report filled orders as closed when the position snapshot fails to load", async () => {
    mockApi({
      portfolioFails: true,
      orders: [
        order({ id: "1", symbol: "AAPL", status: "filled" }),
        order({ id: "2", symbol: "TSLA", status: "filled" }),
      ],
    });
    render(<PortfolioPage />);

    expect(await screen.findByText(/Paper account is not configured/)).toBeInTheDocument();
    // Without a snapshot we cannot know these were exited, so nothing claims it.
    expect(screen.getByRole("heading", { name: "Closed Positions (0)" })).toBeInTheDocument();
    expect(within(section(/^Open Positions/)).getByText("Entry orders (2)")).toBeInTheDocument();
  });

  it("sorts a section newest first", async () => {
    mockApi({
      orders: [
        order({ id: "old", symbol: "AMD", status: "new", created_at: "2026-07-31T10:00:00Z" }),
        order({ id: "new", symbol: "GME", status: "new", created_at: "2026-08-07T10:00:00Z" }),
      ],
    });
    render(<PortfolioPage />);

    await screen.findByRole("heading", { name: "Pending Positions (2)" });
    const rows = within(section(/^Pending Positions/)).getAllByRole("row");
    // Row 0 is the header row; the newest order leads the body.
    expect(rows[1]).toHaveTextContent("GME");
    expect(rows[2]).toHaveTextContent("AMD");
  });
});

describe("Asset-aware rendering", () => {
  it("renders no Greek columns at all on a shares position", async () => {
    mockApi({ positions: blendedPositions });
    render(<PortfolioPage />);

    const open = section(/^Open Positions/);
    await within(open).findAllByText("Shares");

    // Not "a dash where Delta would be" — the column does not exist.
    for (const greek of ["Δ", "Γ", "Θ", "V"]) {
      expect(within(open).queryByTitle(greek === "Δ" ? "Delta" : greek === "Γ" ? "Gamma" : greek === "Θ" ? "Theta" : "Vega")).not.toBeInTheDocument();
    }
    expect(within(open).queryByRole("button", { name: /Greeks/ })).not.toBeInTheDocument();
  });

  it("keeps option Greeks behind a toggle that starts closed", async () => {
    const user = userEvent.setup();
    mockApi({ positions: blendedWithOption });
    render(<PortfolioPage />);

    const open = section(/^Open Positions/);
    const toggle = await within(open).findByRole("button", { name: "Show Greeks" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(open).queryByTitle("Delta")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(within(open).getByRole("button", { name: "Hide Greeks" })).toBeInTheDocument();
    expect(within(open).getByTitle("Delta")).toBeInTheDocument();
    expect(within(open).getAllByText("0.54").length).toBeGreaterThan(0);
  });

  it("splits an order ledger holding both asset types into its own table each", async () => {
    mockApi({
      orders: [
        order({ id: "e", symbol: "MSFT", status: "new" }),
        optionOrder({ id: "o", symbol: "AAPL260918C00220000", status: "new" }),
      ],
    });
    render(<PortfolioPage />);

    const pending = await screen.findByRole("heading", { name: "Pending Positions (2)" });
    const panel = pending.closest("div.rounded-xl") as HTMLElement;
    expect(within(panel).getByText("Shares (1)")).toBeInTheDocument();
    expect(within(panel).getByText("Option contracts (1)")).toBeInTheDocument();
    // The shares table has no Greeks toggle; the contracts table does.
    expect(within(panel).getAllByRole("button", { name: /Greeks/ })).toHaveLength(1);
  });
});

describe("Open timestamps", () => {
  it("shows when each leg was first opened, in Eastern time", async () => {
    mockApi({ positions: blendedWithOption });
    render(<PortfolioPage />);

    const open = section(/^Open Positions/);
    // 14:14 UTC → 10:14 EDT, and 18:02 UTC → 2:02 PM EDT.
    expect(await within(open).findAllByText("Aug 7, 2026 · 10:14 AM ET")).not.toHaveLength(0);
    expect(within(open).getAllByText("Aug 7, 2026 · 2:02 PM ET")).not.toHaveLength(0);
  });

  it("says the fill history is missing rather than inventing a timestamp", async () => {
    mockApi({
      positions: [
        {
          ...blendedPositions[0],
          equity: {
            ...aaplShares,
            opened: { openedAt: null, reason: "insufficient-history" },
          },
        },
      ],
    });
    render(<PortfolioPage />);

    const open = section(/^Open Positions/);
    expect(
      await within(open).findAllByText("Unavailable — historical fill data missing"),
    ).not.toHaveLength(0);
  });

  it("renders the timestamp in both the desktop table and the mobile card", async () => {
    mockApi({ positions: blendedPositions });
    render(<PortfolioPage />);

    const open = section(/^Open Positions/);
    // One in the sm:block table, one in the sm:hidden card stack — neither
    // layout is allowed to be the one that drops it.
    const stamps = await within(open).findAllByText("Aug 7, 2026 · 10:14 AM ET");
    expect(stamps.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Sync freshness", () => {
  it("shows when the order list was last confirmed with the broker", async () => {
    mockApi({ orders: [order({ id: "1", symbol: "MSFT", status: "new" })] });
    render(<PortfolioPage />);

    expect(await screen.findByText(/Last synced Aug 7, 2026 · 11:33 AM ET/)).toBeInTheDocument();
  });

  it("says the list may be stale when the broker couldn't be reached", async () => {
    mockApi({
      orders: [order({ id: "1", symbol: "MSFT", status: "new" })],
      sync: { syncedAt: null, syncError: "Couldn't reach the broker to confirm order statuses." },
    });
    render(<PortfolioPage />);

    expect(await screen.findByText(/Not synced/)).toBeInTheDocument();
    expect(screen.getByText(/Couldn't reach the broker/)).toBeInTheDocument();
  });

  it("surfaces a failed orders fetch instead of silently keeping the old list", async () => {
    mockApi({ ordersFail: true });
    render(<PortfolioPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't refresh orders/);
  });

  it("refreshes from the server rather than only re-rendering", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ orders: [order({ id: "1", symbol: "MSFT", status: "new" })] });
    render(<PortfolioPage />);

    await screen.findByRole("heading", { name: "Pending Positions (1)" });
    const before = calls.filter((c) => c.includes("/api/orders")).length;

    await user.click(screen.getByRole("button", { name: "Refresh orders" }));

    const after = calls.filter((c) => c.includes("/api/orders")).length;
    expect(after).toBeGreaterThan(before);
    expect(calls.filter((c) => c.includes("/api/portfolio")).length).toBeGreaterThan(1);
  });
});

describe("Rejected orders", () => {
  it("shows the broker's reason and a route back to a corrected order", async () => {
    mockApi({
      orders: [
        order({
          id: "r1",
          symbol: "DRAM",
          status: "rejected",
          reject_reason:
            "The broker rejected this order: Invalid limit_price 49.755. sub-penny increment does not fulfill minimum pricing criteria.",
        }),
      ],
    });
    render(<PortfolioPage />);

    const panel = section(/^Rejected Orders/);
    expect(await within(panel).findByText(/sub-penny increment/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Fix order/ })).toHaveAttribute(
      "href",
      "/ticker/DRAM",
    );
  });

  it("is visible without expanding anything — a rejection is not filed away", async () => {
    mockApi({ orders: [order({ id: "r1", symbol: "GME", status: "rejected" })] });
    render(<PortfolioPage />);

    // No click: the reason line is on screen as soon as the page loads.
    expect(
      await screen.findByText("The broker refused this order and gave no reason."),
    ).toBeInTheDocument();
  });
});

describe("Status vocabulary", () => {
  it("renders the normalized label, not the broker's raw status string", async () => {
    mockApi({ orders: [order({ id: "1", symbol: "MSFT", status: "accepted_for_bidding" })] });
    render(<PortfolioPage />);

    const pending = section(/^Pending Positions/);
    expect(await within(pending).findAllByText("Pending")).not.toHaveLength(0);
    expect(within(pending).queryByText("accepted_for_bidding")).not.toBeInTheDocument();
  });

  it("flags an order the broker has no record of rather than showing it as live", async () => {
    mockApi({ orders: [order({ id: "1", symbol: "MSFT", status: "sync_error" })] });
    render(<PortfolioPage />);

    const pending = section(/^Pending Positions/);
    expect(await within(pending).findAllByText("Sync error")).not.toHaveLength(0);
  });
});
