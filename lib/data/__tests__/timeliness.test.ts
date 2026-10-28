import { describe, expect, it } from "vitest";
import type { Bar, Timeframe } from "@/lib/types";
import {
  CONTRACTUAL_EQUITY_DELAY_MS,
  seriesSpacingMinutes,
  delayedFillIndex,
  availability,
  availableBars,
  barCloseAt,
  etInstant,
  firstExecutableBarIndex,
  observationAgeMs,
  realtimeState,
  replayDecisionAt,
  resolveFeedPolicy,
  sessionCloseAt,
  staleUnderRealtime,
  usableBy,
} from "@/lib/data/timeliness";
import { feedDelayMs, realtimeEntitlement } from "@/lib/data/latency";

const D = CONTRACTUAL_EQUITY_DELAY_MS;
const bar = (t: string, c = 100): Bar => ({ t, o: c, h: c, l: c, c, v: 1 });
const at = (iso: string) => new Date(iso);

// DATA-DELAY-001 §4: 2026-10-28 is a Wednesday in EDT, so 09:30 ET = 13:30Z.
describe("the owner's worked example: the 09:30-09:45 ET candle", () => {
  const candle = bar("2026-10-28T13:30:00Z");
  const close = barCloseAt(candle.t, "15Min", "us_equity");

  it("closes at 09:45 and is first usable at 10:00 ET, never at its own stamp", () => {
    expect(close?.toISOString()).toBe("2026-10-28T13:45:00.000Z");
    const a = availability(close, D);
    expect(a?.modeledAvailableAt.toISOString()).toBe("2026-10-28T14:00:00.000Z");
  });

  it("is unavailable at 09:45:00 and 09:59:59.999, usable at 10:00:00", () => {
    const a = availability(close, D);
    expect(usableBy(a, at("2026-10-28T13:45:00Z"))).toBe(false);
    expect(usableBy(a, at("2026-10-28T13:59:59.999Z"))).toBe(false);
    expect(usableBy(a, at("2026-10-28T14:00:00Z"))).toBe(true);
  });

  it("received at 10:00:08 stays unavailable until 10:00:08", () => {
    const a = availability(close, D, "2026-10-28T14:00:08Z");
    expect(usableBy(a, at("2026-10-28T14:00:00Z"))).toBe(false);
    expect(usableBy(a, at("2026-10-28T14:00:07.999Z"))).toBe(false);
    expect(usableBy(a, at("2026-10-28T14:00:08Z"))).toBe(true);
  });

  it("a receipt beyond 15 minutes holds it until receipt; an early receipt never brings it forward", () => {
    expect(availability(close, D, "2026-10-28T14:20:00Z")?.usableAt.toISOString()).toBe("2026-10-28T14:20:00.000Z");
    expect(availability(close, D, "2026-10-28T13:50:00Z")?.usableAt.toISOString()).toBe("2026-10-28T14:00:00.000Z");
  });

  it("a scan at 10:06 reads it, and the evaluation is 10:06, not backdated", () => {
    const evaluatedAt = at("2026-10-28T14:06:00Z");
    const usable = availableBars([candle], { timeframe: "15Min", assetClass: "us_equity", delayMs: D, evaluatedAt });
    expect(usable).toHaveLength(1);
    expect(evaluatedAt.toISOString()).toBe("2026-10-28T14:06:00.000Z");
  });
});

describe("invalid and missing timestamps", () => {
  it("are never usable", () => {
    expect(availability("not a date", D)).toBeNull();
    expect(availability(null, D)).toBeNull();
    expect(availability(at("2026-10-28T13:45:00Z"), D, "garbage")).toBeNull();
    expect(availability(at("2026-10-28T13:45:00Z"), Number.NaN)).toBeNull();
    expect(usableBy(null, at("2026-10-28T20:00:00Z"))).toBe(false);
    expect(usableBy(availability(at("2026-10-28T13:45:00Z"), D), new Date(Number.NaN))).toBe(false);
    expect(barCloseAt("nope", "15Min", "us_equity")).toBeNull();
  });

  it("unknown age is null, never zero", () => {
    expect(observationAgeMs(null, at("2026-10-28T14:00:00Z"))).toBeNull();
    expect(observationAgeMs("garbage", at("2026-10-28T14:00:00Z"))).toBeNull();
    expect(observationAgeMs("2026-10-28T13:45:00Z", at("2026-10-28T14:00:00Z"))).toBe(D);
    expect(staleUnderRealtime(null, "1Min")).toBe(true);
  });
});

