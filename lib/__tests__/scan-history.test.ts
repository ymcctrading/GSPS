import { describe, it, expect } from "vitest";
import { buildHistorySymbol, monitorMatchesScannedState } from "@/lib/scanner/history";

function symbol(overrides: Partial<Parameters<typeof buildHistorySymbol>[0]> = {}) {
  return buildHistorySymbol({
    symbol: "AAPL",
    assetClass: "us_equity",
    direction: "bullish",
    scannedState: "Watch",
    score: 5,
    entry: 100,
    stopLoss: 95,
    takeProfit1: 110,
    masterProfit: 120,
    currentState: null,
    currentStateAsOf: null,
    ...overrides,
  });
}

describe("monitorMatchesScannedState", () => {
  it("EXECUTE only matches a scanned Execute", () => {
    expect(monitorMatchesScannedState("EXECUTE", "Execute")).toBe(true);
    expect(monitorMatchesScannedState("EXECUTE", "Watch")).toBe(false);
    expect(monitorMatchesScannedState("EXECUTE", "Reject")).toBe(false);
  });

  it("WATCH only matches a scanned Watch", () => {
    expect(monitorMatchesScannedState("WATCH", "Watch")).toBe(true);
    expect(monitorMatchesScannedState("WATCH", "Execute")).toBe(false);
    expect(monitorMatchesScannedState("WATCH", "Reject")).toBe(false);
  });

  it("INVALIDATED, NO_SETUP, and EXPIRED all read as 'no longer live', matching only a scanned Reject", () => {
    for (const state of ["INVALIDATED", "NO_SETUP", "EXPIRED"] as const) {
      expect(monitorMatchesScannedState(state, "Reject")).toBe(true);
      expect(monitorMatchesScannedState(state, "Watch")).toBe(false);
      expect(monitorMatchesScannedState(state, "Execute")).toBe(false);
    }
  });
});

describe("buildHistorySymbol", () => {
  it("reports changed: null when no monitor has ever tracked the symbol", () => {
    const s = symbol({ scannedState: "Reject", currentState: null });
    expect(s.changed).toBeNull();
    expect(s.currentState).toBeNull();
  });

  it("reports changed: false when the current monitor state agrees with what was scanned", () => {
    const s = symbol({ scannedState: "Watch", currentState: "WATCH", currentStateAsOf: "2026-08-27T00:00:00Z" });
    expect(s.changed).toBe(false);
  });

  it("reports changed: true when a Watch has since become an Execute", () => {
    const s = symbol({ scannedState: "Watch", currentState: "EXECUTE", currentStateAsOf: "2026-08-27T00:00:00Z" });
    expect(s.changed).toBe(true);
  });

  it("reports changed: true when an Execute has since expired", () => {
    const s = symbol({ scannedState: "Execute", currentState: "EXPIRED", currentStateAsOf: "2026-08-27T00:00:00Z" });
    expect(s.changed).toBe(true);
  });

  it("reports changed: false when a Reject stays untracked-but-consistent (no_setup)", () => {
    const s = symbol({ scannedState: "Reject", currentState: "NO_SETUP", currentStateAsOf: "2026-08-27T00:00:00Z" });
    expect(s.changed).toBe(false);
  });
});
