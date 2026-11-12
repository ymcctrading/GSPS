import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveAccountView } from "./live-account";

const respond = (body: unknown, status = 200) =>
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: status < 400, status, text: async () => JSON.stringify(body) })));

afterEach(() => vi.unstubAllGlobals());

describe("LiveAccountView", () => {
  it("says it is real money, shows the account, and offers no button that acts on it", async () => {
    respond({
      connected: true,
      account: { equity: 31.5, cash: 6.5, buyingPower: 6.5, dayPl: 1.5, dayPlPct: 0.05, dayTradeCount: 1 },
      positions: [{ symbol: "LOW", side: "long", qty: 2, avgEntryPrice: 12.4, currentPrice: 12.5, marketValue: 25, unrealizedPl: 0.2, unrealizedPlPct: 0.008, stopPrice: 11, stopPartial: false }],
      orders: [{ id: "s1", symbol: "LOW", side: "sell", type: "stop", qty: 2, limitPrice: null, stopPrice: 11, status: "new", submittedAt: null }],
    });
    render(<LiveAccountView />);
    expect(await screen.findByText(/Live account: real money/)).toBeInTheDocument();
    expect(screen.getByText("Live positions (1)")).toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("points to Settings when no live account is connected", async () => {
    respond({ connected: false });
    render(<LiveAccountView />);
    expect(await screen.findByText(/No live account is connected/)).toBeInTheDocument();
  });

  it("shows the server's plain message when the broker can't be read", async () => {
    respond({ error: "Your live account couldn't be read from the broker just now." }, 502);
    render(<LiveAccountView />);
    expect(await screen.findByText(/couldn't be read from the broker/)).toBeInTheDocument();
  });
});
