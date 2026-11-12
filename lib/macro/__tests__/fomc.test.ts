import { describe, expect, it } from "vitest";
import {
  FOMC_MEETINGS,
  daysBetween,
  etToday,
  fomcLabel,
  fomcNear,
  fomcScheduleExhausted,
  upcomingFomc,
} from "@/lib/macro/fomc";

describe("FOMC_MEETINGS", () => {
  it("lists eight two-day meetings a year, in order, as read from the Fed's calendar", () => {
    for (const year of ["2026", "2027"]) {
      expect(FOMC_MEETINGS.filter((x) => x.start.startsWith(year))).toHaveLength(8);
    }
    for (let i = 0; i < FOMC_MEETINGS.length; i++) {
      const x = FOMC_MEETINGS[i];
      expect(daysBetween(x.start, x.end)).toBe(1);
      if (i > 0) expect(x.start > FOMC_MEETINGS[i - 1].end).toBe(true);
      // Meetings run Tuesday to Wednesday.
      expect(new Date(`${x.start}T12:00:00Z`).getUTCDay()).toBe(2);
    }
    // Projections come with the March, June, September and December meetings.
    expect(FOMC_MEETINGS.filter((x) => x.projections).map((x) => x.start.slice(5, 7))).toEqual([
      "03", "06", "09", "12", "03", "06", "09", "12",
    ]);
  });
});

describe("upcoming and near", () => {
  it("keeps a meeting until its last day is over", () => {
    expect(upcomingFomc("2026-12-09", 1)[0].start).toBe("2026-12-08");
    expect(upcomingFomc("2026-12-10", 1)[0].start).toBe("2027-01-26");
    expect(upcomingFomc("2026-11-12", 4).map((x) => x.start)).toEqual(["2026-12-08", "2027-01-26", "2027-03-16", "2027-04-27"]);
  });

  it("flags a meeting under way or within the week, and not before", () => {
    expect(fomcNear("2026-12-01")?.start).toBe("2026-12-08");
    expect(fomcNear("2026-11-30")).toBeNull();
    expect(fomcNear("2026-12-09")?.start).toBe("2026-12-08");
  });

  it("says when the list has run out", () => {
    expect(fomcScheduleExhausted("2027-12-09")).toBe(true);
    expect(fomcScheduleExhausted("2027-12-08")).toBe(false);
  });

  it("reads today by the New York date", () => {
    // 03:00 UTC on Nov 13 is 10 PM on Nov 12 in New York.
    expect(etToday(new Date("2026-11-13T03:00:00Z"))).toBe("2026-11-12");
  });

  it("labels within a month and across a month's turn", () => {
    expect(fomcLabel({ start: "2026-12-08", end: "2026-12-09", projections: true })).toBe("Dec 8–9");
    expect(fomcLabel({ start: "2026-04-30", end: "2026-05-01", projections: false })).toBe("Apr 30 – May 1");
  });
});
