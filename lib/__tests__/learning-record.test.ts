/**
 * The learning tables were complete and empty. These cover the seam that fills
 * them: that a verdict maps onto the schema without inventing anything, and
 * that a recording failure can never take down the request it was recording.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScanResult } from "@/lib/types";

const recordScanEvent = vi.fn();
const recordSignalLifecycleEvent = vi.fn();
const recordExecutionEvent = vi.fn();

vi.mock("@/lib/learning/db", () => ({
  recordScanEvent: (...args: unknown[]) => recordScanEvent(...args),
  recordSignalLifecycleEvent: (...args: unknown[]) => recordSignalLifecycleEvent(...args),
  recordExecutionEvent: (...args: unknown[]) => recordExecutionEvent(...args),
}));

import {
  brokerStatusFrom,
  numericOrUndefined,
  recordOrderExecution,
  recordScanVerdict,
  toBias,
  toLearningTimeframe,
} from "@/lib/learning/record";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-key";

const scan = (over: Partial<ScanResult> = {}): ScanResult => ({
  symbol: "AAPL",
  assetClass: "us_equity",
  scannedAt: "2026-08-07T14:30:00.000Z",
  currentPrice: 200,
  direction: "bullish",
  setupKind: "reversion",
  momentumElevated: true,
  trends: [
    { timeframe: "1Day", direction: "bearish", support: [], resistance: [] },
    { timeframe: "1Hour", direction: "sideways", support: [], resistance: [] },
  ],
  gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
  pattern: {
    name: "2-1-2",
    direction: "bullish",
    triggerPrice: 201,
    stopPrice: 199,
    description: "",
  },
  armedPatterns: [],
  levels: null,
  decision: {
    score: 7.4,
    outputState: "Watch",
    breakdown: [
      { key: "macroTrend", criterion: "Macro", pillar: "trend", passed: true, note: "" },
      { key: "momentum", criterion: "Momentum", pillar: "setup", passed: false, note: "" },
    ],
  },
  ...over,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("vocabulary mapping", () => {
  it("translates app timeframes into the learning schema's", () => {
    expect(toLearningTimeframe("15Min")).toBe("15m");
    expect(toLearningTimeframe("1Day")).toBe("1d");
    expect(toLearningTimeframe("1Month")).toBe("1mo");
  });

  it("maps a direction onto a bias", () => {
    expect(toBias("bullish")).toBe("bull");
    expect(toBias("bearish")).toBe("bear");
    expect(toBias("none")).toBe("neutral");
  });

  it("reads a broker status through the one normalizer", () => {
    expect(brokerStatusFrom("filled")).toBe("filled");
    expect(brokerStatusFrom("partially_filled")).toBe("partial");
    expect(brokerStatusFrom("canceled")).toBe("cancelled");
    expect(brokerStatusFrom("something_new")).toBe("error");
  });

  it("leaves an absent broker number absent rather than zero", () => {
    expect(numericOrUndefined(null)).toBeUndefined();
    expect(numericOrUndefined("")).toBeUndefined();
    expect(numericOrUndefined("12.5")).toBe(12.5);
  });
});

describe("recordScanVerdict", () => {
  it("records the verdict a user was shown", async () => {
    recordScanEvent.mockResolvedValue({ id: "scan-row" });
    await recordScanVerdict("user-1", scan(), { timeframe: "15Min" });

    expect(recordScanEvent).toHaveBeenCalledTimes(1);
    const [userId, event] = recordScanEvent.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(event.symbol).toBe("AAPL");
    expect(event.timeframe).toBe("15m");
    expect(event.detail.output_state).toBe("Watch");
  });

  it("rounds the stored score but keeps the exact one", async () => {
    // The column is an integer; a weighted score is not. Losing the fraction to
    // the cast without recording it anywhere would make the row unusable for
    // exactly the study the weights came from.
    recordScanEvent.mockResolvedValue({ id: "scan-row" });
    await recordScanVerdict("user-1", scan(), { timeframe: "15Min" });

    const [, event] = recordScanEvent.mock.calls[0];
    expect(event.score).toBe(7);
    expect(event.detail.exact_score).toBe(7.4);
  });

  it("records a per-timeframe direction without inventing a per-timeframe score", async () => {
    recordScanEvent.mockResolvedValue({ id: "scan-row" });
    await recordScanVerdict("user-1", scan(), { timeframe: "15Min" });

    const [, event] = recordScanEvent.mock.calls[0];
    expect(event.higher_tf_context).toEqual([
      { timeframe: "1d", bias: "bear" },
      { timeframe: "1h", bias: "neutral" },
    ]);
  });

  it("opens the signal's lifecycle when a pattern is armed", async () => {
    recordScanEvent.mockResolvedValue({ id: "scan-row" });
    await recordScanVerdict("user-1", scan(), { timeframe: "15Min" });

    expect(recordSignalLifecycleEvent).toHaveBeenCalledTimes(1);
    const [, event] = recordSignalLifecycleEvent.mock.calls[0];
    expect(event.state).toBe("armed");
    expect(event.scan_event_id).toBe("scan-row");
  });

  it("records nothing for a failed scan — there is no verdict to learn from", async () => {
    await recordScanVerdict("user-1", scan({ error: "rate limited" }), { timeframe: "15Min" });
    expect(recordScanEvent).not.toHaveBeenCalled();
  });

  it("swallows a database failure instead of failing the scan", async () => {
    recordScanEvent.mockRejectedValue(new Error("relation does not exist"));
    await expect(
      recordScanVerdict("user-1", scan(), { timeframe: "15Min" }),
    ).resolves.toBeNull();
  });
});

describe("recordOrderExecution", () => {
  it("records a fill with its slippage against the requested price", async () => {
    recordExecutionEvent.mockResolvedValue({ id: "exec-row" });
    await recordOrderExecution("user-1", {
      symbol: "aapl",
      assetClass: "us_equity",
      orderType: "limit",
      side: "buy",
      quantity: 10,
      requestedPrice: 200,
      filledPrice: 200.4,
      filledQty: 10,
      brokerStatus: "filled",
    });

    const [, event] = recordExecutionEvent.mock.calls[0];
    expect(event.symbol).toBe("AAPL");
    expect(event.slippage).toBeCloseTo(0.4, 10);
    expect(event.partial_fill).toBe(false);
  });

  it("leaves slippage empty on a market order, which has nothing to miss", async () => {
    recordExecutionEvent.mockResolvedValue({ id: "exec-row" });
    await recordOrderExecution("user-1", {
      symbol: "AAPL",
      assetClass: "us_equity",
      orderType: "market",
      side: "buy",
      quantity: 10,
      filledPrice: 200.4,
      brokerStatus: "filled",
    });

    const [, event] = recordExecutionEvent.mock.calls[0];
    expect(event.slippage).toBeUndefined();
  });

  it("flags a partial fill", async () => {
    recordExecutionEvent.mockResolvedValue({ id: "exec-row" });
    await recordOrderExecution("user-1", {
      symbol: "AAPL",
      assetClass: "us_equity",
      orderType: "limit",
      side: "buy",
      quantity: 10,
      filledQty: 4,
      brokerStatus: "partial",
    });

    const [, event] = recordExecutionEvent.mock.calls[0];
    expect(event.partial_fill).toBe(true);
  });

  it("records a rejection — the refused orders are part of the sample", async () => {
    recordExecutionEvent.mockResolvedValue({ id: "exec-row" });
    await recordOrderExecution("user-1", {
      symbol: "GPUS",
      assetClass: "us_equity",
      orderType: "market",
      side: "sell",
      quantity: 10,
      brokerStatus: "rejected",
      brokerErrorCode: "short_not_allowed",
      brokerErrorMsg: "not shortable",
    });

    const [, event] = recordExecutionEvent.mock.calls[0];
    expect(event.broker_status).toBe("rejected");
    expect(event.broker_error_code).toBe("short_not_allowed");
  });

  it("swallows a database failure instead of failing the order", async () => {
    recordExecutionEvent.mockRejectedValue(new Error("insert failed"));
    await expect(
      recordOrderExecution("user-1", {
        symbol: "AAPL",
        assetClass: "us_equity",
        orderType: "market",
        side: "buy",
        quantity: 1,
        brokerStatus: "filled",
      }),
    ).resolves.toBeUndefined();
  });
});
