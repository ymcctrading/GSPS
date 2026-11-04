import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALCULATOR_CONFIGS,
  calculatorDays,
  calculatorRows,
  closeSwings,
  scoreCalculatorAll,
} from "@/lib/research/masterTimeCalculator";

const root = path.resolve(__dirname, "../../..");
const run = JSON.parse(readFileSync(path.join(root, "docs/replay-runs/2026-10-30-master-time-calculator.json"), "utf8"));
const spy = JSON.parse(readFileSync(path.join(root, "lib/research/spyDailyCloses.json"), "utf8"));

describe("calculatorRows reproduces the page's tables", () => {
  // Each expectation is a table the page returned on 2026-10-30.
  it("the defaults", () => {
    expect(calculatorRows("2026-01-01", 30, 1.618, 100)).toEqual([
      { step: 30, date: "2026-02-19", angle: 90, price: 112.78 },
      { step: 60, date: "2026-04-08", angle: 180, price: 127.2 },
      { step: 90, date: "2026-05-27", angle: 270, price: 143.46 },
      { step: 120, date: "2026-07-14", angle: 0, price: 161.8 },
      { step: 150, date: "2026-09-01", angle: 90, price: 182.48 },
      { step: 180, date: "2026-10-19", angle: 180, price: 205.81 },
    ]);
  });

  it("half days round up, and a factor below 1 shrinks the price", () => {
    expect(calculatorRows("2026-01-01", 10, 1.05, 50).map((r) => [r.date, r.price])).toEqual([
      ["2026-01-12", 50.61],
      ["2026-01-22", 51.23],
      ["2026-02-02", 51.86],
      ["2026-02-12", 52.5],
      ["2026-02-23", 53.14],
      ["2026-03-05", 53.8],
    ]);
    expect(calculatorRows("2026-01-01", 1, 0.5, 100).map((r) => [r.date, r.price])).toEqual([
      ["2026-01-02", 84.09],
      ["2026-01-02", 70.71],
      ["2026-01-03", 59.46],
      ["2026-01-03", 50],
      ["2026-01-04", 42.04],
      ["2026-01-04", 35.36],
    ]);
  });

  it("a factor of 1 is a plain count across a year end", () => {
    expect(calculatorRows("2026-03-01", 45, 2, 9).map((r) => r.date)).toEqual([
      "2026-05-30", "2026-08-28", "2026-11-26", "2027-02-24", "2027-05-25", "2027-08-23",
    ]);
  });
});

describe("no projection is used before its pivot is known", () => {
  it("drops steps on or before the known date", () => {
    const day = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
    const plain = CALCULATOR_CONFIGS[1];
    // Pivot 1 Jan, known 15 Mar: the 30- and 60-day steps (31 Jan, 2 Mar) are dropped, 1 Apr is kept.
    const days = calculatorDays(plain, [{ day: day("2026-01-01"), knownFrom: day("2026-03-15") }], 2026);
    expect(days).not.toContain(30);
    expect(days).not.toContain(60);
    expect(days).toContain(90);
  });

  it("a swing is confirmed only by a later close", () => {
    const { turns, anchors } = closeSwings(spy.bars, 0.05);
    expect(turns.length).toBe(anchors.length);
    for (const a of anchors) expect(a.knownFrom).toBeGreaterThan(a.day);
    expect(turns.find((t) => t.date === "2020-03-23")?.kind).toBe("low");
  });
});

describe("the committed run still says what the module computes", () => {
  it("every setting and mode", { timeout: 60_000 }, () => {
    const r = scoreCalculatorAll(spy.bars);
    expect(run.configs.map((c: { config: string; mode: string }) => `${c.config}/${c.mode}`)).toEqual(r.map((c) => `${c.config}/${c.mode}`));
    for (const [i, c] of r.entries()) {
      expect(run.configs[i].calls.hits).toBe(c.calls.hits);
      expect(run.configs[i].nine.hits).toBe(c.nine.hits);
      expect(run.configs[i].three.hits).toBe(c.three.hits);
      for (const k of Object.keys(c.spy!)) expect(run.configs[i].spy[k].hits).toBe(c.spy![k].hits);
      // The finding the docs report: the calculator times nothing beyond chance.
      for (const p of [c.calls.p, c.nine.p, c.three.p, ...Object.values(c.spy!).map((s) => s.p)]) expect(p).toBeGreaterThan(0.05);
    }
  });
});
