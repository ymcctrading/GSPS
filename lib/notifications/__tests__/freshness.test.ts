import { describe, expect, it } from "vitest";
import { checkNotificationFreshness, type FreshnessEvidence } from "@/lib/notifications/freshness";

// 10:00 ET on Wednesday 2026-10-28 is 14:00Z (EDT).
const at = (hhmm: string, s = 0) => new Date(`2026-10-28T${hhmm}:${String(s).padStart(2, "0")}.000Z`);

function delayed(over: Partial<FreshnessEvidence> = {}): FreshnessEvidence {
  return {
    symbol: "AAPL",
    purpose: "entry",
    feed: "delayed",
    delayMs: 15 * 60_000,
    // The 09:30-09:45 ET candle closed 13:45Z, usable 14:00Z; scan evaluated 14:06Z.
    dataAsOf: at("13:45").toISOString(),
    evaluatedAt: at("14:06").toISOString(),
    barMinutes: 15,
    ...over,
  };
}

function realtime(over: Partial<FreshnessEvidence> = {}): FreshnessEvidence {
  return {
    symbol: "BTC/USD",
    purpose: "entry",
    feed: "realtime",
    delayMs: 0,
    dataAsOf: at("14:00").toISOString(),
    evaluatedAt: at("14:01").toISOString(),
    barMinutes: 15,
    planKey: "long:Execute:100:95",
    authorizationId: "auth-1",
    authorizationFor: { symbol: "BTC/USD", planKey: "long:Execute:100:95" },
    ...over,
  };
}

