import { describe, expect, it } from "vitest";
import { AWAY_REMINDER_COPY, awayReminderDue, currentRestWindow, resolveGannRulePrefs, restReminderDue } from "@/lib/gann/traderPrefs";

describe("trader rule preferences", () => {
  it("defaults: notices and the rest reminder on, round-number auto-orders off", () => {
    expect(resolveGannRulePrefs(null)).toEqual({
      roundNumberNotices: true,
      restReminder: true,
      autoOrderRoundNumbers: false,
      restDismissedFor: null,
      awayFrom: null,
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

describe("go flat before you will be away (A-EXIT-05, W022 p.113)", () => {
  const at = (d: string) => new Date(`${d}T15:00:00Z`);
  const prefs = { ...resolveGannRulePrefs({}), awayFrom: "2026-11-20" };
  it("reminds the trader to close out in the days before the absence starts", () => {
    expect(awayReminderDue(prefs, at("2026-11-16"))).toBeNull();
    expect(awayReminderDue(prefs, at("2026-11-17"))?.awayFrom).toBe("2026-11-20");
    expect(awayReminderDue(prefs, at("2026-11-20"))?.awayFrom).toBe("2026-11-20");
    expect(awayReminderDue(prefs, at("2026-11-21"))).toBeNull();
  });
  it("says nothing with no absence set", () => {
    expect(awayReminderDue(resolveGannRulePrefs({}), at("2026-11-18"))).toBeNull();
  });
  it("reads a stored absence date and ignores a malformed one", () => {
    expect(resolveGannRulePrefs({ gannRules: { awayFrom: "2026-11-20" } }).awayFrom).toBe("2026-11-20");
    expect(resolveGannRulePrefs({ gannRules: { awayFrom: "soon" } }).awayFrom).toBeNull();
  });
  it("never claims to close anything", () => {
    expect(AWAY_REMINDER_COPY).toMatch(/nothing is closed for you/i);
    expect(AWAY_REMINDER_COPY).not.toMatch(/gann/i);
  });
});
