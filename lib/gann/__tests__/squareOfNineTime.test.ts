import { describe, expect, it } from "vitest";
import { linesAt, numberOnLine, numbersOnLine, readSquareOfNineTime } from "../squareOfNineTime";

// The lines are checked against Gann's plate as transcribed from the Cycles
// Research Institute workbook (source note B12) and his 1931 spoke lists.

describe("the lines of the plate", () => {
  it("gives the 1931 lesson's 45° and 225° spokes", () => {
    expect(numbersOnLine(45, 400)).toEqual([3, 13, 31, 57, 91, 133, 183, 241, 307, 381]);
    expect(numbersOnLine(225, 400)).toEqual([7, 21, 43, 73, 111, 157, 211, 273, 343]);
  });

  it("gives the cardinal cross as on the plate", () => {
    expect(numbersOnLine(0, 400)).toEqual([2, 11, 28, 53, 86, 127, 176, 233, 298, 371]);
    expect(numbersOnLine(90, 400)).toEqual([4, 15, 34, 61, 96, 139, 190, 249, 316, 391]);
    expect(numbersOnLine(180, 420)).toEqual([6, 19, 40, 69, 106, 151, 204, 265, 334, 411]);
    expect(numbersOnLine(270, 440)).toEqual([8, 23, 46, 77, 116, 163, 218, 281, 352, 431]);
  });

  it("puts the odd squares on 315°", () => {
    expect(numbersOnLine(315, 450)).toEqual([9, 25, 49, 81, 121, 169, 225, 289, 361, 441]);
  });

  it("puts the 22.5° lines on whole cells only on even rings, as the workbook highlights", () => {
    expect(numberOnLine(22.5, 2)).toBe(12);
    expect(numberOnLine(22.5, 3)).toBeNull();
    expect(numberOnLine(22.5, 4)).toBe(55);
    expect(numberOnLine(337.5, 2)).toBe(10);
    expect(numberOnLine(337.5, 4)).toBe(51);
    expect(numberOnLine(337.5, 6)).toBe(124);
  });
});

describe("time on the lines", () => {
  it("finds 90 days on the 45° line (the fixed cross)", () => {
    const hit = linesAt(90, 1).find((h) => h.number === 91);
    expect(hit?.angle).toBe(45);
    expect(hit?.kind).toBe("fixed");
  });

  it("skips the first ring, where every cell is on a line", () => {
    expect(linesAt(5, 1)).toEqual([]);
  });

  it("reads days from the extreme low", () => {
    // Low on day 0, then 61 days on: 61 is on the 90° line.
    const bars = Array.from({ length: 62 }, (_, i) => ({
      t: new Date(Date.UTC(2024, 0, 1 + i)).toISOString(),
      h: i === 30 ? 120 : 110,
      l: i === 0 ? 90 : 100,
    }));
    const hits = readSquareOfNineTime(bars);
    expect(hits.some((h) => h.pivot === "low" && h.unit === "days" && h.line.number === 61 && h.line.kind === "cardinal")).toBe(true);
  });
});
