/** The top bar never clips a destination: what does not fit is listed under More. */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";

const pathname = vi.hoisted(() => ({ value: "/settings" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/notifications/push-client", () => ({ forgetThisBrowserPush: vi.fn() }));
vi.mock("@/components/search/symbol-search", () => ({ SymbolSearch: () => null }));
vi.mock("@/components/notifications/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/app/recent-charts", () => ({ RecentCharts: () => null }));

import { AppNav } from "./nav";

/** Every item and the More button 100px wide; the bar itself `barWidth`. */
function stubWidths(barWidth: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const w = this.getAttribute("aria-label") === "Main" ? barWidth : 100;
    return { width: w, height: 20, top: 0, left: 0, right: w, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppNav top bar", () => {
  it("shows what fits and lists the rest under More, highlighted when the current page is there", () => {
    // 450 - 1 spare: More (100) + 3 × (4 + 100) = 412 fits, a fourth does not.
    stubWidths(450);
    render(<AppNav />);
    const bar = screen.getByRole("navigation", { name: "Main" });
    const shown = within(bar).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(shown).toEqual(["/dashboard", "/guided", "/scanner"]);

    const more = within(bar).getByRole("button", { name: /More/ });
    expect(more.className).toContain("bg-accent-soft");
    expect(more.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const listed = within(bar).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(listed).toEqual([
      "/dashboard", "/guided", "/scanner",
      "/school", "/portfolio", "/automation", "/learning", "/glossary", "/settings", "/promotion",
    ]);
    expect(within(bar).getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe("page");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(more);
  });

  it("closes the menu on a click outside it", () => {
    stubWidths(450);
    render(<AppNav />);
    const more = screen.getByRole("button", { name: /More/ });
    fireEvent.click(more);
    fireEvent.pointerDown(document.body);
    expect(more.getAttribute("aria-expanded")).toBe("false");
  });

  it("drops More when every destination fits", () => {
    stubWidths(2000);
    render(<AppNav />);
    const bar = screen.getByRole("navigation", { name: "Main" });
    expect(within(bar).queryByRole("button", { name: /More/ })).toBeNull();
    expect(within(bar).getAllByRole("link")).toHaveLength(10);
  });
});
