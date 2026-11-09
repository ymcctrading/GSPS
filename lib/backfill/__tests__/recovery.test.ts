import { describe, expect, it } from "vitest";
import { judgeDryRunDay, judgeMeter, judgeNextScan, liveBand, type DryRunFile } from "@/lib/backfill/recovery";
import { backfillClock } from "@/lib/backfill/timeTravel";

const file = (day: string, n: number, extra: Partial<DryRunFile["summary"]> = {}): DryRunFile => ({
  summary: { bullish: n, bearish: 0, universeSize: 250, timeTravel: { droppedBars: 28 }, ...extra },
  rows: Array.from({ length: n }, () => ({ scan_date: day })),
});

describe("the live band", () => {
  it("spans half the smallest to twice the largest of the latest live days", () => {
    const dates = [
      ...Array(18).fill("2026-10-14"),
      ...Array(51).fill("2026-10-26"),
      ...Array(39).fill("2026-10-30"),
      ...Array(5).fill("2026-09-01"), // older than the 3 latest: left out
    ];
    expect(liveBand(dates, 3)).toEqual({ low: 9, high: 102, days: 3 });
    expect(liveBand([])).toBeNull();
  });
});

describe("a dry-run day", () => {
  const band = { low: 9, high: 102, days: 15 };
  it("passes inside the band, warns outside it, fails on none or a wrong date, waits with no file", () => {
    expect(judgeDryRunDay("2026-11-02", file("2026-11-02", 21), band).level).toBe("PASS");
    expect(judgeDryRunDay("2026-11-02", file("2026-11-02", 5), band).level).toBe("WARN");
    expect(judgeDryRunDay("2026-11-02", file("2026-11-02", 0), band).level).toBe("FAIL");
    expect(judgeDryRunDay("2026-11-02", file("2026-11-03", 21), band).level).toBe("FAIL");
    expect(judgeDryRunDay("2026-11-02", null, band).level).toBe("WAIT");
    expect(judgeDryRunDay("2026-11-02", file("2026-11-02", 5), null).level).toBe("PASS");
  });

  it("names the stocks left out after a split", () => {
    const v = judgeDryRunDay("2026-11-02", file("2026-11-02", 20, { splitDropped: ["NVDA"] }), band);
    expect(v.message).toContain("left out after a split: NVDA");
  });
});

describe("the usage meter", () => {
  const since = "2026-11-30T15:00:00Z";
  it("passes only with a reading and an event since the lift, and warns on a hold", () => {
    const stale = [{ meter: "email_daily", read_at: "2026-10-31T17:07:01Z", hold: false }];
    expect(judgeMeter(stale, [], since).map((v) => v.level)).toEqual(["WAIT", "WAIT"]);
    const fresh = [
      { meter: "email_daily", read_at: "2026-11-30T16:07:00Z", hold: false },
      { meter: "vercel_cpu", read_at: "2026-11-30T16:07:00Z", hold: true },
    ];
    const events = [
      { meter: "vercel_cpu", occurred_at: "2026-11-30T16:07:01Z" },
      { meter: "vercel_cpu", occurred_at: "2026-11-30T16:37:01Z" },
      { meter: "alpaca_rate", occurred_at: "2026-10-31T00:35:57Z" }, // before the lift
    ];
    const v = judgeMeter(fresh, events, since);
    expect(v.map((x) => x.level)).toEqual(["PASS", "PASS", "WARN"]);
    expect(v[1].message).toContain("vercel_cpu 2");
    expect(v[1].message).not.toContain("alpaca_rate");
  });
});

describe("the next live evening scan", () => {
  const day = "2026-11-30";
  const slot = backfillClock(day); // 2026-12-01T00:00Z, 7 PM EST
  const at = (min: number) => new Date(slot.getTime() + min * 60_000);

  it("waits before the slot and inside the window, fails after it with no live rows", () => {
    expect(judgeNextScan(day, slot, at(-60), []).level).toBe("WAIT");
    expect(judgeNextScan(day, slot, at(30), []).level).toBe("WAIT");
    const refilled = [{ updated_at: slot.toISOString(), detail: { backfilledAt: "2026-12-01T13:00:00Z" } }];
    const v = judgeNextScan(day, slot, at(120), refilled);
    expect(v.level).toBe("FAIL");
    expect(v.message).toContain("1 refilled rows only");
  });

  it("passes on live rows written on time and warns on late ones", () => {
    const live = (min: number) => [{ updated_at: at(min).toISOString(), detail: {} }];
    const ok = judgeNextScan(day, slot, at(120), live(35));
    expect(ok.level).toBe("PASS");
    expect(ok.message).toContain("35 minutes after 7 PM ET");
    expect(judgeNextScan(day, slot, at(300), live(200)).level).toBe("WARN");
  });
});
