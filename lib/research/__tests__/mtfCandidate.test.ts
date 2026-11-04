import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STARRED_ANGLES_DEG } from "@/lib/gann/angleMonthCounts";
import {
  COVERAGE_BUDGET,
  MONTH_COUNTS,
  R01_INPUT_CONTRACT,
  YEAR_COUNTS,
  calendarMonthsBetween,
  decimalDigitalRoot,
  inputHash,
  projectAll,
  runR01,
  type R01Input,
} from "@/lib/research/mtfCandidate";

const fixtures = path.resolve(__dirname, "../../..", "docs/research/mtf-r0-1");
const load = (f: string) => JSON.parse(readFileSync(path.join(fixtures, f), "utf8")) as R01Input;

const base = (over: Partial<R01Input> = {}): R01Input => ({
  contract: R01_INPUT_CONTRACT,
  symbol: "SYNTH",
  issueSession: "2030-11-15",
  horizonEnd: "2031-01-31",
  trend: "up",
  trendSource: "synthetic",
  majorAnchors: [{ id: "M1", date: "2025-12-10", kind: "top", confirmed: "2026-01-30", episode: "E1", source: "synthetic" }],
  reactionAnchors: [{ id: "R1", date: "2030-11-02", kind: "bottom", confirmed: "2030-11-07", episode: "E2", mode: "rapid", modeSource: "synthetic", source: "synthetic" }],
  ...over,
});

describe("MTF-R0.1 arithmetic", () => {
  it("reproduces the source's 135-month count, August 1896 to November 1907", () => {
    expect(calendarMonthsBetween("1896-08-01", "1907-11-30")).toBe(135);
    const p = projectAll(base({ issueSession: "1896-09-30", horizonEnd: "1960-01-01", majorAnchors: [{ id: "A", date: "1896-08-08", kind: "bottom", confirmed: "1896-09-30", episode: "E", source: "t" }], reactionAnchors: [] }));
    expect(p.find((x) => x.start === "1907-11-01")?.rules).toEqual(["month:135"]);
  });

  it("reproduces 240 months, September 1909 to September 1929, as one projection with its 20-year alias", () => {
    expect(calendarMonthsBetween("1909-09-15", "1929-09-03")).toBe(240);
    const p = projectAll(base({ issueSession: "1909-10-29", horizonEnd: "1990-01-01", majorAnchors: [{ id: "A", date: "1909-09-15", kind: "top", confirmed: "1909-10-29", episode: "E", source: "t" }], reactionAnchors: [] }));
    const sep29 = p.filter((x) => x.start === "1929-09-01");
    expect(sep29).toHaveLength(1);
    expect(sep29[0].rules).toEqual(["year:20", "month:240"]);
  });

  it("uses the named year counts and the twelve starred months only, never their multiples", () => {
    expect(MONTH_COUNTS).toEqual(STARRED_ANGLES_DEG);
    expect(YEAR_COUNTS).toEqual([1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 60]);
    const p = projectAll(base({ issueSession: "2000-01-31", horizonEnd: "2100-01-01", majorAnchors: [{ id: "A", date: "2000-01-10", kind: "top", confirmed: "2000-01-31", episode: "E", source: "t" }], reactionAnchors: [] }));
    const offsets = p.map((x) => calendarMonthsBetween("2000-01-10", x.start));
    expect(offsets).not.toContain(48); // 4 years: not a named count
    expect(offsets).not.toContain(270 * 2);
    expect(new Set(offsets)).toEqual(new Set([...YEAR_COUNTS.map((n) => n * 12), ...MONTH_COUNTS]));
  });

  it("keeps calendar-month precision: the whole target month, not the pivot's day", () => {
    const m = projectAll(base()).find((x) => x.group === "calendar_recurrence" && x.start.startsWith("2030-12"))!;
    expect([m.start, m.end, m.precision]).toEqual(["2030-12-01", "2030-12-31", "calendar_month"]);
  });

  it("projects 14-28 days for an ordinary reaction and 42-49 for a rapid move", () => {
    const r = (mode: "ordinary" | "rapid") => projectAll(base({ reactionAnchors: [{ ...base().reactionAnchors[0], mode }] })).find((x) => x.group === "swing_duration")!;
    expect([r("ordinary").start, r("ordinary").end]).toEqual(["2030-11-16", "2030-11-30"]);
    expect([r("rapid").start, r("rapid").end]).toEqual(["2030-12-14", "2030-12-21"]);
  });
});

