/**
 * CYC-47 (Tomes, W043 pp. 1-2) and CYC-30 (Halberg, W041 pp. 29-30): a time
 * line shown to a trader carries its method's measured record against a base
 * rate, or is not shown. AGENTS.md "Forward-looking claims": an undocumented
 * projection stays out.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeMacroCycle } from "@/lib/gann/macroCycle";
import { displayableUpcomingMajor, TIME_LINE_RECORDS } from "@/lib/gann/timeRecords";

describe("measured records for the card's time lines", () => {
  it("points every record at a committed run that holds the family it names", () => {
    for (const [line, rec] of Object.entries(TIME_LINE_RECORDS)) {
      if (!rec) continue;
      expect(existsSync(rec.run), line).toBe(true);
      const run = JSON.parse(readFileSync(rec.run, "utf8")) as { families: { family: string; beatsRandom: boolean; hitRate: number; baseMean: number }[] };
      for (const fam of rec.families) {
        const f = run.families.find((x) => x.family === fam);
        expect(f, `${line}: ${fam}`).toBeDefined();
        expect(f!.beatsRandom).toBe(rec.beatsRandom);
      }
    }
  });

  it("returns no upcoming macro window for display while it has no measured record", () => {
    expect(TIME_LINE_RECORDS.macroCycle).toBeNull();
    const r = computeMacroCycle(new Date("2026-10-16T00:00:00Z"));
    expect(r.upcomingMajor.length).toBeGreaterThan(0);
    expect(displayableUpcomingMajor(r)).toEqual([]);
  });

  it("keeps the next-major date out of the explanation trace too", () => {
    expect(readFileSync("lib/signals/confluence/gann.ts", "utf8")).not.toMatch(/upcomingMajor\[0\]/);
  });
});

/**
 * CYC-30 on every surface: the page headers' turn-window and yearly-cycle
 * badges are time lines too, so each is rendered only behind its record.
 */
describe("time-line badges outside the card", () => {
  const PAGES = ["components/scan/ticker-view.tsx", "components/chart/market-tabs.tsx", "components/chart/public-chart.tsx"];
  const OPENER = /\{[^{}\n]*?(timingActive|longTermTimingCount)[^{}\n]*?&&\s*\(/g;

  it("has no record for the yearly-cycle convergence yet, since the committed run does not hold its family", () => {
    expect(TIME_LINE_RECORDS.yearCycles).toBeNull();
    const run = JSON.parse(readFileSync(TIME_LINE_RECORDS.timeCycle!.run, "utf8")) as { families: { family: string }[] };
    expect(run.families.some((f) => f.family === "yearCycles")).toBe(false);
  });

  it("renders the turn-window and yearly-cycle badges only behind their records", () => {
    let openers = 0;
    for (const page of PAGES) {
      const src = readFileSync(page, "utf8");
      for (const m of src.matchAll(OPENER)) {
        openers++;
        const need = m[1] === "timingActive" ? "TIME_LINE_RECORDS.timeCycle" : "TIME_LINE_RECORDS.yearCycles";
        expect(m[0], page).toContain(need);
      }
      expect(src, page).toMatch(/TIME_LINE_RECORDS\.timeCycle\.summary/);
    }
    expect(openers).toBe(6);
  });
});
