import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HORA_TESTS, choghadiyaAt, horaAt, horaTest, sunDay } from "@/lib/research/horaTiming";

const run = JSON.parse(readFileSync(path.resolve(__dirname, "../../..", "docs/replay-runs/2026-10-30-hora-timing.json"), "utf8"));

describe("Hora and Choghadiya", () => {
  it("start each day with the weekday's lord and follow the Chaldean order", () => {
    // 21 Jun 2021 was a Monday: the Moon rules the first Hora and the first Choghadiya (Amrit).
    const { rise, set } = sunDay("2021-06-21");
    expect(horaAt("2021-06-21", rise + 60_000)).toBe("Moon");
    expect(choghadiyaAt("2021-06-21", rise + 60_000)).toBe("Moon");
    // The second Hora follows the Moon in the Chaldean order, wrapping to Saturn.
    const hora = (set - rise) / 12;
    expect(horaAt("2021-06-21", rise + hora + 60_000)).toBe("Saturn");
    expect(horaAt("2021-06-21", set + 60_000)).toBeNull();
  });

  it("the committed run still says what the module computes", { timeout: 300_000 }, () => {
    expect(run.tests).toBe(HORA_TESTS);
    for (const row of run.test) {
      const r = horaTest(row.symbol, "sameWeekday");
      expect([r.bad.observed, r.good.observed, r.hora.observed]).toEqual([row.bad.observed, row.good.observed, row.hora.observed]);
      // The finding the docs report: with the weekday held, nothing beats chance.
      for (const p of [r.bad.p, r.good.p, r.hora.p]) expect(p).toBeGreaterThan(0.05 / HORA_TESTS);
    }
  });
});
