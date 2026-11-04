import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BATCH_TESTS, CELESTIAL_RULES, CELESTIAL_TESTS, celestialEventDays, celestialRule } from "@/lib/research/celestialEvents";

const run = JSON.parse(readFileSync(path.resolve(__dirname, "../../..", "docs/replay-runs/2026-10-30-celestial-events.json"), "utf8"));
const day = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(Number(iso.slice(0, 4)), 0, 1)) / 86_400_000);

describe("celestialEventDays", () => {
  it("counts the events a year holds", () => {
    // About 25 lunations, 26 lunar apsides and 27 lunar declination extremes a year.
    expect(celestialEventDays("lunations", 1921).length).toBeGreaterThanOrEqual(24);
    expect(celestialEventDays("lunarApsides", 1921).length).toBeGreaterThanOrEqual(25);
    // The Sun enters Aries about Mar 21 every year.
    const aries = day("1921-03-21");
    expect(celestialEventDays("ingresses", 1921).some((d) => Math.abs(d - aries) <= 1)).toBe(true);
    // The solstices are the Sun's declination extremes.
    const june = day("1921-06-21");
    expect(celestialEventDays("declination", 1921).some((d) => Math.abs(d - june) <= 2)).toBe(true);
  });
});

describe("the committed run still says what the module computes", () => {
  it("every rule", { timeout: 120_000 }, () => {
    expect(run.tests).toBe(CELESTIAL_TESTS);
    expect(run.batchTests).toBe(BATCH_TESTS);
    expect(run.rules.map((r: { rule: string }) => r.rule)).toEqual([...CELESTIAL_RULES]);
    for (const row of run.rules) {
      const r = celestialRule(row.rule);
      expect([r.calls.hits, r.nine.hits, r.three.hits]).toEqual([row.calls.hits, row.nine.hits, row.three.hits]);
      // The finding the docs report: no event kind beats chance after the batch's correction.
      for (const s of [r.calls, r.nine, r.three]) expect(s.p).toBeGreaterThan(0.05 / BATCH_TESTS);
    }
  });
});
