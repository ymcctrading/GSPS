import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RankedSetup } from "@/lib/entitlements/result-selection";
import type { ScanResult } from "@/lib/types";

const {
  retirePlansMock,
  evaluateMonitorMock,
  recordNotificationDeliveryMock,
  dispatchNotificationDeliveryMock,
  getEnabledChannelsMock,
  recordInAppNotificationMock,
} = vi.hoisted(() => ({
  retirePlansMock: vi.fn(),
  evaluateMonitorMock: vi.fn(),
  recordNotificationDeliveryMock: vi.fn(),
  dispatchNotificationDeliveryMock: vi.fn(),
  getEnabledChannelsMock: vi.fn(),
  recordInAppNotificationMock: vi.fn(),
}));

vi.mock("@/lib/lifecycle/retire", () => ({ retirePlansForBrokenStops: retirePlansMock }));
vi.mock("@/lib/entitlements/monitor-store", () => ({ evaluateMonitor: evaluateMonitorMock }));
vi.mock("@/lib/entitlements/delivery", () => ({
  recordNotificationDelivery: recordNotificationDeliveryMock,
  dispatchNotificationDelivery: dispatchNotificationDeliveryMock,
  getEnabledChannels: getEnabledChannelsMock,
  recordInAppNotification: recordInAppNotificationMock,
}));

import { evaluateMonitorsAndNotify } from "@/lib/entitlements/scan-fanout";

function fakeSetup(symbol: string, outputState: "Execute" | "Watch" | "Reject"): RankedSetup<ScanResult> {
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
  retirePlansMock.mockReset();
  retirePlansMock.mockResolvedValue({ authorized: true, retired: 0 });
  evaluateMonitorMock.mockReset();
  recordNotificationDeliveryMock.mockReset();
  dispatchNotificationDeliveryMock.mockReset();
  getEnabledChannelsMock.mockReset();
  recordInAppNotificationMock.mockReset();
  recordInAppNotificationMock.mockResolvedValue(undefined);
});

