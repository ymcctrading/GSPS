import { describe, expect, it } from "vitest";
import { isQuietHours, minutesSinceLocalMidnight } from "../notifications/quiet-hours";

const TZ = "America/New_York";

describe("minutesSinceLocalMidnight", () => {
  it("reads the local hour/minute in the given timezone", () => {
    // 2026-08-18T14:30:00Z is 10:30 ET (EDT, UTC-4).
    expect(minutesSinceLocalMidnight(new Date("2026-08-18T14:30:00Z"), TZ)).toBe(10 * 60 + 30);
  });
});

describe("isQuietHours", () => {
  it("is false when neither bound is set", () => {
    expect(isQuietHours(new Date("2026-08-18T14:30:00Z"), TZ, null, null)).toBe(false);
  });

  it("is false when start equals end", () => {
    expect(isQuietHours(new Date("2026-08-18T14:30:00Z"), TZ, 600, 600)).toBe(false);
  });

  it("handles a same-day window", () => {
    // 22:00-23:00 ET, checked at 22:30 ET.
    const at2230et = new Date("2026-08-19T02:30:00Z");
    expect(isQuietHours(at2230et, TZ, 22 * 60, 23 * 60)).toBe(true);
    // 10:30 ET is outside it.
    expect(isQuietHours(new Date("2026-08-18T14:30:00Z"), TZ, 22 * 60, 23 * 60)).toBe(false);
  });

  it("handles an overnight window that wraps past midnight", () => {
    // 22:00-06:00 ET.
    const at23et = new Date("2026-08-19T03:00:00Z"); // 23:00 ET
    const at3et = new Date("2026-08-19T07:00:00Z"); // 03:00 ET
    const at10et = new Date("2026-08-18T14:00:00Z"); // 10:00 ET
    expect(isQuietHours(at23et, TZ, 22 * 60, 6 * 60)).toBe(true);
    expect(isQuietHours(at3et, TZ, 22 * 60, 6 * 60)).toBe(true);
    expect(isQuietHours(at10et, TZ, 22 * 60, 6 * 60)).toBe(false);
  });
});
