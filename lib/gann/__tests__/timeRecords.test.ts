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