describe("MTF-R0.1 causality and determinism", () => {
  it("rejects an anchor that occurs after the issue session", () => {
    const o = runR01(base({ majorAnchors: [{ ...base().majorAnchors[0], date: "2030-11-16", confirmed: "2030-11-16" }] }));
    expect(o.status).toBe("rejected_input");
    expect(o.reasons.join()).toMatch(/after the issue session/);
  });

  it("rejects an anchor not yet confirmed at issue, or confirmed before it happened", () => {
    expect(runR01(base({ reactionAnchors: [{ ...base().reactionAnchors[0], confirmed: "2030-11-20" }] })).reasons.join()).toMatch(/not confirmed/);
    expect(runR01(base({ reactionAnchors: [{ ...base().reactionAnchors[0], confirmed: "2030-11-01" }] })).reasons.join()).toMatch(/confirmed before/);
  });

  it("rejects a reaction anchor whose mode was not fixed at issue", () => {
    const bad = { ...base().reactionAnchors[0], mode: undefined } as unknown as R01Input["reactionAnchors"][number];
    expect(runR01(base({ reactionAnchors: [bad] })).status).toBe("rejected_input");
  });

  it("is deterministic: the same input gives the same output and hash, whatever the key order", () => {
    const a = base();
    const reverseKeys = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(reverseKeys) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)])) : v;
    const b = reverseKeys(a) as R01Input;
    expect(Object.keys(b)[0]).not.toBe(Object.keys(a)[0]);
    expect(runR01(a)).toEqual(runR01(a));
    expect(inputHash(b)).toBe(inputHash(a));
    expect(inputHash(base({ trend: "down" }))).not.toBe(inputHash(a));
  });
});

describe("MTF-R0.1 windows", () => {
  it("synthetic convergence: the December anniversary month meets the rapid band from November 2 on December 14-21", () => {
    const o = runR01(load("synthetic_convergence_input.json"));
    expect(o.status).toBe("issued");
    expect(o.windows.map((w) => [w.start, w.end])).toEqual([["2030-12-14", "2030-12-21"]]);
    expect(o.windows[0].days[0].supports.map((s) => s.group).sort()).toEqual(["calendar_recurrence", "swing_duration"]);
    expect(o.expectedType).toBe("top_watch");
    expect(o.calibration).toBe("uncalibrated");
  });

  it("synthetic input: no forecast, since the anniversary month had already started at issue", () => {
    const o = runR01(load("synthetic_input.json"));
    expect(o.status).toBe("no_forecast");
    const dec = o.projections.find((p) => p.group === "calendar_recurrence" && p.start === "2030-12-01")!;
    expect(dec.status).toBe("started"); // kept as raw evidence, never clipped and reissued
  });

  it("caps aliases: two calendar projections of one episode support a date once", () => {
    const two = base({ majorAnchors: [base().majorAnchors[0], { id: "M2", date: "2027-12-20", kind: "bottom", confirmed: "2028-01-31", episode: "E1", source: "t" }] });
    const o = runR01(two);
    expect(o.windows[0].days[0].supports.filter((s) => s.group === "calendar_recurrence")).toHaveLength(1);
  });

  it("does not flag a date supported by one episode in both groups", () => {
    const o = runR01(base({ reactionAnchors: [{ ...base().reactionAnchors[0], episode: "E1" }] }));
    expect(o.status).toBe("no_forecast");
  });

  it("abstains from the whole issue when more than 20% of the horizon is flagged", () => {
    const o = runR01(base({ horizonEnd: "2030-12-31" })); // 8 of 46 days = 17.4%: issued
    expect(o.status).toBe("issued");
    const dense = runR01(base({ horizonEnd: "2030-12-31", reactionAnchors: [{ ...base().reactionAnchors[0], date: "2030-11-14", confirmed: "2030-11-15", mode: "ordinary" }] }));
    // ordinary band Nov 28 - Dec 12 meets December on Dec 1-12: 12 of 46 days = 26% > 20%
    expect(dense.status).toBe("abstained_coverage");
    expect(dense.windows).toEqual([]);
    expect(dense.coverage).toBeGreaterThan(COVERAGE_BUDGET);
  });

  it("issues at exactly the 20% budget (the rule is 'more than')", () => {
    const o = runR01(base({ issueSession: "2030-11-21", horizonEnd: addDaysLocal("2030-11-21", 40) })); // Dec 31: 8 of 40 = 20%
    expect(o.coverage).toBeCloseTo(0.2, 10);
    expect(o.status).toBe("issued");
  });

  it("keeps a source window that ends past the horizon as raw evidence and excludes it from selection", () => {
    const o = runR01(base({ horizonEnd: "2030-12-25" }));
    expect(o.projections.find((p) => p.start === "2030-12-01" && p.group === "calendar_recurrence")!.status).toBe("beyond_horizon");
    expect(o.status).toBe("no_forecast");
  });

  it("outputs no probability, price target or order", () => {
    const o = runR01(base()) as unknown as Record<string, unknown>;
    for (const k of ["probability", "winProbability", "target", "priceTarget", "entry", "order"]) expect(o).not.toHaveProperty(k);
  });
});

describe("decimal digital root (metadata only)", () => {
  it("sums the digits with the separator removed, 0 read as 9", () => {
    expect(decimalDigitalRoot("125.40")).toBe(3);
    expect(decimalDigitalRoot("9")).toBe(9);
    expect(decimalDigitalRoot("18.00")).toBe(9);
    expect(decimalDigitalRoot("0.07")).toBe(7);
  });

  it("rejects zero, negative, non-finite, exponent-form and malformed strings", () => {
    for (const v of ["0", "0.00", "-5", "1e3", "Infinity", "NaN", "", " 12", "1.2.3", ".5", "5.", "1,000"]) expect(() => decimalDigitalRoot(v)).toThrow();
  });
});

function addDaysLocal(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