describe("candle semantics", () => {
  it("reads the provider's stamp as the open on every intraday timeframe", () => {
    const cases: [Timeframe, string][] = [
      ["1Min", "2026-10-28T13:31:00.000Z"],
      ["5Min", "2026-10-28T13:35:00.000Z"],
      ["15Min", "2026-10-28T13:45:00.000Z"],
      ["1Hour", "2026-10-28T14:30:00.000Z"],
    ];
    for (const [tf, close] of cases) expect(barCloseAt("2026-10-28T13:30:00Z", tf, "us_equity")?.toISOString()).toBe(close);
  });

  it("clips the short final exchange hour at the close (15:30-16:00)", () => {
    expect(barCloseAt("2026-10-28T19:30:00Z", "1Hour", "us_equity")?.toISOString()).toBe("2026-10-28T20:00:00.000Z");
  });

  it("clips at 13:00 on an early close (the day after Thanksgiving, 2026-11-27, EST)", () => {
    expect(sessionCloseAt("2026-11-27").toISOString()).toBe("2026-11-27T18:00:00.000Z");
    expect(barCloseAt("2026-11-27T17:30:00Z", "1Hour", "us_equity")?.toISOString()).toBe("2026-11-27T18:00:00.000Z");
  });

  it("closes a US equity day bar at that day's session close, early closes included", () => {
    expect(barCloseAt("2026-10-28T04:00:00Z", "1Day", "us_equity")?.toISOString()).toBe("2026-10-28T20:00:00.000Z");
    expect(barCloseAt("2026-11-27T05:00:00Z", "1Day", "us_equity")?.toISOString()).toBe("2026-11-27T18:00:00.000Z");
  });

  it("does not clip crypto, which has no session", () => {
    expect(barCloseAt("2026-10-28T19:30:00Z", "1Hour", "crypto")?.toISOString()).toBe("2026-10-28T20:30:00.000Z");
  });

  it("never lets a still-forming bar through, even with no delay", () => {
    const forming = bar("2026-10-28T14:00:00Z");
    const usable = availableBars([forming], { timeframe: "15Min", assetClass: "crypto", delayMs: 0, evaluatedAt: at("2026-10-28T14:10:00Z") });
    expect(usable).toHaveLength(0);
  });
});

describe("sessions and DST", () => {
  it("places ET wall-clock times on both sides of the November change", () => {
    expect(etInstant("2026-10-30", 16 * 60).toISOString()).toBe("2026-10-30T20:00:00.000Z"); // EDT
    expect(etInstant("2026-11-02", 16 * 60).toISOString()).toBe("2026-11-02T21:00:00.000Z"); // EST
    expect(etInstant("2026-03-09", 9 * 60 + 30).toISOString()).toBe("2026-03-09T13:30:00.000Z"); // EDT after March change
  });

  it("an end-of-session candle is not usable at the close; its delay still applies", () => {
    const last = bar("2026-10-28T19:45:00Z");
    const opts = { timeframe: "15Min" as const, assetClass: "us_equity" as const, delayMs: D };
    expect(availableBars([last], { ...opts, evaluatedAt: at("2026-10-28T20:00:00Z") })).toHaveLength(0);
    expect(availableBars([last], { ...opts, evaluatedAt: at("2026-10-28T20:15:00Z") })).toHaveLength(1);
  });
});

