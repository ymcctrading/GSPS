import { describe, expect, it } from "vitest";
import { eclipseBreakOn, eclipseBreakWindows, eclipseCrossings, eclipsesBetween } from "@/lib/gann/eclipseLongitude";
import type { Bar } from "@/lib/types";
import { timeWindowsAt } from "@/lib/gann/timeWindow";

const DAY = 86_400_000;

describe("M-S4: eclipse longitudes (Mikula's reading, W012 PDF pp. 32-35; labelled reconstruction)", () => {
  it("finds the Jan 29, 1907 lunar eclipse at 8°30' Aquarius and Venus crossing it on Mar 14", () => {
    const lunar = eclipsesBetween(new Date("1907-01-01"), new Date("1907-02-15")).find((e) => e.kind === "lunar")!;
    expect(lunar.peak.slice(0, 10)).toBe("1907-01-29");
    expect(lunar.longitude).toBeCloseTo(308.5, 0);
    const venus = eclipseCrossings(lunar).filter((c) => c.planet === "Venus");
    expect(venus.map((c) => c.date)).toContain("1907-03-14");
  });

  it("finds the May 3, 1901 penumbral eclipse at 12°36' Taurus and Mercury crossing it on May 9-10", () => {
    const lunar = eclipsesBetween(new Date("1901-04-25"), new Date("1901-05-10")).find((e) => e.kind === "lunar")!;
    expect(lunar.peak.slice(0, 10)).toBe("1901-05-03");
    expect(lunar.longitude).toBeCloseTo(42.6, 0);
    // Mercury passes 42.6° between noon UTC May 9 (41.97°) and May 10 (44.08°):
    // the evening of the 9th, so the first noon past it is the 10th.
    const mercury = eclipseCrossings(lunar).filter((c) => c.planet === "Mercury");
    expect(mercury[0].date).toBe("1901-05-10");
  });

  it("reads an eclipse beside a 3-Day Chart top as a break window, and none away from a top", () => {
    // Daily bars from Dec 1906: up into a top on Jan 28, 1907, then down.
    const start = Date.parse("1906-12-03T00:00:00Z");
    const bars: Bar[] = [];
    for (let i = 0; i < 100; i++) {
      const c = i <= 56 ? 100 + i : 156 - (i - 56);
      bars.push({ t: new Date(start + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1000 });
    }
    const windows = eclipseBreakWindows(bars);
    expect(windows.some((w) => w.eclipse.peak.startsWith("1907-01-29"))).toBe(true);
    // The Jan 14 solar eclipse is 14 sessions before the top, outside the window.
    expect(windows.some((w) => w.eclipse.peak.startsWith("1907-01-14"))).toBe(false);
  });

  it("acts as a dated window for a top on the crossing day, through the shared time-window hold", () => {
    const start = Date.parse("1906-12-03T00:00:00Z");
    const through = (end: string) => {
      const bars: Bar[] = [];
      for (let i = 0; ; i++) {
        const t = new Date(start + i * DAY).toISOString();
        if (t.slice(0, 10) > end) break;
        const c = i <= 56 ? 100 + i : 156 - (i - 56);
        bars.push({ t, o: c, h: c + 0.5, l: c - 0.5, c, v: 1000 });
      }
      return bars;
    };
    const mar14 = through("1907-03-14");
    expect(eclipseBreakOn(mar14, "1907-03-14").map((b) => b.crossing.planet)).toContain("Venus");
    expect(timeWindowsAt(mar14, "1907-03-14", "top")).toContain("Venus crossing the 1907-01-29 lunar eclipse's longitude");
    // A break opens a decline: no mirror window for a bottom.
    expect(timeWindowsAt(mar14, "1907-03-14", "bottom").some((w) => w.includes("eclipse"))).toBe(false);
    // Off the crossing by more than the one-day orb.
    expect(eclipseBreakOn(through("1907-03-20"), "1907-03-20").some((b) => b.crossing.planet === "Venus")).toBe(false);
  });
});
