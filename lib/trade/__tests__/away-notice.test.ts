import { describe, expect, it } from "vitest";
import { AWAY_REMINDER_COPY, REST_REMINDER_COPY, resolveGannRulePrefs } from "@/lib/gann/traderPrefs";
import { closeOutNotice } from "../away-notice";

describe("the close-out notice on a new entry (A-EXIT-05, M-K4; audit T-07)", () => {
  const base = resolveGannRulePrefs(null);
  const inRest = new Date("2026-06-22T15:00:00Z");
  const outside = new Date("2026-04-15T15:00:00Z");

  it("carries the rest reminder inside the twice-yearly rest window", () => {
    expect(closeOutNotice(base, inRest)).toBe(REST_REMINDER_COPY);
  });

  it("carries none when the rest reminder is off or dismissed for the period, or outside the window", () => {
    expect(closeOutNotice({ ...base, restReminder: false }, inRest)).toBeNull();
    expect(closeOutNotice({ ...base, restDismissedFor: "2026-06" }, inRest)).toBeNull();
    expect(closeOutNotice(base, outside)).toBeNull();
  });

  it("puts the away reminder first: it names a date", () => {
    expect(closeOutNotice({ ...base, awayFrom: "2026-06-24" }, inRest)).toBe(AWAY_REMINDER_COPY);
    expect(closeOutNotice({ ...base, awayFrom: "2026-04-16" }, outside)).toBe(AWAY_REMINDER_COPY);
  });
});
