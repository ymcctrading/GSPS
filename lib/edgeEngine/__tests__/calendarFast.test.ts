import { describe, expect, it } from "vitest";
import { BarClock, DAY_MS, isWeekday, weekdaysBetween } from "@/lib/edgeEngine/calendar";
import { goertzel } from "@/lib/edgeEngine/time";

// The one-day-at-a-time walks the closed forms replaced (2026-11-11), kept here as the reference.
const refWeekday = (x: number) => {
  const wd = new Date(x * DAY_MS).getUTCDay();
  return wd !== 0 && wd !== 6;
};
function refIndexOnOrAfter(days: number[], d: number): number {
  const last = days[days.length - 1];
  let i = days.length - 1;
  for (let x = last + 1; x <= d; x++) if (refWeekday(x)) i++;
  return refWeekday(d) ? i : i + 1;
}
function refDayOf(days: number[], i: number): number {
  let d = days[days.length - 1];
  let k = days.length - 1;
  while (k < i) {
    d++;
    if (refWeekday(d)) k++;
  }
  return d;
}

let seed = 20261111;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

describe("edge engine calendar: closed-form weekday counts equal the day-by-day walk", () => {
  it("isWeekday matches Date.getUTCDay on every day from 1960 to 2040", () => {
    for (let x = -3653; x <= 25567; x++) expect(isWeekday(x)).toBe(refWeekday(x));
  });

  it("weekdaysBetween matches a day-by-day count, empty and reversed ranges included", () => {
    for (let k = 0; k < 3000; k++) {
      const from = 17000 + Math.floor(rand() * 4000);
      const to = from - 3 + Math.floor(rand() * 900);
      let c = 0;
      for (let x = from; x <= to; x++) if (refWeekday(x)) c++;
      expect(weekdaysBetween(from, to)).toBe(c);
    }
  });

  it("indexOnOrAfter and dayOf past the data equal the old walks, whatever weekday the data ends on", () => {
    for (let end = 0; end < 7; end++) {
      // weekday bar dates ending on each day of the week (a weekend end is allowed: the walk never assumed otherwise)
      const days: number[] = [];
      for (let x = 20000; x <= 20300 + end; x++) if (refWeekday(x) || x === 20300 + end) days.push(x);
      const clock = new BarClock(days.map((x) => new Date(x * DAY_MS).toISOString().slice(0, 10)));
      const last = days[days.length - 1];
      for (let d = last + 1; d <= last + 2000; d++) expect(clock.indexOnOrAfter(d)).toBe(refIndexOnOrAfter(days, d));
      for (let i = days.length; i <= days.length + 1500; i++) expect(clock.dayOf(i)).toBe(refDayOf(days, i));
      // inside the data nothing changed
      expect(clock.dayOf(5)).toBe(days[5]);
      expect(clock.indexOnOrAfter(days[7])).toBe(7);
    }
  });
});

describe("edge engine goertzel: cached trig tables give the inline formula's values exactly", () => {
  it("power and phase are bit-identical for every period the cycle scan reads", () => {
    const x = Float64Array.from({ length: 256 }, () => rand() - 0.5);
    for (let per = 8; per <= 128; per++) {
      const w = (2 * Math.PI) / per;
      let re = 0;
      let im = 0;
      for (let i = 0; i < x.length; i++) {
        re += x[i] * Math.cos(w * i);
        im -= x[i] * Math.sin(w * i);
      }
      const g = goertzel(x, per);
      expect(g.power).toBe(re * re + im * im);
      expect(g.phase).toBe(Math.atan2(im, re));
      expect(goertzel(x, per)).toEqual(g); // second call reads the cached table
    }
  });
});