describe("evaluateMonitorsAndNotify", () => {
  it("reads a resting Execute (entry more than a day's range away) as Watch, and a near one as Execute", async () => {
    evaluateMonitorMock.mockResolvedValue({ outcome: "applied", monitorId: "m1", transitionId: "t1", notify: false });
    const resting = fakeSetup("AMD", "Execute");
    Object.assign(resting.value, { currentPrice: 547.91, dayRange: 20, levels: { entry: 480.46, stopLoss: 467.86, takeProfit1: 498.39 } });
    const near = fakeSetup("MSFT", "Execute");
    Object.assign(near.value, { dayRange: 8 });

    await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "scheduled_morning_scan",
      scanExecutionId: "se1",
      visible: [resting, near],
      rejectedSymbols: new Set(),
      maxActiveWatchMonitors: 15,
    });

    const calls = evaluateMonitorMock.mock.calls.map((c) => [c[1].symbol, c[1].candidateState]);
    expect(calls).toEqual([
      ["AMD", "WATCH"],
      ["MSFT", "EXECUTE"],
    ]);
  });

  it("never arms a monitor for a Reject on the list, so a retired plan can't re-arm and re-invalidate every scan", async () => {
    evaluateMonitorMock.mockResolvedValue({ outcome: "applied", monitorId: "m1", transitionId: "t1", notify: false });

    await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "scheduled_morning_scan",
      scanExecutionId: "se1",
      visible: [fakeSetup("MSFT", "Reject"), fakeSetup("AAPL", "Watch")],
      rejectedSymbols: new Set(["MSFT"]),
      retired: [{ symbol: "MSFT", direction: "bullish", stop: 400, price: 390, reclaimAt: 410 }],
      maxActiveWatchMonitors: 15,
    });

    const calls = evaluateMonitorMock.mock.calls.map((c) => [c[1].symbol, c[1].candidateState]);
    expect(calls).toEqual([
      ["AAPL", "WATCH"],
      ["MSFT", "INVALIDATED"],
    ]);
  });

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

  it("invalidates monitors for rejected symbols whose stop broke, without affecting visible-setup evaluation", async () => {
    evaluateMonitorMock.mockResolvedValue({ outcome: "applied", monitorId: "m2", transitionId: null, notify: false });

    await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "manual_dashboard",
      scanExecutionId: "se1",
      visible: [],
      rejectedSymbols: new Set(["TSLA"]),
      retired: [{ symbol: "TSLA", direction: "bullish", stop: 200, price: 195, reclaimAt: 206 }],
      maxActiveWatchMonitors: 15,
    });

    expect(evaluateMonitorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ symbol: "TSLA", candidateState: "INVALIDATED" }),
    );
  });

  it("reads a Reject with its stop intact as NO_SETUP, never as invalidated (SPY, 2026-10-21)", async () => {
    // A 4-of-9 Watch re-read as 3 at 774 with its stop at 744.12: the plan has
    // not broken, so the member is not told "price broke the level".
    evaluateMonitorMock.mockResolvedValue({ outcome: "applied", monitorId: "m3", transitionId: "t3", notify: false });

    const sent = await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "single_ticker",
      scanExecutionId: "se1",
      visible: [],
      rejectedSymbols: new Set(["SPY"]),
      retired: [],
      maxActiveWatchMonitors: 15,
    });

    expect(sent).toBe(0);
    expect(evaluateMonitorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ symbol: "SPY", candidateState: "NO_SETUP" }),
    );
    expect(recordNotificationDeliveryMock).not.toHaveBeenCalled();
  });

  it("records and dispatches a notification for a tracked setup breaking (WATCH/EXECUTE -> INVALIDATED)", async () => {
    evaluateMonitorMock.mockResolvedValueOnce({
      outcome: "applied",
      monitorId: "m2",
      transitionId: "t2",
      notify: true,
    });
    getEnabledChannelsMock.mockResolvedValueOnce(["email"]);
    recordNotificationDeliveryMock.mockResolvedValueOnce({ recorded: true, deliveryId: "d2" });
    dispatchNotificationDeliveryMock.mockResolvedValueOnce({ dispatched: true, status: "sent" });

    const sentCount = await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "manual_dashboard",
      scanExecutionId: "se1",
      visible: [],
      rejectedSymbols: new Set(["TSLA"]),
      retired: [{ symbol: "TSLA", direction: "bullish", stop: 200, price: 195, reclaimAt: 206 }],
      maxActiveWatchMonitors: 15,
    });

    expect(sentCount).toBe(1);
    expect(recordNotificationDeliveryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        transitionId: "t2",
        channel: "email",
        payload: { symbol: "TSLA", verdict: "INVALIDATED" },
      }),
    );
    expect(dispatchNotificationDeliveryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ deliveryId: "d2" }),
    );
  });

  it("hands the plans the scan retired to the lifecycle, and still invalidates the monitor", async () => {
    evaluateMonitorMock.mockResolvedValueOnce({ outcome: "noop" });
    const retired = [{ symbol: "OXY", direction: "bullish" as const, stop: 55.2, price: 54.1, reclaimAt: 58 }];
    await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "scheduled_morning_scan",
      scanExecutionId: "se1",
      visible: [],
      rejectedSymbols: new Set(["OXY"]),
      retired,
      maxActiveWatchMonitors: 15,
    });
    expect(evaluateMonitorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ symbol: "OXY", candidateState: "INVALIDATED" }),
    );
    expect(retirePlansMock).toHaveBeenCalledWith(expect.anything(), "p1", retired);
  });

  it("does not touch the lifecycle when the scan retired nothing", async () => {
    evaluateMonitorMock.mockResolvedValueOnce({ outcome: "noop" });
    await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "scheduled_morning_scan",
      scanExecutionId: "se1",
      visible: [],
      rejectedSymbols: new Set(["OXY"]),
      maxActiveWatchMonitors: 15,
    });
    expect(retirePlansMock).not.toHaveBeenCalled();
  });

  it("does not let a failed retirement hold up the invalidation notice", async () => {
    evaluateMonitorMock.mockResolvedValueOnce({ outcome: "applied", monitorId: "m1", transitionId: "t9", notify: true });
    retirePlansMock.mockRejectedValueOnce(new Error("db"));
    getEnabledChannelsMock.mockResolvedValueOnce(["email"]);
    recordNotificationDeliveryMock.mockResolvedValueOnce({ recorded: true, deliveryId: "d9" });
    dispatchNotificationDeliveryMock.mockResolvedValueOnce({ dispatched: true, status: "sent" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sent = await evaluateMonitorsAndNotify(insertOnlyClient(), {
      profileId: "p1",
      source: "scheduled_morning_scan",
      scanExecutionId: "se1",
      visible: [],
      rejectedSymbols: new Set(["OXY"]),
      retired: [{ symbol: "OXY", direction: "bullish", stop: 55.2, price: 54.1, reclaimAt: 58 }],
      maxActiveWatchMonitors: 15,
    });
    expect(sent).toBe(1);
    spy.mockRestore();
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
