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

describe("holm", () => {
  it("stops at the first p that fails: none of [0.03, 0.04] is significant at 0.05", () => {
    const rs = holm([{ p: 0.04 }, { p: 0.03 }] as { p: number; holmSignificant?: boolean }[]);
    expect(rs.map((r) => r.holmSignificant)).toEqual([false, false]);
  });

  it("marks each p under its step's bound until one fails", () => {
    const rs = holm([{ p: 0.01 }, { p: 0.02 }, { p: 0.5 }] as { p: number; holmSignificant?: boolean }[]);
    expect(rs.map((r) => r.holmSignificant)).toEqual([true, true, false]);
  });
});


describe("CYC-35: pooling across phases can hide a rhythm", () => {
  it("scores each phase of a longer cycle on its own, so a window that works every other year shows", async () => {
    const { scoreCellByPhase } = await import("@/lib/research/calendarTest");
    const t0 = Date.UTC(2010, 0, 1);
    const sessions = Array.from({ length: 365 * 12 }, (_, i) => t0 + i * DAY);
    const at = new Map(sessions.map((t, i) => [t, i]));
    const pivots: number[] = [];
    for (let y = 2011; y <= 2020; y++) {
      if (y % 2) continue;
      for (const [from] of windowInstances(W1, 1929, y, "calendar")) {
        const day = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), new Date(from).getUTCDate());
        const i = at.get(day);
        if (i !== undefined) pivots.push(i);
      }
    }
    const pooled = scoreCell("T", { sessions, pivots }, "W1", "calendar", [2011, 2020]);
    const byPhase = scoreCellByPhase("T", { sessions, pivots }, "W1", "calendar", 2, [2011, 2020]);
    expect(byPhase.map((r) => r.phase)).toEqual([0, 1]);
    // 2011 starts phase 0, so the even years are phase 1.
    expect(byPhase[1].hitRate).toBe(1);
    expect(byPhase[0].hitRate).toBe(0);
    expect(pooled.hitRate).toBeCloseTo(0.5, 1);
    expect(byPhase[1].instances + byPhase[0].instances).toBe(pooled.instances);
  });
});

describe("CYC-24: planted pivots give a small p, random pivots a large one", () => {
  it("separates turns planted in the windows from turns placed at random", async () => {
    const { seeded } = await import("@/lib/research/preregisteredTimeTests");
    const t0 = Date.UTC(2010, 0, 1);
    const sessions = Array.from({ length: 365 * 8 }, (_, i) => t0 + i * DAY);
    const at = new Map(sessions.map((t, i) => [t, i]));
    const planted: number[] = [];
    for (let y = 2011; y <= 2016; y++) for (const [from] of windowInstances(W1, 1929, y, "calendar")) planted.push(at.get(from)!);
    const p1 = scoreCell("P", { sessions, pivots: planted }, "W1", "calendar", [2011, 2016]);
    expect(p1.hitRate).toBe(1);
    expect(p1.p).toBeLessThan(0.05);
    const rand = seeded(24);
    const random = Array.from({ length: planted.length }, () => Math.floor(rand() * sessions.length)).sort((a, b) => a - b);
    const p2 = scoreCell("R", { sessions, pivots: random }, "W1", "calendar", [2011, 2016]);
    expect(p2.p).toBeGreaterThan(0.05);
  });
});

describe("CYC-40: each year convention is scored and the best reported, not assumed", () => {
  it("finds the 364-day convention when the turns follow it, with Holm across the three", async () => {
    const { bestConvention } = await import("@/lib/research/calendarTest");
    const t0 = Date.UTC(2010, 0, 1);
    const sessions = Array.from({ length: 365 * 8 }, (_, i) => t0 + i * DAY);
    const at = new Map(sessions.map((t, i) => [t, i]));
    const pivots: number[] = [];
    for (let y = 2011; y <= 2016; y++) for (const [from] of windowInstances(W1, 1929, y, "364")) {
      const i = at.get(from);
      if (i !== undefined) pivots.push(i);
    }
    pivots.sort((a, b) => a - b);
    const r = bestConvention("T", { sessions, pivots }, "W1", [2011, 2016]);
    expect(r.cells.map((c) => c.convention)).toEqual(["calendar", "solar", "364"]);
    expect(r.cells.every((c) => typeof c.holmSignificant === "boolean")).toBe(true);
    expect(r.best).toBe("364");
    expect(r.bestHolmSignificant).toBe(true);
  });
});
