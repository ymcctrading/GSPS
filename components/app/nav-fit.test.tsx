/** The top bar keeps what fits and lists the rest under "More". */

import { describe, it, expect } from "vitest";
import { fitCount } from "./nav-fit";

describe("fitCount", () => {
  it("keeps every item when they all fit, with no room set aside for More", () => {
    // 3 × 100 + 2 gaps of 4 = 308.
    expect(fitCount([100, 100, 100], 308, 80)).toBe(3);
  });

  it("sets the More button aside once anything overflows", () => {
    // 307 is one pixel short of all three; then More (80) + 4 + 100 + 4 + 100 = 288 fits two.
    expect(fitCount([100, 100, 100], 307, 80)).toBe(2);
    expect(fitCount([100, 100, 100], 288, 80)).toBe(2);
    expect(fitCount([100, 100, 100], 287, 80)).toBe(1);
  });

  it("keeps the order: an item never jumps ahead of a wider one before it", () => {
    expect(fitCount([200, 50, 50], 250, 40)).toBe(1);
  });

  it("puts everything under More when the bar has no room (hidden below md)", () => {
    expect(fitCount([100, 100], 0, 80)).toBe(0);
  });

  it("handles no items", () => {
    expect(fitCount([], 0, 80)).toBe(0);
  });
});
