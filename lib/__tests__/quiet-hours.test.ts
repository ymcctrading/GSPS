import { describe, expect, it } from "vitest";
import { isWithinQuietHours, type QuietHoursPrefs } from "@/lib/notifications/quiet-hours";

const ny: Omit<QuietHoursPrefs, "start" | "end"> = { enabled: true, timezone: "America/New_York" };

describe("isWithinQuietHours", () => {
  it("returns false outright when quiet hours are disabled", () => {
    const prefs: QuietHoursPrefs = { ...ny, enabled: false, start: "22:00", end: "06:00" };
    // 03:00 ET is deep inside what would otherwise be the window.
    expect(isWithinQuietHours(prefs, new Date("2026-08-18T07:00:00Z"))).toBe(false);
  });

  it("treats an equal start/end as no quiet hours at all", () => {
    const prefs: QuietHoursPrefs = { ...ny, start: "09:00", end: "09:00" };
    expect(isWithinQuietHours(prefs, new Date("2026-08-18T13:00:00Z"))).toBe(false);
  });

  describe("same-day window (start < end)", () => {
    const prefs: QuietHoursPrefs = { ...ny, start: "09:00", end: "17:00" };

    it("is true at the start boundary (inclusive)", () => {
      // 09:00 ET = 13:00 UTC in August (EDT, UTC-4).
      expect(isWithinQuietHours(prefs, new Date("2026-08-18T13:00:00Z"))).toBe(true);
    });

    it("is false at the end boundary (exclusive)", () => {
      // 17:00 ET = 21:00 UTC.
      expect(isWithinQuietHours(prefs, new Date("2026-08-18T21:00:00Z"))).toBe(false);
    });

    it("is true in the middle of the window", () => {
      // 12:00 ET = 16:00 UTC.
      expect(isWithinQuietHours(prefs, new Date("2026-08-18T16:00:00Z"))).toBe(true);
    });

    it("is false before the window", () => {
      // 07:00 ET = 11:00 UTC.
      expect(isWithinQuietHours(prefs, new Date("2026-08-18T11:00:00Z"))).toBe(false);
    });

    it("is false after the window", () => {
      // 20:00 ET = 00:00 UTC next day.
      expect(isWithinQuietHours(prefs, new Date("2026-08-19T00:00:00Z"))).toBe(false);
    });
  });

  describe("wraparound window (start > end, crosses midnight)", () => {
    const prefs: QuietHoursPrefs = { ...ny, start: "22:00", end: "06:00" };

    it("is true right after the start boundary, before midnight", () => {
      // 23:00 ET = 03:00 UTC next day.
      expect(isWithinQuietHours(prefs, new Date("2026-08-19T03:00:00Z"))).toBe(true);
    });

    it("is true just after midnight, before the end boundary", () => {
      // 02:00 ET = 06:00 UTC.
      expect(isWithinQuietHours(prefs, new Date("2026-08-19T06:00:00Z"))).toBe(true);
    });

    it("is false at the end boundary (exclusive)", () => {
      // 06:00 ET = 10:00 UTC.
      expect(isWithinQuietHours(prefs, new Date("2026-08-19T10:00:00Z"))).toBe(false);
    });

    it("is true at the start boundary (inclusive)", () => {
      // 22:00 ET = 02:00 UTC next day.
      expect(isWithinQuietHours(prefs, new Date("2026-08-19T02:00:00Z"))).toBe(true);
    });

    it("is false in the middle of the day, outside the window", () => {
      // 14:00 ET = 18:00 UTC.
      expect(isWithinQuietHours(prefs, new Date("2026-08-18T18:00:00Z"))).toBe(false);
    });
  });

  it("respects a non-UTC-offset timezone independently of the local machine clock", () => {
    // 23:00 in Los Angeles (PDT, UTC-7) = 06:00 UTC next day.
    const prefs: QuietHoursPrefs = { enabled: true, timezone: "America/Los_Angeles", start: "22:00", end: "06:00" };
    expect(isWithinQuietHours(prefs, new Date("2026-08-19T06:00:00Z"))).toBe(true);
    // Same instant read in New York (EDT, UTC-4) is 02:00 — also inside its own wraparound window.
    const nyPrefs: QuietHoursPrefs = { ...prefs, timezone: "America/New_York" };
    expect(isWithinQuietHours(nyPrefs, new Date("2026-08-19T06:00:00Z"))).toBe(true);
  });
});
