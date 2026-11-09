import { describe, expect, it } from "vitest";
import { hexLinesAt, hexNumberOnLine, hexNumbersOnLine, readHexagonTime } from "../hexagonTime";

// The lines are checked against Gann's hand-drawn Hexagon plate, printed
// p. 422 of the Master Course PDF (reading log A2.1, 2026-10-01).

describe("the lines of the plate", () => {
  it("puts the ring completions on the 0°/360° line", () => {
    expect(hexNumbersOnLine(360, 400)).toEqual([7, 19, 37, 61, 91, 127, 169, 217, 271, 331, 397]);
    expect(hexNumbersOnLine(0, 400)).toEqual(hexNumbersOnLine(360, 400));
  });

  it("puts the second series, 66 included, on the 60° line", () => {
    expect(hexNumbersOnLine(60, 350)).toEqual([2, 9, 22, 41, 66, 97, 134, 177, 226, 281, 342]);
  });

  it("gives the other corners as on the plate", () => {
    expect(hexNumbersOnLine(120, 360)).toEqual([3, 11, 25, 45, 71, 103, 141, 185, 235, 291, 353]);
    expect(hexNumbersOnLine(180, 370)).toEqual([4, 13, 28, 49, 76, 109, 148, 193, 244, 301, 364]);
    expect(hexNumbersOnLine(240, 380)).toEqual([5, 15, 31, 53, 81, 115, 155, 201, 253, 311, 375]);
    expect(hexNumbersOnLine(300, 390)).toEqual([6, 17, 34, 57, 86, 121, 162, 209, 262, 321, 386]);
  });

  it("puts the mid-sides on whole cells only on even rings", () => {
    expect(hexNumbersOnLine(90, 300)).toEqual([10, 43, 100, 181, 286]);
    expect(hexNumberOnLine(30, 2)).toBe(8);
    expect(hexNumberOnLine(30, 4)).toBe(39);
    expect(hexNumberOnLine(30, 3)).toBeNull();
    expect(hexNumberOnLine(150, 2)).toBe(12);
    expect(hexNumberOnLine(210, 2)).toBe(14);
    expect(hexNumberOnLine(270, 2)).toBe(16);
    expect(hexNumberOnLine(330, 2)).toBe(18);
  });

  it("does not put 66 on 180° (the text and the plate conflict; the plate is followed)", () => {
    expect(hexNumbersOnLine(180, 400)).not.toContain(66);
  });

  it("finds a count on a line within tolerance, completions first", () => {
    expect(hexLinesAt(127.3, 0.5)[0]).toEqual({ number: 127, angle: 0, kind: "completion" });
    expect(hexLinesAt(66.4, 0.5)[0]).toEqual({ number: 66, angle: 60, kind: "corner" });
    expect(hexLinesAt(5, 1)).toEqual([]);
  });
});

describe("readHexagonTime", () => {
  const DAY = 86_400_000;
  const end = Date.parse("2026-10-16T00:00:00Z");
  const bar = (ms: number, h: number, l: number) => ({ t: new Date(ms).toISOString(), h, l });

  it("reads 127 months from the low as a ring completion and a named count", () => {
    const start = end - 127 * (365.25 / 12) * DAY;
    const hits = readHexagonTime([bar(start, 10, 5), bar(end, 20, 15)]);
    const months = hits.find((h) => h.pivot === "low" && h.unit === "months");
    expect(months?.line?.number).toBe(127);
    expect(months?.line?.kind).toBe("completion");
    expect(months?.named).toBe(127);
  });

  it("reads 60 months as a named count even off the lines", () => {
    const start = end - 60 * (365.25 / 12) * DAY;
    const hits = readHexagonTime([bar(start, 10, 5), bar(end, 20, 15)]);
    const months = hits.find((h) => h.pivot === "low" && h.unit === "months");
    expect(months?.named).toBe(60);
  });

  it("returns nothing for too few bars", () => {
    expect(readHexagonTime([bar(end, 2, 1)])).toEqual([]);
  });
});
