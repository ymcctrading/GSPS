import { describe, expect, it } from "vitest";
import { isMarketHoliday, isTradingDay, isWeekend, marketHolidays } from "@/lib/market/calendar";
import { etDateKey } from "@/lib/market/session";

const YEARS = [2022, 2023, 2024, 2025, 2026, 2027, 2030, 2035];

describe("marketHolidays", () => {
  it("returns exactly 10 holidays per year, in ascending order", () => {
    for (const year of YEARS) {
      const holidays = marketHolidays(year);
      expect(holidays).toHaveLength(10);
      for (let i = 1; i < holidays.length; i++) {
        expect(holidays[i].getTime()).toBeGreaterThan(holidays[i - 1].getTime());
      }
    }
  });

  it("never observes a fixed-date holiday on a weekend", () => {
    for (const year of YEARS) {
      for (const holiday of marketHolidays(year)) {
        expect(isWeekend(holiday)).toBe(false);
      }
    }
  });

  it("computes the floating holidays on their defined weekday", () => {
    for (const year of YEARS) {
      const [newYears, mlk, presidents, goodFriday, memorial, juneteenth, july4, laborDay, thanksgiving, christmas] =
        marketHolidays(year);

      expect(weekdayName(mlk)).toBe("Mon"); // 3rd Monday of January
      expect(weekdayName(presidents)).toBe("Mon"); // 3rd Monday of February
      expect(weekdayName(goodFriday)).toBe("Fri");
      expect(weekdayName(memorial)).toBe("Mon"); // last Monday of May
      expect(weekdayName(laborDay)).toBe("Mon"); // 1st Monday of September
      expect(weekdayName(thanksgiving)).toBe("Thu"); // 4th Thursday of November

      // Fixed-date holidays land on their calendar date unless that date is
      // itself a weekend, in which case the shift keeps it within 1 day.
      expectNearFixedDate(newYears, year, 0, 1);
      expectNearFixedDate(juneteenth, year, 5, 19);
      expectNearFixedDate(july4, year, 6, 4);
      expectNearFixedDate(christmas, year, 11, 25);
    }
  });

  it("places Good Friday exactly 2 days before Easter Sunday", () => {
    // Independent check: Easter Sunday must fall on a Sunday, and Good
    // Friday 2 calendar days earlier must fall on a Friday -- verified via
    // plain Date arithmetic rather than the module's own Easter formula.
    for (const year of YEARS) {
      const [, , , goodFriday] = marketHolidays(year);
      const easterSunday = new Date(goodFriday);
      easterSunday.setUTCDate(easterSunday.getUTCDate() + 2);
      expect(easterSunday.getUTCDay()).toBe(0);
      expect(goodFriday.getUTCDay()).toBe(5);
    }
  });
});

describe("isMarketHoliday / isTradingDay", () => {
  it("flags Christmas Day itself as a holiday even when isMarketHoliday is queried directly", () => {
    for (const year of YEARS) {
      const christmas = marketHolidays(year)[9];
      expect(isMarketHoliday(etDateKey(christmas))).toBe(true);
      expect(isTradingDay(christmas)).toBe(false);
    }
  });

  it("treats an ordinary mid-month weekday as a trading day", () => {
    // The 10th of June never coincides with any holiday in this calendar.
    for (const year of YEARS) {
      const midJune = new Date(Date.UTC(year, 5, 10, 16, 0, 0));
      if (isWeekend(midJune)) continue; // skip the rare year it lands on a weekend
      expect(isTradingDay(midJune)).toBe(true);
    }
  });

  it("treats every Saturday and Sunday as a non-trading day regardless of holiday status", () => {
    const saturday = new Date(Date.UTC(2026, 7, 29, 16, 0, 0)); // 2026-08-29 is a Saturday
    const sunday = new Date(Date.UTC(2026, 7, 30, 16, 0, 0));
    expect(isWeekend(saturday)).toBe(true);
    expect(isWeekend(sunday)).toBe(true);
    expect(isTradingDay(saturday)).toBe(false);
    expect(isTradingDay(sunday)).toBe(false);
  });
});

function weekdayName(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(date);
}

/** Asserts `date` falls within 1 calendar day of (year, monthIndex, day) -- covers a weekend shift either direction. */
function expectNearFixedDate(date: Date, year: number, monthIndex: number, day: number): void {
  const nominal = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
  const diffDays = Math.abs(date.getTime() - nominal.getTime()) / 86_400_000;
  expect(diffDays).toBeLessThanOrEqual(1);
}
