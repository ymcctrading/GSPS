import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

// A count whose source names its turn (the time balance's, the 7th/14th/21st
// day's) opens only for that turn; a count from a pivot opens for both.
vi.mock("@/lib/gann/countWindows", async (orig) => ({
  ...(await orig<typeof import("@/lib/gann/countWindows")>()),
  countWindowsAt: () => [
    { rule: "C-TIME-18", label: "day 14 from the last swing, a date for a high", from: null, turn: "top" },
    { rule: "C-TIME-06", label: "30 days from the 2026-01-31 low, a count of the circle", from: "low", turn: null },
  ],
}));

const { timeWindowsAt } = await import("@/lib/gann/timeWindow");
const bars: Bar[] = [{ t: "2026-03-02T00:00:00.000Z", o: 100, h: 101, l: 99, c: 100, v: 1e6 }];

describe("timeWindowsAt reads the count windows' polarity from their source only", () => {
  it("opens a named top for a top, not a bottom", () => {
    expect(timeWindowsAt(bars, "2026-03-02", "top")).toContain("day 14 from the last swing, a date for a high");
    expect(timeWindowsAt(bars, "2026-03-02", "bottom")).not.toContain("day 14 from the last swing, a date for a high");
  });

  it("opens a count from a low for both turns", () => {
    for (const kind of ["bottom", "top"] as const) {
      expect(timeWindowsAt(bars, "2026-03-02", kind)).toContain("30 days from the 2026-01-31 low, a count of the circle");
    }
  });
});
