/** The shared list as a viewer sees it: symbols only, and the ask-for-access path. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SharedListView } from "../shared-list-view";
import { WatchlistShare } from "@/components/dashboard/watchlist-share";

const TOKEN = "a".repeat(32);

function stub(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const { status, body } = handler(String(input), init);
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("SharedListView", () => {
  it("shows the symbols and offers a signed-in viewer to keep them", async () => {
    const fn = stub((url, init) => {
      if (url.startsWith("/api/shared-watchlist")) return { status: 200, body: { access: "view", owner: false, symbols: ["AAPL", "BTC/USD"] } };
      if (init?.method === "PUT") return { status: 200, body: { symbols: ["AAPL", "BTC/USD"] } };
      return { status: 200, body: { symbols: [] } };
    });
    render(<SharedListView token={TOKEN} />);
    expect(await screen.findByText("AAPL")).toBeTruthy();
    expect(screen.getByText(/not a recommendation/)).toBeTruthy();
    fireEvent.click(await screen.findByText("Use as my Dashboard list"));
    await waitFor(() => expect(screen.getByText(/Saved as your Dashboard list/)).toBeTruthy());
    const put = fn.mock.calls.find(([, i]) => i?.method === "PUT")!;
    expect(JSON.parse(String(put[1]?.body))).toEqual({ symbols: ["AAPL", "BTC/USD"] });
  });

  it("lets a member ask for a members-only list", async () => {
    let asked = false;
    stub((url, init) => {
      if (url.startsWith("/api/shared-watchlist") && init?.method === "POST") {
        asked = true;
        return { status: 200, body: { access: "pending" } };
      }
      if (url.startsWith("/api/shared-watchlist")) return { status: 200, body: { access: asked ? "pending" : "request" } };
      return { status: 200, body: {} };
    });
    render(<SharedListView token={TOKEN} />);
    fireEvent.click(await screen.findByText("Ask for access"));
    expect(await screen.findByText(/You asked for access/)).toBeTruthy();
  });

  it("says plainly when a link no longer leads anywhere", async () => {
    stub((url) =>
      url.startsWith("/api/shared-watchlist") ? { status: 404, body: { error: "This shared list isn't available." } } : { status: 401, body: {} },
    );
    render(<SharedListView token={TOKEN} />);
    expect(await screen.findByText(/isn't available/)).toBeTruthy();
  });
});

describe("WatchlistShare", () => {
  it("turns sharing on and shows the link", async () => {
    stub((_url, init) =>
      init?.method === "PUT"
        ? { status: 200, body: { share: { access: "link", token: TOKEN }, members: [] } }
        : { status: 200, body: { available: true, share: null, members: [] } },
    );
    render(<WatchlistShare />);
    fireEvent.click(await screen.findByText("Anyone with the link"));
    expect(await screen.findByText(new RegExp(`/shared/watchlist/${TOKEN}$`))).toBeTruthy();
  });

  it("explains that the default list can't be shared", async () => {
    stub(() => ({ status: 200, body: { available: false, share: null, members: [] } }));
    render(<WatchlistShare />);
    expect(await screen.findByText(/Save your own list first/)).toBeTruthy();
  });
});
