import { describe, it, expect } from "vitest";
import {
  deriveOpenedAt,
  deriveOpenedAtBySymbol,
  formatOpenedAt,
  OPENED_AT_UNAVAILABLE,
  type Execution,
} from "@/lib/portfolio/opened-at";

function fill(
  filledAt: string,
  side: "buy" | "sell",
  filledQty: number,
  symbol = "AAPL",
): Execution {
  return { symbol, side, filledQty, filledAt };
}

describe("deriveOpenedAt", () => {
  it("uses the fill that opened the position, not a later scale-in", () => {
    const { openedAt, reason } = deriveOpenedAt(
      [fill("2026-08-07T14:14:00Z", "buy", 50), fill("2026-08-07T18:02:00Z", "buy", 50)],
      100,
    );
    expect(reason).toBe("derived");
    expect(openedAt).toBe("2026-08-07T14:14:00Z");
  });

  it("keeps the original timestamp across partial fills of one order", () => {
    const { openedAt } = deriveOpenedAt(
      [
        fill("2026-08-07T14:14:00Z", "buy", 10),
        fill("2026-08-07T14:14:30Z", "buy", 40),
        fill("2026-08-07T14:15:00Z", "buy", 50),
      ],
      100,
    );
    expect(openedAt).toBe("2026-08-07T14:14:00Z");
  });

  it("keeps the original timestamp when a scale-out leaves the position open", () => {
    const { openedAt } = deriveOpenedAt(
      [fill("2026-08-05T14:00:00Z", "buy", 100), fill("2026-08-06T15:00:00Z", "sell", 40)],
      60,
    );
    expect(openedAt).toBe("2026-08-05T14:00:00Z");
  });

  it("starts a new timestamp after the position goes flat and is reopened", () => {
    const { openedAt } = deriveOpenedAt(
      [
        fill("2026-08-03T14:00:00Z", "buy", 100),
        fill("2026-08-04T15:00:00Z", "sell", 100),
        fill("2026-08-07T14:31:00Z", "buy", 25),
      ],
      25,
    );
    expect(openedAt).toBe("2026-08-07T14:31:00Z");
  });

  it("treats a fill that reverses through zero as opening the new position", () => {
    const { openedAt } = deriveOpenedAt(
      [fill("2026-08-03T14:00:00Z", "buy", 100), fill("2026-08-07T16:00:00Z", "sell", 150)],
      -50,
    );
    expect(openedAt).toBe("2026-08-07T16:00:00Z");
  });

  it("derives a short position's open from its first sell", () => {
    const { openedAt, reason } = deriveOpenedAt(
      [fill("2026-08-07T14:00:00Z", "sell", 30), fill("2026-08-07T15:00:00Z", "sell", 20)],
      -50,
    );
    expect(reason).toBe("derived");
    expect(openedAt).toBe("2026-08-07T14:00:00Z");
  });

  it("reports insufficient history rather than guessing when the replay doesn't reach the held quantity", () => {
    // The broker says 100 shares are held but only a 40-share fill is inside
    // the history window: the position started before the window opened.
    const { openedAt, reason } = deriveOpenedAt([fill("2026-08-07T14:00:00Z", "buy", 40)], 100);
    expect(openedAt).toBeNull();
    expect(reason).toBe("insufficient-history");
  });

  it("reports insufficient history when the visible fills net to flat but a position is held", () => {
    const { reason } = deriveOpenedAt(
      [fill("2026-08-06T14:00:00Z", "buy", 50), fill("2026-08-06T18:00:00Z", "sell", 50)],
      50,
    );
    expect(reason).toBe("insufficient-history");
  });

  it("reports no executions when the history is empty", () => {
    expect(deriveOpenedAt([], 100).reason).toBe("no-executions");
  });

  it("ignores zero-quantity and undated executions", () => {
    const { openedAt } = deriveOpenedAt(
      [
        { symbol: "AAPL", side: "buy", filledQty: 0, filledAt: "2026-08-01T14:00:00Z" },
        { symbol: "AAPL", side: "buy", filledQty: 10, filledAt: "" },
        fill("2026-08-07T14:00:00Z", "buy", 100),
      ],
      100,
    );
    expect(openedAt).toBe("2026-08-07T14:00:00Z");
  });

  it("sorts by fill time regardless of the order the broker returned them in", () => {
    const { openedAt } = deriveOpenedAt(
      [fill("2026-08-07T18:02:00Z", "buy", 50), fill("2026-08-07T14:14:00Z", "buy", 50)],
      100,
    );
    expect(openedAt).toBe("2026-08-07T14:14:00Z");
  });

  it("applies the closing side first when a flatten and a reopen share a timestamp", () => {
    const { openedAt } = deriveOpenedAt(
      [fill("2026-08-07T14:00:00Z", "buy", 10), fill("2026-08-07T14:00:00Z", "sell", 10)],
      0,
    );
    // Net flat — nothing is held, so there is no open run to timestamp.
    expect(openedAt).toBeNull();
  });
});

describe("deriveOpenedAtBySymbol", () => {
  it("keeps each symbol's execution history separate", () => {
    const executions = [
      fill("2026-08-05T14:00:00Z", "buy", 100, "AAPL"),
      fill("2026-08-07T14:31:00Z", "buy", 2, "NVDA260918C00150000"),
    ];
    const result = deriveOpenedAtBySymbol(
      executions,
      new Map([
        ["AAPL", 100],
        ["NVDA260918C00150000", 2],
      ]),
    );
    expect(result.get("AAPL")?.openedAt).toBe("2026-08-05T14:00:00Z");
    expect(result.get("NVDA260918C00150000")?.openedAt).toBe("2026-08-07T14:31:00Z");
  });

  it("matches symbols case-insensitively", () => {
    const result = deriveOpenedAtBySymbol(
      [fill("2026-08-05T14:00:00Z", "buy", 100, "aapl")],
      new Map([["AAPL", 100]]),
    );
    expect(result.get("AAPL")?.reason).toBe("derived");
  });

  it("reports a held symbol with no executions rather than omitting it", () => {
    const result = deriveOpenedAtBySymbol([], new Map([["TSLA", 5]]));
    expect(result.get("TSLA")).toEqual({ openedAt: null, reason: "no-executions" });
  });
});

describe("formatOpenedAt", () => {
  it("renders Eastern time with the zone named", () => {
    // 14:14 UTC on 2026-08-07 is 10:14 EDT.
    expect(formatOpenedAt("2026-08-07T14:14:00Z")).toBe("Aug 7, 2026 · 10:14 AM ET");
  });

  it("renders a winter fill against standard time, not daylight time", () => {
    // 15:14 UTC on 2026-01-07 is 10:14 EST.
    expect(formatOpenedAt("2026-01-07T15:14:00Z")).toBe("Jan 7, 2026 · 10:14 AM ET");
  });

  it("says the data is missing rather than inventing a timestamp", () => {
    expect(formatOpenedAt(null)).toBe(OPENED_AT_UNAVAILABLE);
    expect(formatOpenedAt("not a date")).toBe(OPENED_AT_UNAVAILABLE);
  });
});
