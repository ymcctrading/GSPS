import { describe, expect, it } from "vitest";
import { currentRestWindow, resolveGannRulePrefs, restReminderDue } from "@/lib/gann/traderPrefs";

describe("trader rule preferences", () => {
  it("defaults: notices and the rest reminder on, round-number auto-orders off", () => {
    expect(resolveGannRulePrefs(null)).toEqual({
      roundNumberNotices: true,
      restReminder: true,
      autoOrderRoundNumbers: false,
      restDismissedFor: null,
    });
    expect(resolveGannRulePrefs({ gannRules: { autoOrderRoundNumbers: true, restReminder: "x" } }).autoOrderRoundNumbers).toBe(true);
  });

  it("opens a rest window at each half-year turn, including across the new year", () => {
    expect(currentRestWindow(new Date("2026-06-25T15:00:00Z"))?.period).toBe("2026-06");
    expect(currentRestWindow(new Date("2026-12-28T15:00:00Z"))?.period).toBe("2026-12");
    expect(currentRestWindow(new Date("2026-12-30T15:00:00Z"))?.period).toBe("2026-12");
    expect(currentRestWindow(new Date("2026-09-28T15:00:00Z"))).toBeNull();
  });

  it("stays quiet when switched off or dismissed for this period", () => {
    const now = new Date("2026-06-22T15:00:00Z");
    const base = resolveGannRulePrefs(null);
    expect(restReminderDue(base, now)).not.toBeNull();
    expect(restReminderDue({ ...base, restReminder: false }, now)).toBeNull();
    expect(restReminderDue({ ...base, restDismissedFor: "2026-06" }, now)).toBeNull();
  });
});
