import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RankedSetup } from "@/lib/entitlements/result-selection";
import type { ScanResult } from "@/lib/types";

const { evaluateMonitorMock, recordNotificationDeliveryMock, dispatchNotificationDeliveryMock, getEnabledChannelsMock } = vi.hoisted(() => ({
  evaluateMonitorMock: vi.fn(),
  recordNotificationDeliveryMock: vi.fn(),
  dispatchNotificationDeliveryMock: vi.fn(),
  getEnabledChannelsMock: vi.fn(),
}));

vi.mock("@/lib/entitlements/monitor-store", () => ({ evaluateMonitor: evaluateMonitorMock }));
vi.mock("@/lib/entitlements/delivery", () => ({
  recordNotificationDelivery: recordNotificationDeliveryMock,
  dispatchNotificationDelivery: dispatchNotificationDeliveryMock,
  getEnabledChannels: getEnabledChannelsMock,
}));

import { evaluateMonitorsAndNotify } from "@/lib/entitlements/scan-fanout";

function fakeSetup(symbol: string, outputState: "Execute" | "Watch"): RankedSetup<ScanResult> {
  return {
    side: "buy",
    rank: 8,
    value: {
      symbol,
      decision: { outputState, score: 8 },
      levels: { entry: 100, stopLoss: 95, takeProfit1: 110 },
      currentPrice: 100,
    } as unknown as ScanResult,
  };
}

function insertOnlyClient() {
  return { from: () => ({ insert: () => Promise.resolve({ data: null, error: null }) }) } as unknown as SupabaseClient;
}

beforeEach(() => {
  evaluateMonitorMock.mockReset();
  recordNotificationDeliveryMock.mockReset();
  dispatchNotificationDeliveryMock.mockReset();
  getEnabledChannelsMock.mockReset();
});

describe("evaluateMonitorsAndNotify", () => {
  it("records and dispatches a notification for a confirmed WATCH -> EXECUTE transition", async () => {
    evaluateMonitorMock.mockResolvedValueOnce({
      outcome: "applied",
      monitorId: "m1",
      transitionId: "t1",
      notify: true,
    });
    getEnabledChannelsMock.mockResolvedValueOnce(["email"]);
    recordNotificationDeliveryMock.mockResolvedValueOnce({ recorded: true, deliveryId: "d1" });
    dispatchNotificationDeliveryMock.mockResolvedValueOnce({ dispatched: true, status: "sent" });

    const sentCount = await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "scheduled_morning_scan",
      scanExecutionId: "se1",
      visible: [fakeSetup("AAPL", "Execute")],
      rejectedSymbols: new Set(),
      maxActiveWatchMonitors: 15,
    });

    expect(sentCount).toBe(1);
    expect(recordNotificationDeliveryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        transitionId: "t1",
        channel: "email",
        payload: expect.objectContaining({ symbol: "AAPL", direction: "bullish" }),
      }),
    );
    expect(dispatchNotificationDeliveryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ deliveryId: "d1" }),
    );
  });

  it("attaches the Signal and Regime Engine's rollup as informational context, without it affecting the trigger", async () => {
    evaluateMonitorMock.mockResolvedValueOnce({
      outcome: "applied",
      monitorId: "m1",
      transitionId: "t1",
      notify: true,
    });
    getEnabledChannelsMock.mockResolvedValueOnce(["email"]);
    recordNotificationDeliveryMock.mockResolvedValueOnce({ recorded: true, deliveryId: "d1" });
    dispatchNotificationDeliveryMock.mockResolvedValueOnce({ dispatched: true, status: "sent" });

    const setup = fakeSetup("AAPL", "Execute");
    (setup.value as unknown as { signals: unknown }).signals = {
      regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
      trendPullback: {
        status: "evaluated",
        state: "trendPullback",
        regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
        alignment: { score: 88, tier: "aTier", breakdown: [] },
        tradeable: true,
        plan: null,
        expiresAfterBars: 5,
        accountContextAssumed: true,
      },
      trendBreakout: null,
      confirmedReversal: null,
      rangeReversion: null,
    };

    await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "scheduled_morning_scan",
      scanExecutionId: "se1",
      visible: [setup],
      rejectedSymbols: new Set(),
      maxActiveWatchMonitors: 15,
    });

    expect(recordNotificationDeliveryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({
          signal: expect.objectContaining({ state: "trendPullback", tier: "aTier", tradeable: true }),
        }),
      }),
    );
  });

  it("does not notify on a non-transitioning evaluation", async () => {
    evaluateMonitorMock.mockResolvedValueOnce({ outcome: "applied", monitorId: "m1", transitionId: null, notify: false });

    const sentCount = await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "scheduled_morning_scan",
      scanExecutionId: "se1",
      visible: [fakeSetup("AAPL", "Watch")],
      rejectedSymbols: new Set(),
      maxActiveWatchMonitors: 15,
    });

    expect(sentCount).toBe(0);
    expect(recordNotificationDeliveryMock).not.toHaveBeenCalled();
  });

  it("invalidates monitors for rejected symbols without affecting visible-setup evaluation", async () => {
    evaluateMonitorMock.mockResolvedValue({ outcome: "applied", monitorId: "m2", transitionId: null, notify: false });

    await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "manual_dashboard",
      scanExecutionId: "se1",
      visible: [],
      rejectedSymbols: new Set(["TSLA"]),
      maxActiveWatchMonitors: 15,
    });

    expect(evaluateMonitorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ symbol: "TSLA", candidateState: "INVALIDATED" }),
    );
  });

  it("does not throw when a single profile's monitor evaluation fails", async () => {
    evaluateMonitorMock.mockRejectedValueOnce(new Error("db down"));

    await expect(
      evaluateMonitorsAndNotify(insertOnlyClient(), {
        profileId: "p1",
        source: "scheduled_morning_scan",
        scanExecutionId: "se1",
        visible: [fakeSetup("AAPL", "Execute")],
        rejectedSymbols: new Set(),
        maxActiveWatchMonitors: 15,
      }),
    ).resolves.toBe(0);
  });
});
