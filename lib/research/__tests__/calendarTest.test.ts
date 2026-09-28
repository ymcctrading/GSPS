import { describe, expect, it } from "vitest";
import { catches, holm, marchEquinox, scoreCell, windowInstances, W1 } from "@/lib/research/calendarTest";

const DAY = 86_400_000;

describe("calendar test", () => {
  it("places the March equinox on March 20 or 21", () => {
    for (const y of [1929, 1940, 2000, 2024]) {
      const d = new Date(marchEquinox(y));
      expect(d.getUTCMonth()).toBe(2);
      expect([19, 20, 21]).toContain(d.getUTCDate());
    }
  });

  it("maps windows under each convention", () => {
    const cal = windowInstances(W1, 1929, 2020, "calendar")[1];
    expect(new Date(cal[0]).toISOString().slice(0, 10)).toBe("2020-03-21");
    const d364 = windowInstances(W1, 1929, 1930, "364")[1];
    expect(new Date(d364[0]).toISOString().slice(0, 10)).toBe("1930-03-20");
  });

  it("finds a pivot inside a window's tolerance", () => {
    const t0 = Date.UTC(2020, 0, 1);
    const sessions = Array.from({ length: 30 }, (_, i) => t0 + i * DAY);
    expect(catches(sessions, new Set([12]), [t0 + 10 * DAY, t0 + 10 * DAY])).toBe(true);
    expect(catches(sessions, new Set([20]), [t0 + 10 * DAY, t0 + 10 * DAY])).toBe(false);
  });

  it("scores a series and applies Holm", () => {
    const t0 = Date.UTC(2015, 0, 1);
    const sessions = Array.from({ length: 365 * 6 }, (_, i) => t0 + i * DAY);
    const pivots = sessions.map((_, i) => i).filter((i) => i % 17 === 0);
    const r = scoreCell("TEST", { sessions, pivots }, "W1", "calendar");
    expect(r.instances).toBe(8 * (r.years[1] - r.years[0] + 1));
    expect(r.p).toBeGreaterThan(0);
    holm([r]);
    expect(typeof r.holmSignificant).toBe("boolean");
  });
});
