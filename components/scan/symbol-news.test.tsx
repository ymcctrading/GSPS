/** The symbol page's news card lists headlines beside their session's close. */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SymbolNewsCard } from "./symbol-news";
import type { SymbolNews } from "@/lib/news/symbolNews";

const NEWS: SymbolNews = {
  symbol: "AAA",
  readAt: "2026-10-28T15:00:00Z",
  items: [
    {
      createdAt: "2026-10-28T14:00:00Z",
      headline: "Still open",
      session: null,
      close: null,
      change: null,
      changePct: null,
    },
    {
      createdAt: "2026-10-27T15:00:00Z",
      headline: "Linked headline",
      source: "Wire",
      url: "https://example.com/a",
      session: "2026-10-27",
      close: 103.95,
      change: 4.95,
      changePct: 0.05,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SymbolNewsCard", () => {
  it("shows each headline with its session's close", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => NEWS }),
    );
    render(<SymbolNewsCard symbol="AAA" />);
    const link = await screen.findByRole("link", { name: "Linked headline" });
    expect(link.getAttribute("href")).toBe("https://example.com/a");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText("+5.00%")).toBeTruthy();
    expect(screen.getByText("Session not closed yet")).toBeTruthy();
  });

  it("renders nothing when signed out", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Not signed in" }),
      });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<SymbolNewsCard symbol="AAA" />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await vi.waitFor(() => expect(container.textContent).toBe(""));
  });

  it("shows the route's message when news can't be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 503,
          json: async () => ({ error: "News isn't available right now." }),
        }),
    );
    render(<SymbolNewsCard symbol="AAA" />);
    expect(
      await screen.findByText("News isn't available right now."),
    ).toBeTruthy();
  });
});
