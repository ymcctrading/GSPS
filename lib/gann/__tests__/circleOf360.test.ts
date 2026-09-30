import { describe, expect, it } from "vitest";
import { MAJOR_DEGREES, divisionOf, readDegree, readTimeAngle, tableOf64ths } from "../circleOf360";

// Gann's own numbers: the 1953 lesson (May soy beans, the table of 64ths)
// and GA-32 (U.S. Steel, 1915). Source note A12.

describe("the table of 64ths", () => {
  it("steps by 5⅝ and ends on 90, 180, 270 and 360 at rows 16, 32, 48, 64", () => {
    const t = tableOf64ths();
    expect(t[15].degrees).toBe(90);
    expect(t[31].degrees).toBe(180);
    expect(t[47].degrees).toBe(270);
    expect(t[63].degrees).toBe(360);
  });

  it("corrects the three printed misprints (rows 3, 15, 34)", () => {
    const t = tableOf64ths();
    expect(t[2].degrees).toBe(16.875); // printed 16 5/8
    expect(t[14].degrees).toBe(84.375); // printed 84 5/8
    expect(t[33].degrees).toBe(191.25); // printed 101 1/4
  });

  it("ranks divisions in the lesson's order", () => {
    expect(divisionOf(180)).toBe(2);
    expect(divisionOf(120)).toBe(3);
    expect(divisionOf(90)).toBe(4);
    expect(divisionOf(60)).toBe(6);
    expect(divisionOf(135)).toBe(8);
    expect(divisionOf(30)).toBe(12);
    expect(divisionOf(22.5)).toBe(16);
    expect(divisionOf(255)).toBe(24); // the ÷24 list the text prints omits 255
    expect(divisionOf(11.25)).toBe(32);
    expect(divisionOf(5.625)).toBe(64);
    expect(MAJOR_DEGREES).toEqual([0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360]);
  });
});

describe("the May soy beans reading", () => {
  it("puts the half-way point 251⅞ very close to 253⅛, the 45th 64th", () => {
    const r = readDegree((436.75 + 67) / 2);
    expect(r.value).toBeCloseTo(251.875, 6);
    expect(r.nearest.degree).toBeCloseTo(253.125, 6);
    expect(r.veryClose).toBe(true);
  });

  it("puts half of 436¾ (218⅜) very close to 219⅜, the 39th 64th", () => {
    const r = readDegree(436.75 / 2);
    expect(r.nearest.degree).toBeCloseTo(219.375, 6);
    expect(r.veryClose).toBe(true);
  });

  it("puts the 44-to-436¾ half-way (240⅜) on 240, a triangle point", () => {
    const r = readDegree((44 + 436.75) / 2);
    expect(r.nearest.degree).toBe(240);
    expect(r.major).toBe(true);
  });

  it("puts the 44 low one from 45, and the 67 low within ½ of 67½", () => {
    expect(readDegree(44).major).toBe(true);
    const r = readDegree(67);
    expect(r.nearest.degree).toBe(67.5);
    expect(r.nearest.distance).toBe(0.5);
  });

  it("reads 180 months (Dec 1932 to Dec 1947) as half the circle", () => {
    const r = readDegree(180);
    expect(r.nearest.division).toBe(2);
    expect(r.major).toBe(true);
  });
});

describe("GA-32: price on the degree of its time angle", () => {
  it("reads U.S. Steel at $38, 168 months old, as behind time against a balance of $46⅔", () => {
    const t = readTimeAngle(38, 1, "1901-02-25", new Date("1915-02-25T00:00:00Z"))!;
    expect(Math.round(t.months)).toBe(168);
    expect(t.balancePrice).toBeCloseTo(46.67, 1);
    expect(t.state).toBe("behind");
    expect(t.difference).toBeCloseTo(-8.66, 1);
  });

  it("reads $37½ as 135° and $262½ as 225° of the third hundred", () => {
    const asOf = new Date("1915-02-25T00:00:00Z");
    expect(readTimeAngle(37.5, 1, "1901-02-25", asOf)!.priceDegree).toBeCloseTo(135, 6);
    expect(readTimeAngle(262.5, 1, "1901-02-25", asOf)!.priceDegree).toBeCloseTo(225, 6);
  });

  it("reads 50 on the 180th month as balanced", () => {
    const start = new Date("2000-01-01T00:00:00Z");
    const asOf = new Date(start.getTime() + 180 * (365.25 / 12) * 86_400_000);
    expect(readTimeAngle(50, 1, "2000-01-01", asOf)!.state).toBe("balanced");
  });
});
