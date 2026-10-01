import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScanResult } from "@/lib/types";
import type { TradePlan } from "@/lib/lifecycle/types";

const { isFeatureAuthorizedMock, listMock, applyMock } = vi.hoisted(() => ({
  isFeatureAuthorizedMock: vi.fn(),
  listMock: vi.fn(),
  applyMock: vi.fn(),
}));

vi.mock("@/lib/compliance/signoff", () => ({ isFeatureAuthorized: isFeatureAuthorizedMock }));
vi.mock("@/lib/lifecycle/store", () => ({
  listPreEntryPlansForInstruments: listMock,
  applyEventAndPersist: applyMock,
}));

import {
  planIsRetiredBy,
  retiredSignalFromScan,
  retiredSignalsFrom,
  retirePlansForBrokenStops,
  type RetiredPlanSignal,
} from "@/lib/lifecycle/retire";

const service = {} as SupabaseClient;

const signal: RetiredPlanSignal = { symbol: "OXY", direction: "bullish", stop: 55.2, price: 54.1, reclaimAt: 58 };

const plan = (over: Partial<Pick<TradePlan, "planId" | "instrument" | "direction">> & { invalidation?: number } = {}) =>
  ({
    planId: over.planId ?? "p1",
    instrument: over.instrument ?? "OXY",
    direction: over.direction ?? "bullish",
    coordinates: { invalidation: over.invalidation ?? 55.2 },
  }) as unknown as TradePlan;

const scan = (over: Record<string, unknown>) =>
  ({ symbol: "OXY", direction: "bullish", ...over }) as unknown as ScanResult;

beforeEach(() => {
  isFeatureAuthorizedMock.mockReset();
  listMock.mockReset();
  applyMock.mockReset();
  applyMock.mockResolvedValue({ ok: true });
});

describe("retiredSignalFromScan", () => {
  it("reads the retirement the scan carries", () => {
    const r = scan({ stopBreach: { stop: 55.2, price: 54.1, reclaimAt: 58 } });
    expect(retiredSignalFromScan(r)).toEqual(signal);
  });

  it("reads nothing from a plan that stands, an errored scan, or no direction", () => {
    expect(retiredSignalFromScan(scan({}))).toBeNull();
    expect(retiredSignalFromScan(scan({ error: "x", stopBreach: { stop: 1, price: 1, reclaimAt: 2 } }))).toBeNull();
    expect(retiredSignalFromScan(scan({ direction: "none", stopBreach: { stop: 1, price: 1, reclaimAt: 2 } }))).toBeNull();
  });

  it("collects only the retired results from a batch", () => {
    const all = [scan({}), scan({ symbol: "GOOGL", stopBreach: { stop: 1, price: 0.9, reclaimAt: 1.1 } })];
    expect(retiredSignalsFrom(all).map((s) => s.symbol)).toEqual(["GOOGL"]);
  });
});

describe("planIsRetiredBy", () => {
  it("matches the plan the scan priced: same symbol, direction and stop", () => {
    expect(planIsRetiredBy(plan(), signal)).toBe(true);
    expect(planIsRetiredBy(plan({ invalidation: 55.205 }), signal)).toBe(true);
  });

  it("leaves a different symbol, the other direction, or an older plan with another stop alone", () => {
    expect(planIsRetiredBy(plan({ instrument: "GOOGL" }), signal)).toBe(false);
    expect(planIsRetiredBy(plan({ direction: "bearish" }), signal)).toBe(false);
    expect(planIsRetiredBy(plan({ invalidation: 52 }), signal)).toBe(false);
  });
});

describe("retirePlansForBrokenStops", () => {
  it("does nothing, and reads no plans, without a recorded sign-off", async () => {
    isFeatureAuthorizedMock.mockResolvedValue(false);
    const out = await retirePlansForBrokenStops(service, "u1", [signal]);
    expect(out).toEqual({ authorized: false, retired: 0 });
    expect(isFeatureAuthorizedMock).toHaveBeenCalledWith(service, "preentry_plan_retirement");
    expect(listMock).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("does not even ask for the sign-off when the scan retired nothing", async () => {
    const out = await retirePlansForBrokenStops(service, "u1", []);
    expect(out.retired).toBe(0);
    expect(isFeatureAuthorizedMock).not.toHaveBeenCalled();
  });

  it("retires the matching plans once authorized, and only those", async () => {
    isFeatureAuthorizedMock.mockResolvedValue(true);
    listMock.mockResolvedValue([plan({ planId: "mine" }), plan({ planId: "older", invalidation: 50 }), plan({ planId: "other", instrument: "GOOGL" })]);
    const now = new Date("2026-10-01T15:00:00Z");
    const out = await retirePlansForBrokenStops(service, "u1", [signal], now);
    expect(out).toEqual({ authorized: true, retired: 1 });
    expect(listMock).toHaveBeenCalledWith(service, "u1", ["OXY"]);
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock).toHaveBeenCalledWith(
      service,
      "u1",
      "mine",
      expect.objectContaining({ type: "retire", at: now.toISOString(), reason: expect.stringContaining("55.20") }),
    );
    expect(applyMock.mock.calls[0][3].reason).toContain("58.00");
  });

  it("keeps going when one plan's write fails, and does not count it", async () => {
    isFeatureAuthorizedMock.mockResolvedValue(true);
    listMock.mockResolvedValue([plan({ planId: "a" }), plan({ planId: "b" })]);
    applyMock.mockRejectedValueOnce(new Error("db")).mockResolvedValueOnce({ ok: true });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await retirePlansForBrokenStops(service, "u1", [signal]);
    expect(out.retired).toBe(1);
    spy.mockRestore();
  });

  it("does not count a plan the reducer refused (it raced out of pre-entry)", async () => {
    isFeatureAuthorizedMock.mockResolvedValue(true);
    listMock.mockResolvedValue([plan()]);
    applyMock.mockResolvedValue({ ok: false, error: "Cannot retire" });
    expect((await retirePlansForBrokenStops(service, "u1", [signal])).retired).toBe(0);
  });

  it("fails closed when the plans cannot be read", async () => {
    isFeatureAuthorizedMock.mockResolvedValue(true);
    listMock.mockRejectedValue(new Error("db"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await retirePlansForBrokenStops(service, "u1", [signal])).toEqual({ authorized: true, retired: 0 });
    expect(applyMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