describe("timeframes", () => {
  it("applies the same wall-clock delay on 1m, 5m, 15m and 1H", () => {
    for (const tf of ["1Min", "5Min", "15Min", "1Hour"] as Timeframe[]) {
      const close = barCloseAt("2026-10-28T14:00:00Z", tf, "us_equity")!;
      const a = availability(close, D)!;
      expect(a.modeledAvailableAt.getTime() - close.getTime()).toBe(D);
    }
  });

  it("changing the chart timeframe never changes the feed's entitlement", () => {
    const p = resolveFeedPolicy({ assetClass: "us_equity", isLive: true, source: "alpaca", env: {} });
    expect(p.entitlement).toBe("delayed");
    expect(p.contractualDelayMs).toBe(D);
  });

  it("a higher timeframe built from minutes reads only the minutes usable at the clock", () => {
    const minutes = Array.from({ length: 30 }, (_, i) => bar(new Date(Date.parse("2026-10-28T13:30:00Z") + i * 60_000).toISOString(), 100 + i));
    const usable = availableBars(minutes, { timeframe: "1Min", assetClass: "us_equity", delayMs: D, evaluatedAt: at("2026-10-28T14:00:00Z") });
    // 13:30 .. 13:44 opens close by 13:45 and are usable at 14:00.
    expect(usable.map((b) => b.c)).toEqual(Array.from({ length: 15 }, (_, i) => 100 + i));
  });
});

describe("execution boundary", () => {
  const bars = Array.from({ length: 6 }, (_, i) => bar(new Date(Date.parse("2026-10-28T13:30:00Z") + i * 15 * 60_000).toISOString(), 100 + i));

  it("decides on a 15-minute bar two bars later under the delay, one bar later without it", () => {
    const delayed = replayDecisionAt(bars[0], "15Min", "us_equity", D)!;
    expect(firstExecutableBarIndex(bars, delayed)).toBe(2);
    const live = replayDecisionAt(bars[0], "15Min", "crypto", 0)!;
    expect(firstExecutableBarIndex(bars, live)).toBe(1);
  });

  it("never fills at the open of a bar that opened before the decision", () => {
    expect(firstExecutableBarIndex(bars, at("2026-10-28T14:00:01Z"))).toBe(3);
    expect(firstExecutableBarIndex(bars, at("2026-10-28T19:00:00Z"))).toBe(-1);
  });

  it("a day bar decided after the close fills at the next session's open", () => {
    const days = [bar("2026-10-27T04:00:00Z"), bar("2026-10-28T13:30:00Z")];
    const decision = replayDecisionAt(days[0], "1Day", "us_equity", D)!;
    expect(decision.toISOString()).toBe("2026-10-27T20:15:00.000Z");
    expect(firstExecutableBarIndex(days, decision)).toBe(1);
  });
});

describe("the live-feed transition", () => {
  it("declared but unverified real-time stays delayed", () => {
    const env = { MARKET_DATA_REALTIME: "true" };
    expect(realtimeState(env)).toBe("declared_unverified");
    expect(resolveFeedPolicy({ assetClass: "us_equity", isLive: true, source: "alpaca", env }).contractualDelayMs).toBe(D);
  });

  it("verified real-time removes the contractual delay", () => {
    const env = { MARKET_DATA_REALTIME: "true", MARKET_DATA_REALTIME_VERIFIED_AT: "2026-11-01T14:00:00Z" };
    expect(realtimeState(env)).toBe("verified");
    const p = resolveFeedPolicy({ assetClass: "us_equity", isLive: true, source: "alpaca", env });
    expect(p).toMatchObject({ entitlement: "realtime", contractualDelayMs: 0 });
  });

  it("a garbage verification stamp does not verify", () => {
    expect(realtimeState({ MARKET_DATA_REALTIME: "true", MARKET_DATA_REALTIME_VERIFIED_AT: "soon" })).toBe("declared_unverified");
  });

  it("still rejects a genuinely stale observation under real-time", () => {
    expect(staleUnderRealtime(5 * 60_000, "1Min")).toBe(true);
    expect(staleUnderRealtime(30_000, "1Min")).toBe(false);
  });

  it("resolves mixed feeds by instrument and source", () => {
    expect(resolveFeedPolicy({ assetClass: "crypto", isLive: true, env: {} }).entitlement).toBe("realtime");
    expect(resolveFeedPolicy({ assetClass: "us_equity", isLive: true, source: "polygon", env: {} })).toMatchObject({ entitlement: "unknown", contractualDelayMs: D });
    expect(resolveFeedPolicy({ assetClass: "us_equity", isLive: false, env: {} }).entitlement).toBe("unavailable");
  });

  it("no code path assumes real-time from the environment alone", () => {
    const prev = { r: process.env.MARKET_DATA_REALTIME, v: process.env.MARKET_DATA_REALTIME_VERIFIED_AT };
    process.env.MARKET_DATA_REALTIME = "true";
    delete process.env.MARKET_DATA_REALTIME_VERIFIED_AT;
    try {
      expect(realtimeEntitlement()).toBe(false);
      expect(feedDelayMs("us_equity", true)).toBe(D);
    } finally {
      if (prev.r === undefined) delete process.env.MARKET_DATA_REALTIME;
      else process.env.MARKET_DATA_REALTIME = prev.r;
      if (prev.v !== undefined) process.env.MARKET_DATA_REALTIME_VERIFIED_AT = prev.v;
    }
  });
});

