import { describe, expect, it } from "vitest";
import { scanFreshness } from "@/lib/scan/freshness";

/** 2026-08-05 is a Wednesday; 08-07 Friday, 08-08 Saturday, 08-10 Monday. */
const at = (iso: string) => new Date(`${iso}T14:00:00.000Z`);

describe("scanFreshness", () => {
  it("calls a scan read on its own day current", () => {
    const f = scanFreshness("2026-08-05", at("2026-08-05"));
    expect(f).toEqual({ sessionsBehind: 0, severity: "current", stale: false });
  });

  it("calls yesterday's scan one session behind", () => {
    const f = scanFreshness("2026-08-05", at("2026-08-06"));
    expect(f.sessionsBehind).toBe(1);
    expect(f.severity).toBe("previous-session");
    expect(f.stale).toBe(true);
  });

  it("does not age a Friday scan over the weekend — no session has closed", () => {
    expect(scanFreshness("2026-08-07", at("2026-08-08")).sessionsBehind).toBe(0); // Saturday
    expect(scanFreshness("2026-08-07", at("2026-08-09")).sessionsBehind).toBe(0); // Sunday
    expect(scanFreshness("2026-08-07", at("2026-08-09")).stale).toBe(false);
  });

  it("ages that same Friday scan once Monday arrives", () => {
    const f = scanFreshness("2026-08-07", at("2026-08-10"));
    expect(f.sessionsBehind).toBe(1);
    expect(f.severity).toBe("previous-session");
  });

  it("escalates to stale from two sessions out", () => {
    const f = scanFreshness("2026-08-05", at("2026-08-07"));
    expect(f.sessionsBehind).toBe(2);
    expect(f.severity).toBe("stale");
  });

  it("counts only weekdays across a long gap", () => {
    // Wed 08-05 → Wed 08-12: Thu, Fri, Mon, Tue, Wed = 5 sessions.
    expect(scanFreshness("2026-08-05", at("2026-08-12")).sessionsBehind).toBe(5);
  });

  it("caps rather than counting forever", () => {
    expect(scanFreshness("2020-01-02", at("2026-08-05")).sessionsBehind).toBe(30);
    expect(scanFreshness("2020-01-02", at("2026-08-05")).severity).toBe("stale");
  });

  it("treats a future scan date as current rather than negatively stale", () => {
    expect(scanFreshness("2026-08-09", at("2026-08-05"))).toEqual({
      sessionsBehind: 0,
      severity: "current",
      stale: false,
    });
  });

  it("says nothing about staleness when there is no scan to qualify", () => {
    expect(scanFreshness(null, at("2026-08-05")).stale).toBe(false);
    expect(scanFreshness("not-a-date", at("2026-08-05")).stale).toBe(false);
  });
});

describe("scanFreshness — the UTC/Eastern boundary", () => {
  it("keeps an evening scan current between 20:00 ET and midnight", () => {
    // 2026-08-05 23:30 ET is already 2026-08-06 03:30 UTC. A UTC "today" would
    // call the evening's own scan a session stale; the trading date does not.
    const lateEvening = new Date("2026-08-06T03:30:00.000Z");
    expect(scanFreshness("2026-08-05", lateEvening)).toEqual({
      sessionsBehind: 0,
      severity: "current",
      stale: false,
    });
  });

  it("still ages it once the next Eastern day begins", () => {
    const nextMorning = new Date("2026-08-06T13:00:00.000Z"); // 09:00 ET Thursday
    expect(scanFreshness("2026-08-05", nextMorning).sessionsBehind).toBe(1);
  });
});
