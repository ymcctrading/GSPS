import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardWatchlist } from "./dashboard-watchlist";

afterEach(() => vi.unstubAllGlobals());

const SIX = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA"];

function stubSave(response: { ok: boolean; body: unknown }) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: response.ok, json: () => Promise.resolve(response.body) } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("DashboardWatchlist", () => {
  it("lists the symbols as links to their full scan", () => {
    render(<DashboardWatchlist initialSymbols={SIX} isDefault canEdit />);
    expect(screen.getByRole("link", { name: "AAPL" })).toHaveAttribute("href", "/ticker/AAPL");
    expect(screen.getByText(/Magnificent Seven, SPY, and BTC/)).toBeInTheDocument();
  });

  it("names the list as the user's own once it has been customised", () => {
    render(<DashboardWatchlist initialSymbols={SIX} isDefault={false} canEdit />);
    expect(screen.getByText(/Your symbols/)).toBeInTheDocument();
    expect(screen.queryByText(/Magnificent Seven/)).not.toBeInTheDocument();
  });

  it("offers no editor to someone who isn't signed in", () => {
    render(<DashboardWatchlist initialSymbols={SIX} isDefault canEdit={false} />);
    expect(screen.queryByRole("button", { name: /Customize/ })).not.toBeInTheDocument();
  });

  it("adds a symbol (upper-cased) and saves the new list", async () => {
    const user = userEvent.setup();
    const fetchMock = stubSave({ ok: true, body: { symbols: [...SIX, "GOOGL"], isDefault: false } });
    render(<DashboardWatchlist initialSymbols={SIX} isDefault canEdit />);

    await user.click(screen.getByRole("button", { name: /Customize/ }));
    await user.type(screen.getByLabelText("Symbol to add"), "googl");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("7 of 9 (at least 3)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save list" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard-watchlist",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ symbols: [...SIX, "GOOGL"] }) }),
    );
    // Back to the read-only row, now showing the saved list.
    expect(await screen.findByRole("link", { name: "GOOGL" })).toBeInTheDocument();
    expect(screen.getByText(/Your symbols/)).toBeInTheDocument();
  });

  it("won't take a duplicate, and says which", async () => {
    const user = userEvent.setup();
    render(<DashboardWatchlist initialSymbols={SIX} isDefault canEdit />);
    await user.click(screen.getByRole("button", { name: /Customize/ }));
    await user.type(screen.getByLabelText("Symbol to add"), "aapl");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent("AAPL is already on the list.");
  });

  it("won't take a symbol it can't hold, and says why", async () => {
    const user = userEvent.setup();
    render(<DashboardWatchlist initialSymbols={SIX} isDefault canEdit />);
    await user.click(screen.getByRole("button", { name: /Customize/ }));
    await user.type(screen.getByLabelText("Symbol to add"), "EUR/USD");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/isn't a US stock or crypto symbol/);
  });

  it("stops at nine: the box and the Add button are disabled, with the count showing why", async () => {
    const user = userEvent.setup();
    const nine = [...SIX, "GOOGL", "SPY", "QQQ"];
    render(<DashboardWatchlist initialSymbols={nine} isDefault canEdit />);
    await user.click(screen.getByRole("button", { name: /Customize/ }));

    expect(screen.getByLabelText("Symbol to add")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getByText("9 of 9 (at least 3)")).toBeInTheDocument();
  });

  it("stops at three: nothing can be removed below the minimum", async () => {
    const user = userEvent.setup();
    render(<DashboardWatchlist initialSymbols={["AAPL", "MSFT", "NVDA"]} isDefault canEdit />);
    await user.click(screen.getByRole("button", { name: /Customize/ }));

    for (const s of ["AAPL", "MSFT", "NVDA"]) {
      expect(screen.getByRole("button", { name: `Remove ${s}` })).toBeDisabled();
    }
  });

  it("removes a symbol, and Save stays off until the list actually changed", async () => {
    const user = userEvent.setup();
    render(<DashboardWatchlist initialSymbols={SIX} isDefault canEdit />);
    await user.click(screen.getByRole("button", { name: /Customize/ }));

    expect(screen.getByRole("button", { name: "Save list" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove TSLA" }));
    expect(screen.getByRole("button", { name: "Save list" })).toBeEnabled();
    const list = screen.getByRole("list", { name: "Symbols on your watchlist" });
    expect(within(list).queryByText("TSLA")).not.toBeInTheDocument();
  });

  it("shows the server's reason when a save is refused, and stays in the editor", async () => {
    const user = userEvent.setup();
    stubSave({ ok: false, body: { error: "ZZZZ isn't a tradable US stock symbol." } });
    render(<DashboardWatchlist initialSymbols={SIX} isDefault canEdit />);
    await user.click(screen.getByRole("button", { name: /Customize/ }));
    await user.type(screen.getByLabelText("Symbol to add"), "zzzz");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Save list" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ZZZZ isn't a tradable US stock symbol.");
    expect(screen.getByRole("button", { name: "Save list" })).toBeInTheDocument();
  });

  it("resets to the platform default", async () => {
    const user = userEvent.setup();
    const fetchMock = stubSave({
      ok: true,
      body: { symbols: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "SPY", "BTC/USD"], isDefault: true },
    });
    render(<DashboardWatchlist initialSymbols={SIX} isDefault={false} canEdit />);
    await user.click(screen.getByRole("button", { name: /Customize/ }));
    await user.click(screen.getByRole("button", { name: "Reset to default" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard-watchlist", { method: "DELETE" });
    expect(await screen.findByRole("link", { name: "BTC/USD" })).toBeInTheDocument();
    expect(screen.getByText(/Magnificent Seven, SPY, and BTC/)).toBeInTheDocument();
  });

  it("offers no reset while the list is still the default", async () => {
    const user = userEvent.setup();
    render(<DashboardWatchlist initialSymbols={SIX} isDefault canEdit />);
    await user.click(screen.getByRole("button", { name: /Customize/ }));
    expect(screen.queryByRole("button", { name: "Reset to default" })).not.toBeInTheDocument();
  });

  it("cancel discards the edits", async () => {
    const user = userEvent.setup();
    render(<DashboardWatchlist initialSymbols={SIX} isDefault canEdit />);
    await user.click(screen.getByRole("button", { name: /Customize/ }));
    await user.click(screen.getByRole("button", { name: "Remove TSLA" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("link", { name: "TSLA" })).toBeInTheDocument();
  });
});
