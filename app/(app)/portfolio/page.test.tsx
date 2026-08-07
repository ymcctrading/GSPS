/**
 * Rendering tests for the Portfolio tab's four sections.
 *
 * The sectioning rule itself is unit-tested in lib/__tests__/sections.test.ts.
 * What this file covers is the part that only exists in the component: that
 * each bucket lands in the right panel with the right count, that an empty
 * bucket still renders its header and empty-state line, and that the
 * collapsible sections open on click.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PortfolioPage from "./page";

const account = { equity: 100000, cash: 40000, buyingPower: 80000, dayPlPct: 1.4 };

const aaplShares = {
  assetType: "EQUITY" as const,
  symbol: "AAPL",
  avgFillPrice: 201.4,
  totalShares: 50,
  currentPrice: 214.2,
  marketValue: 10710,
  equityPl: 640,
  equityPlPct: 6.35,
  todayPlPct: 0.82,
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

function order(o: { id: string; symbol: string; status: string; created_at?: string }) {
  return {
    id: o.id,
    symbol: o.symbol,
    side: "buy",
    order_type: "market",
    qty: 10,
    limit_price: null,
    status: o.status,
    created_at: o.created_at ?? "2026-08-01T14:30:00.000Z",
    asset_type: "EQUITY",
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

/**
 * Route the page's two fetches to canned payloads. `portfolioFails` models the
 * real asymmetry: /api/portfolio 503s when the paper account has no Alpaca
 * keys, while /api/orders still serves rows out of Supabase.
 */
function mockApi(payload: {
  positions?: typeof blendedPositions;
  orders?: ReturnType<typeof order>[];
  portfolioFails?: boolean;
}) {
  const isPortfolio = (url: string) => url.includes("/api/portfolio");

  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (isPortfolio(url) && payload.portfolioFails) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: "Paper account is not configured." }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            isPortfolio(url)
              ? { mode: "paper", account, blendedPositions: payload.positions ?? [] }
              : { orders: payload.orders ?? [] },
          ),
      } as Response);
    }),
  );
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
  it("renders the four sections in order: Open, Pending, Closed, Canceled & Rejected", async () => {
    mockApi({});
    render(<PortfolioPage />);

    const headings = (await screen.findAllByRole("heading", { level: 3 })).map((h) => h.textContent);
    expect(headings).toEqual([
      "Open Positions (0)",
      "Pending Positions (0)",
      "Closed Positions (0)",
      "Canceled & Rejected (0)",
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
    expect(screen.getByRole("heading", { name: "Closed Positions (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Canceled & Rejected (2)" })).toBeInTheDocument();

    const pending = section(/^Pending Positions/);
    expect(within(pending).getByText("MSFT")).toBeInTheDocument();
    expect(within(pending).getByText("NVDA")).toBeInTheDocument();
    expect(within(pending).queryByText("TSLA")).not.toBeInTheDocument();
  });

  it("keeps an empty section on the page with its own empty-state line", async () => {
    mockApi({ orders: [order({ id: "1", symbol: "MSFT", status: "new" })] });
    render(<PortfolioPage />);

    expect(await screen.findByText(/No open positions/)).toBeInTheDocument();
    expect(screen.getByText("No closed positions.")).toBeInTheDocument();
    expect(screen.getByText("No canceled or rejected orders.")).toBeInTheDocument();
    expect(screen.queryByText("No pending positions.")).not.toBeInTheDocument();
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
    expect(within(section(/^Closed Positions/)).getByText("TSLA")).toBeInTheDocument();
  });

  it("drops the toggle on an empty collapsible section — there is nothing to hide", async () => {
    mockApi({});
    render(<PortfolioPage />);

    await screen.findByRole("heading", { name: "Closed Positions (0)" });
    expect(screen.queryByRole("button", { name: /Closed Positions/ })).not.toBeInTheDocument();
    expect(screen.getByText("No closed positions.")).toBeInTheDocument();
  });

  it("separates canceled from rejected inside the Canceled & Rejected section", async () => {
    const user = userEvent.setup();
    mockApi({
      orders: [
        order({ id: "1", symbol: "AMD", status: "canceled" }),
        order({ id: "2", symbol: "PLTR", status: "cancelled" }),
        order({ id: "3", symbol: "GME", status: "rejected" }),
        order({ id: "4", symbol: "INTC", status: "expired" }),
      ],
    });
    render(<PortfolioPage />);

    await user.click(await screen.findByRole("button", { name: /Canceled & Rejected \(4\)/ }));

    const panel = section(/^Canceled & Rejected/);
    expect(within(panel).getByText("Canceled (2)")).toBeInTheDocument();
    expect(within(panel).getByText("Rejected (1)")).toBeInTheDocument();
    expect(within(panel).getByText("Expired (1)")).toBeInTheDocument();
    expect(within(panel).queryByText(/^Replaced/)).not.toBeInTheDocument();

    // Each group explains what that ending means, so the two aren't conflated.
    expect(within(panel).getByText(/broker refused the order outright/)).toBeInTheDocument();
    expect(within(panel).getByText(/Pulled before filling/)).toBeInTheDocument();
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
    const user = userEvent.setup();
    mockApi({
      orders: [
        order({ id: "old", symbol: "AMD", status: "canceled", created_at: "2026-07-01T10:00:00Z" }),
        order({ id: "new", symbol: "GME", status: "canceled", created_at: "2026-08-01T10:00:00Z" }),
      ],
    });
    render(<PortfolioPage />);

    await user.click(await screen.findByRole("button", { name: /Canceled & Rejected \(2\)/ }));

    const rows = within(section(/^Canceled & Rejected/)).getAllByRole("row");
    // Row 0 is the header row; the newest order leads the body.
    expect(rows[1]).toHaveTextContent("GME");
    expect(rows[2]).toHaveTextContent("AMD");
  });
});
