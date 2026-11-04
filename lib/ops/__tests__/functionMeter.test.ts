import { describe, expect, it, vi } from "vitest";
import {
  USAGE_METERS,
  holdDecision,
  inExemptWindow,
  projectedAtPeriodEnd,
  renderAlert,
} from "@/lib/ops/usageLimits";
import { cpuMicros, functionDay, meterScheduledCall, routeFromHeaders, shareCpu } from "@/lib/ops/functionMeter";

const cpu = USAGE_METERS.vercel_cpu;
const calls = USAGE_METERS.vercel_invocations;

describe("Vercel function meters", () => {
  it("carry Hobby's limits: 4 hours of CPU and 1 million calls a month, both holding", () => {
    expect(cpu.limit).toBe(240);
    expect(cpu.period).toBe("month");
    expect(cpu.holds).toBe(true);
    expect(calls.limit).toBe(1_000_000);
    expect(calls.holds).toBe(true);
  });

  it("have no last-two-days exemption: Vercel's month is the account's cycle", () => {
    const lastDay = new Date("2026-11-30T12:00:00Z");
    expect(inExemptWindow(cpu, lastDay)).toBe(false);
    expect(inExemptWindow(USAGE_METERS.github_actions, lastDay)).toBe(true);
    const d = holdDecision(cpu, 238, lastDay, null);
    expect(d.hold).toBe(true);
    expect(d.reason).toContain("UTC month resets");
    expect(d.reason).toContain("Usage page");
  });

  it("an owner override still lets an urgent fix through", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const d = holdDecision(cpu, 239, now, { until: new Date("2026-11-10T13:00:00Z"), reason: "urgent fix" });
    expect(d.hold).toBe(false);
  });

  it("holds below 99% only when the limit is near", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(holdDecision(cpu, 237, now, null).hold).toBe(false); // 98.75%
    expect(holdDecision(cpu, 237.6, now, null).hold).toBe(true); // 99%
  });

  it("alert says the jobs stop at 99%, gives the pace and names the scheduled-only scope", () => {
    const now = new Date("2026-11-11T00:00:00Z"); // 10 of 30 days
    const text = renderAlert({ meter: cpu, used: 60, now }, 25, holdDecision(cpu, 60, now, null)).text;
    expect(text).toContain("The scheduled jobs stop at 99%");
    expect(text).toContain("At this pace: about 180 CPU minutes");
    expect(text).toContain("scheduled jobs only");
    expect(text).not.toContain("last 2 days");
  });
});

describe("projectedAtPeriodEnd", () => {
  it("carries the month's use at its pace", () => {
    expect(projectedAtPeriodEnd(cpu, 60, new Date("2026-11-11T00:00:00Z"))).toBeCloseTo(180, 6);
  });
  it("is null in the first hour, for bad input and for non-monthly meters", () => {
    expect(projectedAtPeriodEnd(cpu, 1, new Date("2026-11-01T00:30:00Z"))).toBeNull();
    expect(projectedAtPeriodEnd(cpu, Number.NaN, new Date("2026-11-11T00:00:00Z"))).toBeNull();
    expect(projectedAtPeriodEnd(cpu, -1, new Date("2026-11-11T00:00:00Z"))).toBeNull();
    expect(projectedAtPeriodEnd(USAGE_METERS.email_daily, 5, new Date("2026-11-11T12:00:00Z"))).toBeNull();
  });
});

describe("functionMeter helpers", () => {
  it("counts a call in its UTC day", () => {
    expect(functionDay(new Date("2026-11-04T23:59:59Z"))).toBe("2026-11-04");
    expect(functionDay(new Date("2026-11-05T00:00:00Z"))).toBe("2026-11-05");
  });
  it("adds user and system CPU, and a backwards reading records nothing", () => {
    expect(cpuMicros({ user: 45_000_000, system: 15_000_000 })).toBe(60_000_000);
    expect(shareCpu(20, 10, 0).minutes).toBe(0);
  });
  it("overlapping calls share the process CPU instead of each counting it", () => {
    // A: 0..60s of CPU; B starts at 30s and ends at 90s, after A recorded.
    const a = shareCpu(0, 60_000_000, 0);
    expect(a.minutes).toBe(1);
    const b = shareCpu(30_000_000, 90_000_000, a.accounted);
    expect(b.minutes).toBe(0.5); // only 60..90s is new, not 30..90s
    // A call wholly inside what was already recorded counts nothing.
    expect(shareCpu(10, 20, b.accounted).minutes).toBe(0);
    expect(shareCpu(10, 20, b.accounted).accounted).toBe(b.accounted);
  });

  it("reads the route from the request headers without its query", () => {
    const h: Record<string, string> = { "x-matched-path": "/api/market-scan?x=1" };
    expect(routeFromHeaders((n) => h[n] ?? null)).toBe("/api/market-scan");
    expect(routeFromHeaders(() => null)).toBe("unknown");
    expect(routeFromHeaders((n) => (n === "x-matched-path" ? "not-a-path" : null))).toBe("unknown");
  });
  it("never throws outside a request", () => {
    expect(() => meterScheduledCall()).not.toThrow();
  });
});

describe("isCronAuthorized starts the measure only for an authorized call", () => {
  it("meters on success, not on failure", async () => {
    vi.resetModules();
    const spy = vi.fn();
    vi.doMock("@/lib/ops/functionMeter", () => ({ meterScheduledCall: spy }));
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "s3cret";
    try {
      const { isCronAuthorized } = await import("@/lib/cron-auth");
      expect(isCronAuthorized("Bearer wrong!")).toBe(false);
      expect(spy).not.toHaveBeenCalled();
      expect(isCronAuthorized("Bearer s3cret")).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      process.env.CRON_SECRET = prev;
      vi.doUnmock("@/lib/ops/functionMeter");
    }
  });
});