describe("seriesSpacingMinutes (review: skipped bars)", () => {
  const at = (m: number) => ({ t: new Date(Date.parse("2026-10-28T13:30:00Z") + m * 60_000).toISOString(), o: 1, h: 1, l: 1, c: 1, v: 1 });
  it("reads a thin 15-minute series with skipped bars as 15 minutes, and fills it after the delay", () => {
    const bars = [0, 15, 30, 75, 90, 105, 120].map(at); // 10:15 and 10:30 missing: a 45-minute gap
    expect(seriesSpacingMinutes(bars)).toBe(15);
    // The 10:00 bar (index 2) closes 10:15 and is usable 10:30; the next bar opens 10:45.
    const f = delayedFillIndex(bars, 2, { assetClass: "us_equity", delayMs: 15 * 60_000, intervalMinutes: seriesSpacingMinutes(bars) });
    expect(f).toBe(3);
  });
  it("is 0 for daily bars", () => {
    expect(seriesSpacingMinutes([at(0), at(1440), at(2880)])).toBe(0);
  });
});

describe("delayedFillIndex: no fill on extended-hours bars (review)", () => {
  it("a signal on the 3:45 PM bar fills at the next regular open, not after hours", () => {
    const t = (iso: string) => ({ t: iso, o: 1, h: 1, l: 1, c: 1, v: 1 });
    const bars = [
      t("2026-10-28T19:45:00Z"), // 3:45 PM ET, closes 4:00, usable 4:15
      t("2026-10-28T20:00:00Z"), // 4:00 PM post-market
      t("2026-10-28T20:15:00Z"), // 4:15 PM post-market
      t("2026-10-29T13:15:00Z"), // 9:15 AM pre-market
      t("2026-10-29T13:30:00Z"), // 9:30 AM open
    ];
    expect(delayedFillIndex(bars, 0, { assetClass: "us_equity", delayMs: 15 * 60_000, intervalMinutes: 15 })).toBe(4);
  });
});

describe("newerBarUsable (dependency freshness)", () => {
  it("reads whether the next bar after the last one read was already usable", async () => {
    const { newerBarUsable } = await import("@/lib/data/timeliness");
    const close = "2026-10-28T14:00:00.000Z";
    expect(newerBarUsable(close, 15, 0, new Date("2026-10-28T14:14:59Z"))).toBe(false);
    expect(newerBarUsable(close, 15, 0, new Date("2026-10-28T14:15:00Z"))).toBe(true);
    // The delay counts once: the next 15-minute bar is usable at 14:30 on a delayed feed.
    expect(newerBarUsable(close, 15, 15 * 60_000, new Date("2026-10-28T14:29:59Z"))).toBe(false);
    expect(newerBarUsable(close, 15, 15 * 60_000, new Date("2026-10-28T14:30:00Z"))).toBe(true);
    // Unknown is never current.
    expect(newerBarUsable(null, 15, 0, new Date("2026-10-28T14:01:00Z"))).toBe(true);
    expect(newerBarUsable("garbage", 15, 0, new Date("2026-10-28T14:01:00Z"))).toBe(true);
    expect(newerBarUsable(close, Number.NaN, 0, new Date("2026-10-28T14:01:00Z"))).toBe(true);
  });
});
