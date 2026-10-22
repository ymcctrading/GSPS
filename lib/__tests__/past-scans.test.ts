import { describe, it, expect } from "vitest";
import {
  changeBetween,
  comparePastScans,
  earliestReadableDate,
  forwardFor,
  forwardTestByVersion,
  type ForwardTestRow,
  type PastScanRow,
} from "@/lib/scanner/pastScans";

function row(overrides: Partial<PastScanRow> = {}): PastScanRow {
  return {
    symbol: "AAPL",
    direction: "bullish",
    rank: 1,
    state: "Watch",
    score: 5,
    entry: 100,
    stopLoss: 95,
    takeProfit1: 110,
    masterProfit: 120,
    strategyVersion: "v1",
    ...overrides,
  };
}

function fwd(overrides: Partial<ForwardTestRow> = {}): ForwardTestRow {
  return {
    symbol: "AAPL",
    direction: "bullish",
    sessionDate: "2026-10-20",
    scannedAt: "2026-10-20T13:00:00Z",
    entry: 100,
    outcome: "win",
    rMultiple: 1.5,
    barsHeld: 3,
    fillPrice: 100,
    strategyVersion: "v1",
    ...overrides,
  };
}

describe("changeBetween", () => {
  it("names each change", () => {
    expect(changeBetween(null, row())).toBe("new");
    expect(changeBetween(row(), null)).toBe("gone");
    expect(changeBetween(row(), row())).toBe("same");
    expect(changeBetween(row(), row({ state: "Execute" }))).toBe("to_execute");
    expect(changeBetween(row({ state: "Execute" }), row())).toBe("to_watch");
    expect(changeBetween(row(), row({ state: "Reject" }))).toBe("to_reject");
  });
});

describe("forwardFor", () => {
  it("reads only an Execute, on its own session and direction, the recording with the list's entry", () => {
    const later = fwd({ scannedAt: "2026-10-20T15:00:00Z", entry: 101, rMultiple: -1 });
    const first = fwd({ scannedAt: "2026-10-20T13:00:00Z" });
    const execute = row({ state: "Execute" });
    expect(forwardFor(execute, "2026-10-20", [later, first])).toBe(first);
    // No recording with the list's entry: the session's latest, as the list is its last run.
    expect(forwardFor(row({ state: "Execute", entry: 99 }), "2026-10-20", [first, later])).toBe(later);
    expect(forwardFor(row(), "2026-10-20", [first])).toBeNull();
    expect(forwardFor(execute, "2026-10-21", [first])).toBeNull();
    expect(forwardFor(execute, "2026-10-20", [fwd({ direction: "bearish" })])).toBeNull();
    expect(forwardFor(null, "2026-10-20", [first])).toBeNull();
  });
});

describe("comparePastScans", () => {
  it("lines up both days, keeps directions apart and finds the later Execute", () => {
    const compared = comparePastScans({
      earlierDate: "2026-10-20",
      laterDate: "2026-10-22",
      earlier: [
        row({ symbol: "AAPL", state: "Watch" }),
        row({ symbol: "MSFT", state: "Execute", rank: 2 }),
        row({ symbol: "XOM", direction: "bearish", state: "Watch" }),
      ],
      later: [row({ symbol: "AAPL", state: "Watch" }), row({ symbol: "NVDA", state: "Execute", rank: 3 })],
      between: [
        { date: "2026-10-20", rows: [row({ symbol: "AAPL", state: "Execute" })] },
        { date: "2026-10-21", rows: [row({ symbol: "AAPL", state: "Execute" }), row({ symbol: "XOM", state: "Execute" })] },
        // The later session itself is not "caught later": it shows as Now Execute.
        { date: "2026-10-22", rows: [row({ symbol: "XOM", direction: "bearish", state: "Execute" })] },
      ],
      forward: [fwd({ symbol: "MSFT" })],
    });

    expect(compared.map((c) => `${c.symbol}:${c.direction}`)).toEqual([
      "NVDA:bullish",
      "AAPL:bullish",
      "MSFT:bullish",
      "XOM:bearish",
    ]);
    const bySymbol = Object.fromEntries(compared.map((c) => [c.symbol, c]));
    expect(bySymbol.NVDA.change).toBe("new");
    expect(bySymbol.MSFT.change).toBe("gone");
    expect(bySymbol.MSFT.earlierForward?.rMultiple).toBe(1.5);
    expect(bySymbol.AAPL.change).toBe("same");
    // The earlier day itself never counts as "later": the 21st is.
    expect(bySymbol.AAPL.executeOn).toBe("2026-10-21");
    // A bullish Execute is not the bearish Watch's turn.
    expect(bySymbol.XOM.executeOn).toBeNull();
  });
});

describe("forwardTestByVersion", () => {
  it("keeps versions apart and counts only filled trades in the mean", () => {
    const groups = forwardTestByVersion([
      fwd({ outcome: "win", rMultiple: 2, sessionDate: "2026-10-20" }),
      // The same call recorded again by a second run that session: counted once.
      fwd({ outcome: "win", rMultiple: 2, sessionDate: "2026-10-20", scannedAt: "2026-10-20T21:00:00Z" }),
      fwd({ symbol: "MSFT", outcome: "loss", rMultiple: -1, sessionDate: "2026-10-21" }),
      fwd({ symbol: "META", outcome: "expired", rMultiple: null, fillPrice: null }),
      fwd({ symbol: "BP", outcome: null, rMultiple: null, sessionDate: "2026-10-22", fillPrice: null }),
      // Walked by the evaluator before R-032: no fill price, not counted.
      fwd({ symbol: "SHOP", outcome: "win", rMultiple: 2.2, sessionDate: "2026-10-21", fillPrice: null }),
      fwd({ strategyVersion: "v0", outcome: "timeout", rMultiple: 0.5, sessionDate: "2026-10-01" }),
    ]);
    expect(groups.map((g) => g.strategyVersion)).toEqual(["v1", "v0"]);
    expect(groups[0]).toMatchObject({ trades: 2, wins: 1, meanR: 0.5, notFilled: 1, pending: 1, earlierRules: 1 });
    expect(groups[0].firstSession).toBe("2026-10-20");
    expect(groups[0].lastSession).toBe("2026-10-22");
    expect(groups[1]).toMatchObject({ trades: 1, wins: 0, meanR: 0.5 });
  });

  it("gives no mean with no filled trade", () => {
    expect(forwardTestByVersion([fwd({ outcome: "retired", rMultiple: null, fillPrice: null })])[0].meanR).toBeNull();
  });
});

describe("earliestReadableDate", () => {
  it("counts the tier's retention back from today", () => {
    expect(earliestReadableDate("2026-10-22", 30)).toBe("2026-09-22");
    expect(earliestReadableDate("2026-10-22", "unlimited")).toBeNull();
  });
});
