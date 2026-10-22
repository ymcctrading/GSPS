import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { countWindowsAt, fewRepetitionNote } from "../countWindows";

const DAY = 86_400_000;

function bar(t: string, c: number): Bar {
  return { t, o: c, h: c + 1, l: c - 1, c, v: 1000 };
}

/** One bar per calendar day from 2026-01-01: a clear major low on 2026-01-31, then a rise. */
function withPivotLow(daysAfter: number): Bar[] {
  const pre = Array.from({ length: 30 }, (_, i) => 150 - i * 1.5);
  const post = Array.from({ length: daysAfter }, (_, i) => 105 + i * 0.5 + (i % 6 < 3 ? 0 : -1));
  return [...pre, ...post].map((c, i) => bar(new Date(Date.UTC(2026, 0, 1) + i * DAY).toISOString(), c));
}
const lastDate = (bars: Bar[]) => bars[bars.length - 1].t.slice(0, 10);

describe("countWindowsAt", () => {
  it("reads nothing without bars", () => {
    expect(countWindowsAt([], "2026-04-12")).toEqual([]);
  });

  it("opens the seasonal sixteenth on its date (M-T8), with no polarity of its own", () => {
    const bars = [bar("2026-04-10T00:00:00Z", 100), bar("2026-04-12T00:00:00Z", 101)];
    const w = countWindowsAt(bars, "2026-04-12").filter((x) => x.rule === "M-T8");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ from: null, turn: null });
    expect(w[0].label).toContain("1/16");
  });

  it("does not read the quarters and eighths again, which already act elsewhere", () => {
    const bars = [bar("2026-09-22T00:00:00Z", 100)];
    expect(countWindowsAt(bars, "2026-09-22").some((x) => x.rule === "M-T8")).toBe(false);
  });

  it("opens the winter-quarter count (C-TIME-05)", () => {
    const bars = [bar("2026-02-05T00:00:00Z", 100)];
    expect(countWindowsAt(bars, "2026-02-05").map((x) => x.rule)).toContain("C-TIME-05");
  });

  it("opens the Ch.5 wheel count 30 days from a major low, carrying the low (C-TIME-06)", () => {
    const bars = withPivotLow(31);
    expect(lastDate(bars)).toBe("2026-03-02");
    const w = countWindowsAt(bars, lastDate(bars)).filter((x) => x.rule === "C-TIME-06");
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((x) => x.from === "low")).toBe(true);
    expect(w[0].label).toContain("2026-01-31 low");
  });

  it("opens the 20-week count from a major low (C-TIME-08)", () => {
    const bars = withPivotLow(141);
    const w = countWindowsAt(bars, lastDate(bars)).filter((x) => x.rule === "C-TIME-08");
    expect(w.map((x) => x.label)).toContain("20 weeks from the 2026-01-31 low");
    expect(w.every((x) => x.from === "low")).toBe(true);
  });

  it("closes the wheel count away from its date", () => {
    const bars = withPivotLow(41);
    expect(countWindowsAt(bars, lastDate(bars)).some((x) => x.rule === "C-TIME-06" && x.label.startsWith("30 days"))).toBe(false);
  });

  it("names the turn the 7-14-21 day count expects (C-TIME-18), never a pivot", () => {
    const bars = withPivotLow(21);
    const w = countWindowsAt(bars, lastDate(bars)).filter((x) => x.rule === "C-TIME-18");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ from: null, turn: "top" });
    expect(w[0].label).toContain("a date for a high");
  });

  it("reads the price-as-time counts from the low (C-TIME-07, C-TIME-14, C-TIME-22)", () => {
    const at = (n: number, rule: string) => {
      const bars = withPivotLow(n);
      return countWindowsAt(bars, lastDate(bars)).filter((x) => x.rule === rule);
    };
    expect(at(23, "C-TIME-07")[0]).toMatchObject({ from: "low", label: "22 market days from the 2026-01-31 low, 2 × 11¼" });
    expect(at(77, "C-TIME-14")[0]).toMatchObject({ from: "low", label: "11.25 weeks from the 2026-01-31 low on the square of 90" });
    // The range runs from the opening high down to the later low, so it is counted from the low.
    const range = at(25, "C-TIME-22").find((x) => x.label.startsWith("the range"));
    expect(range).toMatchObject({ from: "low" });
  });

  it("reads the Square of 52 and the Square of 144 from the low (M-T16, C-TIME-16)", () => {
    const at = (n: number, rule: string) => {
      const bars = withPivotLow(n);
      return countWindowsAt(bars, lastDate(bars)).filter((x) => x.rule === rule);
    };
    expect(at(22, "M-T16")[0]).toMatchObject({ from: "low", label: "3.25 weeks from the 2026-01-31 low on the Square of 52" });
    expect(at(84, "C-TIME-16")[0]).toMatchObject({ from: "low" });
  });

  it("names the turn time balance points to, with weeks rounded (M-T11)", () => {
    const wave = Array.from({ length: 106 }, (_, i) => {
      const c = 100 + 15 * Math.sin(i / 12) + i * 0.03;
      return bar(new Date(Date.UTC(2024, 0, 1) + i * DAY).toISOString(), c);
    });
    const w = countWindowsAt(wave, lastDate(wave)).filter((x) => x.rule === "M-T11");
    expect(w.length).toBeGreaterThan(0);
    for (const x of w) {
      expect(x.from).toBeNull();
      expect(["top", "bottom"]).toContain(x.turn);
      expect(x.label).not.toMatch(/\d\.\d{2,}/);
    }
  });

  it("labels a cycle too long to repeat often in the record (CYC-04)", () => {
    expect(fewRepetitionNote(60)).toMatch(/too few repetitions/);
    expect(fewRepetitionNote(90)).toMatch(/too few repetitions/);
    expect(fewRepetitionNote(5)).toBe("");
  });

  it("gives every window a rule and a label", () => {
    const bars = withPivotLow(200);
    for (const w of countWindowsAt(bars, lastDate(bars))) {
      expect(w.rule).toMatch(/^(M-T\d+|C-TIME-\d+)$/);
      expect(w.label.length).toBeGreaterThan(0);
    }
  });
});
