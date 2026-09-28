import { describe, expect, it } from "vitest";
import { readIncorporationCycle } from "../incorporationCycle";

const USX = { date: "1901-02-25", precision: "day" as const };
const on = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("time from the company's inception (parity D3)", () => {
  it("is absent without a date", () => {
    expect(readIncorporationCycle(null, on("2026-02-25"))).toBeNull();
  });

  it("finds every printed U.S. Steel seasonal date from the Master Course, Ch. 14", () => {
    // His list from Feb 25 1901, read in 1931. Jun 12 (printed as 135°, out
    // of order) is left out.
    const gann: Array<[string, number]> = [
      ["1931-04-12", 45],
      ["1931-04-27", 60],
      ["1931-05-28", 90],
      ["1931-06-28", 120],
      ["1931-07-30", 150],
      ["1931-08-30", 180],
      ["1931-10-14", 225],
      ["1931-10-30", 240],
      ["1931-11-29", 270],
      ["1931-12-28", 300],
      ["1932-01-11", 315],
      ["1932-01-27", 330],
      ["1932-02-25", 360],
    ];
    for (const [date, degrees] of gann) {
      expect(readIncorporationCycle(USX, on(date))?.degree?.degrees, date).toBe(degrees);
    }
  });

  it("reads Feb 1931 as the 30-year cycle from incorporation, in the anniversary month", () => {
    const r = readIncorporationCycle(USX, on("1931-02-25"))!;
    expect(r.ageYears).toBe(30);
    expect(r.degree?.degrees).toBe(360);
    expect(r.anniversaryMonth).toBe(true);
    expect(r.completingCycles).toEqual(expect.arrayContaining([5, 10, 15, 30]));
  });

  it("gives no degree between the seasonal points", () => {
    expect(readIncorporationCycle(USX, on("1931-03-20"))?.degree).toBeNull();
  });

  it("uses only what a month-precise date supports", () => {
    const r = readIncorporationCycle({ date: "1976-04-01", precision: "month" }, on("2026-04-20"))!;
    expect(r.anniversaryMonth).toBe(true);
    expect(r.degree).toBeNull();
    expect(r.completingCycles).toEqual(expect.arrayContaining([5, 10, 50]));
  });

  it("gives cycle years only for a year-precise date", () => {
    const r = readIncorporationCycle({ date: "1968-01-01", precision: "year" }, on("2026-01-01"))!;
    expect(r.degree).toBeNull();
    expect(r.anniversaryMonth).toBe(false);
    expect(r.completingCycles).toEqual([]);
    expect(readIncorporationCycle({ date: "1966-01-01", precision: "year" }, on("2026-06-01"))!.completingCycles).toEqual(
      expect.arrayContaining([5, 10, 15, 20, 30, 60]),
    );
  });

  it("is absent for a date after the session", () => {
    expect(readIncorporationCycle({ date: "2030-01-01", precision: "day" }, on("2026-01-01"))).toBeNull();
  });
});
