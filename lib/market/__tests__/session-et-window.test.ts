import { describe, expect, it } from "vitest";
import { etParts } from "@/lib/market/session";
import { etWindowFrom } from "@/lib/entitlements/scheduled-scan";

// Migration 0102: each once-a-day scan fires at its EDT and its EST UTC hour,
// and exactly one of the two must land inside the route's ET window, in
// summer and in winter alike.
const JOBS = [
  { name: "morning preparation", minute: 30, hours: [10, 11], window: etWindowFrom(6, 30) },
  { name: "morning confirmation", minute: 18, hours: [13, 14], window: etWindowFrom(9, 15) },
  { name: "first 90 minutes", minute: 48, hours: [13, 14], window: etWindowFrom(9, 45) },
  { name: "midday", minute: 3, hours: [15, 16], window: etWindowFrom(11, 0) },
  { name: "afternoon", minute: 3, hours: [18, 19], window: etWindowFrom(14, 0) },
];
const DAYS = { summer: "2026-10-30", winter: "2026-11-02", lateWinter: "2027-03-08", spring: "2027-03-15" };

describe("ET windows against the dual-hour UTC schedules", () => {
  for (const job of JOBS) {
    for (const [season, day] of Object.entries(DAYS)) {
      it(`${job.name}: exactly one firing runs on ${season} (${day})`, () => {
        const inside = job.hours.filter((h) => {
          const at = new Date(`${day}T${String(h).padStart(2, "0")}:${String(job.minute).padStart(2, "0")}:00Z`);
          const m = etParts(at).minutes;
          return m >= job.window.from && m < job.window.to;
        });
        expect(inside).toHaveLength(1);
      });
    }
  }
});

describe("nextClose", () => {
  it("is today's 4 PM ET before the close, the next weekday's after it, Monday's from a Friday evening", async () => {
    const { nextClose } = await import("@/lib/market/session");
    expect(nextClose(new Date("2026-10-22T15:00:00Z")).toISOString()).toBe("2026-10-22T20:00:00.000Z");
    expect(nextClose(new Date("2026-10-22T21:00:00Z")).toISOString()).toBe("2026-10-23T20:00:00.000Z");
    expect(nextClose(new Date("2026-10-23T22:00:00Z")).toISOString()).toBe("2026-10-26T20:00:00.000Z");
    // After the November DST change, 4 PM ET is 21:00 UTC.
    expect(nextClose(new Date("2026-11-02T15:00:00Z")).toISOString()).toBe("2026-11-02T21:00:00.000Z");
  });
});
