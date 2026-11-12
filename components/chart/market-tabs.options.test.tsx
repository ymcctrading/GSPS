/**
 * The chart's Options tab shows the real chain (owner, 2026-11-12): listed
 * strikes, the contract's own bid, ask, last, volume, open interest, IV and
 * greeks, and the listed expirations to switch between. A figure the feed
 * did not give reads "—", never a made-up number.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarketTabs } from "./market-tabs";
import { VocabularyProvider } from "@/components/vocabulary";
import type { OptionChain, OptionContract } from "@/lib/data/provider";

function contract(over: Partial<OptionContract>): OptionContract {
  return {
    strike: 360,
    type: "call",
    expiration: "2026-12-18",
    bid: 8.31,
    ask: 8.58,
    last: 9.62,
    delta: 0.4842,
    gamma: 0.0172,
    theta: -0.1454,
    vega: 0.4469,
    iv: 0.207,
    greeksSource: "feed",
    openInterest: 15234,
    volume: 3533,
    inTheMoney: false,
    contractSymbol: "AAPL261218C00360000",
    quoteTime: "2026-11-11T20:59:59Z",
    ...over,
  };
}

function chain(expiration: string): OptionChain & { horizon: unknown; source: string } {
  return {
    symbol: "AAPL",
    underlyingPrice: 358,
    expiration,
    expirations: ["2026-11-20", "2026-12-18", "2027-01-15"],
    simulated: false,
    feed: "indicative",
    source: "alpaca",
    horizon: { months: 24, maxDate: "2028-11-12", expirations: ["2026-11-20", "2026-12-18", "2027-01-15"] },
    contracts: [
      contract({ expiration }),
      contract({
        type: "put",
        expiration,
        bid: null,
        ask: 11.86,
        last: null,
        delta: null,
        gamma: null,
        theta: null,
        vega: null,
        iv: null,
        greeksSource: "none",
        openInterest: null,
        volume: 0,
        inTheMoney: true,
        contractSymbol: "AAPL261218P00360000",
      }),
      contract({ strike: 362.5, expiration, contractSymbol: "AAPL261218C00362500" }),
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Options tab", () => {
  it("shows the listed chain's real figures, '—' where the feed gave none, and switches expirations", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) => {
      const exp = new URL(url, "http://x").searchParams.get("expiration") ?? "2026-12-18";
      return new Response(JSON.stringify(chain(exp)), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MarketTabs symbol="AAPL" />);
    await user.click(screen.getByRole("button", { name: "Options" }));

    const table = await screen.findByRole("table");
    // A listed strike that is not on a $5 grid.
    expect(within(table).getByText("$362.50")).toBeInTheDocument();
    expect(within(table).getAllByText("$9.62").length).toBeGreaterThan(0); // last
    expect(within(table).getAllByText("20.7%").length).toBeGreaterThan(0); // IV
    expect(within(table).getAllByText("0.48").length).toBeGreaterThan(0); // delta
    expect(within(table).getAllByText("15,234").length).toBeGreaterThan(0); // open interest
    expect(within(table).getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("Simulated")).not.toBeInTheDocument();
    expect(screen.getByText(/free delayed feed/)).toBeInTheDocument();

    const select = screen.getByRole("combobox", { name: "Expiration" });
    expect(select).toHaveValue("2026-12-18");
    await user.selectOptions(select, "2027-01-15");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/options?symbol=AAPL&expiration=2027-01-15");
    expect(await screen.findByRole("combobox", { name: "Expiration" })).toHaveValue("2027-01-15");
  });

  it("glosses the greeks for a tier the school has not taught them to yet, and not after", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(chain("2026-12-18")), { status: 200 })));

    const { unmount } = render(
      <VocabularyProvider tier="PRACTICE">
        <MarketTabs symbol="AAPL" />
      </VocabularyProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Options" }));
    expect(await screen.findByText(/Delta \(moves per \$1 in the stock\)/)).toBeInTheDocument();
    unmount();

    render(
      <VocabularyProvider tier="SYSTEM_MASTERY">
        <MarketTabs symbol="AAPL" />
      </VocabularyProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Options" }));
    await screen.findByRole("table");
    expect(screen.queryByText(/moves per \$1 in the stock/)).not.toBeInTheDocument();
  });
});
