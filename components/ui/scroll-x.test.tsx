/** A box wider than its screen says so and can be scrolled without a swipe. */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { ScrollX } from "./scroll-x";

function stubWidths(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ScrollX", () => {
  it("draws nothing extra when the content fits", () => {
    stubWidths(500, 500);
    render(<ScrollX><table /></ScrollX>);
    expect(screen.queryByRole("button", { name: "Scroll right" })).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("offers left and right buttons and a focusable region when columns sit past the edge", () => {
    stubWidths(1450, 1070);
    render(<ScrollX label="Options chain"><table /></ScrollX>);
    const right = screen.getByRole("button", { name: "Scroll right" });
    const left = screen.getByRole("button", { name: "Scroll left" });
    expect(left).toHaveProperty("disabled", true);
    expect(right).toHaveProperty("disabled", false);
    const region = screen.getByRole("region", { name: "Options chain" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(screen.getByText("More columns to the right")).toBeTruthy();

    const scrollBy = vi.fn();
    (region as HTMLElement & { scrollBy: typeof scrollBy }).scrollBy = scrollBy;
    fireEvent.click(right);
    expect(scrollBy).toHaveBeenCalledWith({ left: 1070 * 0.7, behavior: "smooth" });
  });

  it("flips the hint and the buttons at the right-hand end", () => {
    stubWidths(1450, 1070);
    vi.spyOn(HTMLElement.prototype, "scrollLeft", "get").mockReturnValue(380);
    render(<ScrollX><table /></ScrollX>);
    expect(screen.getByRole("button", { name: "Scroll right" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Scroll left" })).toHaveProperty("disabled", false);
    expect(screen.getByText("More columns to the left")).toBeTruthy();
  });
});