describe("checkNotificationFreshness", () => {
  it("a delayed equity observation is informational, never actionable", () => {
    const r = checkNotificationFreshness(delayed(), at("14:07"));
    expect(r).toMatchObject({ disposition: "informational", reason: "delayed_observation", dataAsOf: at("13:45").toISOString() });
    expect(r.checkedAt).toBe(at("14:07").toISOString());
  });

  it("a delayed feed stays informational even when an authorization is attached", () => {
    const r = checkNotificationFreshness(delayed({ authorizationId: "x", authorizationFor: { symbol: "AAPL", planKey: null } }), at("14:07"));
    expect(r.disposition).toBe("informational");
  });

  it("the worked example: the 09:30-09:45 candle is not usable by a 09:59 evaluation", () => {
    const r = checkNotificationFreshness(delayed({ evaluatedAt: at("13:59").toISOString() }), at("14:01"));
    expect(r).toMatchObject({ disposition: "suppress", reason: "unavailable_at_evaluation" });
  });

  it("is usable exactly at close + delay", () => {
    const r = checkNotificationFreshness(delayed({ evaluatedAt: at("14:00").toISOString() }), at("14:00"));
    expect(r.disposition).toBe("informational");
  });

  it("receipt later than modeled availability governs", () => {
    const late = delayed({ receivedAt: at("14:00", 8).toISOString(), evaluatedAt: at("14:00", 5).toISOString() });
    expect(checkNotificationFreshness(late, at("14:01")).disposition).toBe("suppress");
    const ok = delayed({ receivedAt: at("14:00", 8).toISOString(), evaluatedAt: at("14:00", 8).toISOString() });
    expect(checkNotificationFreshness(ok, at("14:01")).disposition).toBe("informational");
  });

  it("missing or bad provenance suppresses (unknown age is never zero age)", () => {
    for (const over of [
      { dataAsOf: null },
      { dataAsOf: "not a date" },
      { evaluatedAt: undefined },
      { symbol: "" },
      { delayMs: Number.NaN },
      { delayMs: -1 },
      { receivedAt: "garbage" },
      { evaluatedAt: at("14:30").toISOString() }, // evaluated after dispatch
    ] as Partial<FreshnessEvidence>[]) {
      expect(checkNotificationFreshness(delayed(over), at("14:07"))).toMatchObject({ disposition: "suppress", reason: "invalid_provenance" });
    }
    expect(checkNotificationFreshness(delayed(), new Date(Number.NaN))).toMatchObject({ disposition: "suppress", reason: "invalid_provenance" });
  });

  it("expires at the scan cadence, measured from the dispatch clock", () => {
    expect(checkNotificationFreshness(delayed(), at("14:21")).disposition).toBe("informational");
    expect(checkNotificationFreshness(delayed(), at("14:21", 1))).toMatchObject({ disposition: "suppress", reason: "expired_notification" });
  });

  it("a replaced plan suppresses, protective or not", () => {
    const base = { planKey: "long:Execute:100:95", currentPlanKey: "long:Execute:101:96" };
    expect(checkNotificationFreshness(delayed(base), at("14:07"))).toMatchObject({ disposition: "suppress", reason: "superseded_plan" });
    expect(checkNotificationFreshness(delayed({ ...base, purpose: "protective" }), at("14:07")).disposition).toBe("suppress");
    // Not re-read (undefined) is not a replacement.
    expect(checkNotificationFreshness(delayed({ planKey: "a" }), at("14:07")).disposition).toBe("informational");
  });

  it("a protective warning is never suppressed for want of authorization or age", () => {
    const r = checkNotificationFreshness(delayed({ purpose: "protective" }), at("16:00"));
    expect(r).toMatchObject({ disposition: "informational", reason: "delayed_observation" });
    const rt = checkNotificationFreshness(realtime({ purpose: "protective", authorizationId: null }), at("16:00"));
    expect(rt).toMatchObject({ disposition: "informational", reason: "actionability_unverified" });
  });

  it("delivery not permitted suppresses before anything else", () => {
    expect(checkNotificationFreshness(realtime({ deliveryPermitted: false }), at("14:02"))).toMatchObject({
      disposition: "suppress",
      reason: "delivery_not_permitted",
    });
  });

  it("real-time with a matching, fresh authorization is actionable", () => {
    expect(checkNotificationFreshness(realtime(), at("14:02"))).toEqual({
      disposition: "actionable",
      reason: "current_authorization",
      dataAsOf: at("14:00").toISOString(),
      checkedAt: at("14:02").toISOString(),
      authorizationId: "auth-1",
    });
  });

  it("an upstream hold makes it informational", () => {
    expect(checkNotificationFreshness(realtime({ entryHeld: true }), at("14:02"))).toMatchObject({ reason: "entry_held" });
  });

  it("no authorization, or one for another symbol or plan, is unverified", () => {
    expect(checkNotificationFreshness(realtime({ authorizationId: null }), at("14:02"))).toMatchObject({ reason: "actionability_unverified" });
    expect(checkNotificationFreshness(realtime({ authorizationFor: { symbol: "ETH/USD", planKey: "long:Execute:100:95" } }), at("14:02"))).toMatchObject({
      reason: "actionability_unverified",
    });
    expect(checkNotificationFreshness(realtime({ authorizationFor: { symbol: "BTC/USD", planKey: "long:Execute:101:95" } }), at("14:02"))).toMatchObject({
      reason: "actionability_unverified",
    });
    expect(checkNotificationFreshness(realtime({ authorizationFor: null }), at("14:02"))).toMatchObject({ reason: "actionability_unverified" });
  });

  it("a real-time authorization lapses once its data is older than a bar at dispatch", () => {
    expect(checkNotificationFreshness(realtime(), at("14:15")).disposition).toBe("actionable");
    expect(checkNotificationFreshness(realtime(), at("14:15", 1))).toMatchObject({ disposition: "informational", reason: "authorization_expired" });
  });

  it("an unrecognised bar length cannot be actionable", () => {
    expect(checkNotificationFreshness(realtime({ barMinutes: 7 }), at("14:02"))).toMatchObject({ reason: "authorization_expired" });
  });

  it("unknown and unavailable feeds are never actionable", () => {
    for (const feed of ["unknown", "unavailable"] as const) {
      expect(checkNotificationFreshness(realtime({ feed }), at("14:02")).disposition).toBe("informational");
    }
  });
});
