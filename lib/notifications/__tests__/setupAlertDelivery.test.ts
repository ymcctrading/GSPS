import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RankedSetup } from "@/lib/entitlements/result-selection";
import type { ScanResult } from "@/lib/types";

// Delivery tests for a setup alert's email and push (Q1 item 15 part 2): who
// gets a channel, one delivery per channel, and a repeat sending nothing. The
// send itself (score floor, quiet hours, push age, preview) is held by
// lib/entitlements/__tests__/delivery.test.ts; the channel list is the
// opt-in RPC (migration 0109), stubbed here as the member's answer.

const { evaluateMonitorMock, recordMock, dispatchMock, channelsMock, inAppMock, policyMock } = vi.hoisted(() => ({
  evaluateMonitorMock: vi.fn(),
  recordMock: vi.fn(),
  dispatchMock: vi.fn(),
  channelsMock: vi.fn(),
  inAppMock: vi.fn(),
  policyMock: vi.fn(),
}));
vi.mock("@/lib/lifecycle/retire", () => ({ retirePlansForBrokenStops: vi.fn().mockResolvedValue({ authorized: true, retired: 0 }) }));
vi.mock("@/lib/lifecycle/advanceConfirmation", () => ({ advanceEntryConfirmationForSymbol: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/lifecycle/fromScanResult", () => ({ buildNewTradePlanFromScanResult: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/lifecycle/store", () => ({
  createOrGetIdempotentTradePlan: vi.fn().mockResolvedValue({ plan: null, created: false }),
  applyEventAndPersist: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/entitlements/monitor-store", () => ({ evaluateMonitor: evaluateMonitorMock }));
vi.mock("@/lib/entitlements/delivery", () => ({
  recordNotificationDelivery: recordMock,
  dispatchNotificationDelivery: dispatchMock,
  getEnabledChannels: channelsMock,
  recordInAppNotification: inAppMock,
}));
vi.mock("@/lib/entitlements/policy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entitlements/policy")>()),
  getUserEntitlementPolicy: policyMock,
}));

import { evaluateMonitorsAndNotify } from "@/lib/entitlements/scan-fanout";

function setup(symbol: string): RankedSetup<ScanResult> {
  return {
    side: "buy",
    rank: 8,
    value: {
      symbol,
      decision: { outputState: "Execute", score: 7.5 },
      levels: { entry: 100, stopLoss: 95, takeProfit1: 110 },
      currentPrice: 100,
    } as unknown as ScanResult,
  };
}

const client = { from: () => ({ insert: () => Promise.resolve({ data: null, error: null }) }) } as unknown as SupabaseClient;
const run = (visible = [setup("AAPL")]) =>
  evaluateMonitorsAndNotify(client, {
    profileId: "p1",
    source: "scheduled_morning_scan",
    scanExecutionId: "se1",
    visible,
    rejectedSymbols: new Set(),
    maxActiveWatchMonitors: 15,
  });

beforeEach(() => {
  for (const m of [evaluateMonitorMock, recordMock, dispatchMock, channelsMock, inAppMock, policyMock]) m.mockReset();
  evaluateMonitorMock.mockResolvedValue({ outcome: "applied", monitorId: "m1", transitionId: "t1", notify: true });
  inAppMock.mockResolvedValue(undefined);
  policyMock.mockResolvedValue({ exactScoreDisplayEnabled: true });
  let n = 0;
  recordMock.mockImplementation(() => Promise.resolve({ recorded: true, deliveryId: `d${++n}` }));
  dispatchMock.mockResolvedValue({ dispatched: true, status: "sent" });
});

describe("setup alert delivery", () => {
  it("sends no email or push to a member who turned neither on, and still writes the bell", async () => {
    channelsMock.mockResolvedValue([]);
    expect(await run()).toBe(0);
    expect(recordMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(inAppMock).toHaveBeenCalledTimes(1);
  });

  it("records and sends one delivery per channel the member turned on, each under its own key", async () => {
    channelsMock.mockResolvedValue(["email", "push"]);
    expect(await run()).toBe(2);
    expect(recordMock.mock.calls.map((c) => [c[1].channel, c[1].idempotencyKey])).toEqual([
      ["email", "t1:email"],
      ["push", "t1:push"],
    ]);
    expect(dispatchMock.mock.calls.map((c) => c[1].deliveryId)).toEqual(["d1", "d2"]);
  });

  it("sends push alone to a member who turned only push on", async () => {
    channelsMock.mockResolvedValue(["push"]);
    expect(await run()).toBe(1);
    expect(recordMock.mock.calls.map((c) => c[1].channel)).toEqual(["push"]);
  });

  it("sends nothing again for a transition already recorded on that channel, and the other channel still goes", async () => {
    channelsMock.mockResolvedValue(["email", "push"]);
    recordMock.mockReset();
    recordMock
      .mockResolvedValueOnce({ recorded: false, deliveryId: null })
      .mockResolvedValueOnce({ recorded: true, deliveryId: "d2" });
    expect(await run()).toBe(1);
    expect(dispatchMock.mock.calls.map((c) => c[1].deliveryId)).toEqual(["d2"]);
  });

  it("counts only sends that went out: a held or failed send is not a send", async () => {
    channelsMock.mockResolvedValue(["email", "push"]);
    dispatchMock
      .mockResolvedValueOnce({ dispatched: true, status: "skipped" })
      .mockResolvedValueOnce({ dispatched: true, status: "failed" });
    expect(await run()).toBe(0);
  });

  it("shows the score at the member's tier precision", async () => {
    channelsMock.mockResolvedValue(["email"]);
    policyMock.mockResolvedValue({ exactScoreDisplayEnabled: false });
    await run();
    expect(recordMock.mock.calls[0][1].payload).toMatchObject({ symbol: "AAPL", score: 7.5, exactScoreDisplayEnabled: false });
  });

  it("falls back to the rounded score when the member's tier cannot be read", async () => {
    channelsMock.mockResolvedValue(["email"]);
    policyMock.mockRejectedValue(new Error("down"));
    await run();
    expect(recordMock.mock.calls[0][1].payload.exactScoreDisplayEnabled).toBe(false);
  });

  it("sends no email or push when the member's channels cannot be read, and still writes the bell", async () => {
    channelsMock.mockRejectedValue(new Error("rpc down"));
    expect(await run()).toBe(0);
    expect(recordMock).not.toHaveBeenCalled();
    expect(inAppMock).toHaveBeenCalledTimes(1);
  });

  it("keeps going to the next channel when one channel's delivery throws", async () => {
    channelsMock.mockResolvedValue(["email", "push"]);
    dispatchMock.mockRejectedValueOnce(new Error("resend down")).mockResolvedValueOnce({ dispatched: true, status: "sent" });
    expect(await run()).toBe(1);
  });

  it("sends a broken setup's notice on the member's channels only, one delivery per channel", async () => {
    evaluateMonitorMock.mockImplementation((_s: unknown, a: { candidateState: string }) =>
      Promise.resolve({ outcome: "applied", monitorId: "m1", transitionId: "t9", notify: a.candidateState === "INVALIDATED" }),
    );
    channelsMock.mockResolvedValue(["push"]);
    const sent = await evaluateMonitorsAndNotify(client, {
      profileId: "p1",
      source: "scheduled_morning_scan",
      scanExecutionId: "se1",
      visible: [],
      rejectedSymbols: new Set(["MSFT"]),
      retired: [{ symbol: "MSFT", direction: "bullish", stop: 400, price: 390, reclaimAt: 410 }],
      maxActiveWatchMonitors: 15,
    });
    expect(sent).toBe(1);
    expect(recordMock.mock.calls.map((c) => [c[1].channel, c[1].idempotencyKey, c[1].payload])).toEqual([
      ["push", "t9:push", { symbol: "MSFT", verdict: "INVALIDATED" }],
    ]);
  });

  it("notifies nothing for a transition that does not notify", async () => {
    evaluateMonitorMock.mockResolvedValue({ outcome: "applied", monitorId: "m1", transitionId: "t1", notify: false });
    channelsMock.mockResolvedValue(["email"]);
    expect(await run()).toBe(0);
    expect(channelsMock).not.toHaveBeenCalled();
    expect(inAppMock).not.toHaveBeenCalled();
  });
});
