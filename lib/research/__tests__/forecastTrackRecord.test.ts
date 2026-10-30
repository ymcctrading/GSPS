import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOW_SWINGS,
  checkSelfScoredClaims,
  macroCycleRecord,
  monthlyTurns,
  permanentDateWindows,
  poissonBinomialTail,
  pooledForecastScore,
  projectMacroWindows,
  scoreCalls,
  scorePublishedForecasts,
  windowBaseRate,
} from "@/lib/research/forecastTrackRecord";
import { PUBLISHED_FORECASTS } from "@/lib/research/publishedForecasts";

const RUN = "docs/replay-runs/2026-10-30-forecast-track-record.json";
const run = JSON.parse(readFileSync(path.resolve(__dirname, "../../..", RUN), "utf8"));

describe("poissonBinomialTail", () => {
  it("matches the binomial when the rates are equal", () => {
    // P(X >= 2) for 3 fair coins = 4/8.
    expect(poissonBinomialTail([0.5, 0.5, 0.5], 2)).toBeCloseTo(0.5, 10);
    expect(poissonBinomialTail([0.2, 0.2], 0)).toBe(1);
    expect(poissonBinomialTail([0.2, 0.2], 3)).toBe(0);
  });
});

describe("the 1949 Dow swing record", () => {
  it("holds both tables in date order, from 1912 to 1949", () => {
    for (const set of ["nine", "three"] as const) {
      const r = DOW_SWINGS[set];
      expect(r.length).toBeGreaterThan(400);
      expect(r.every((x, i) => i === 0 || r[i - 1].date < x.date)).toBe(true);
      expect(r[0].date.startsWith("1912")).toBe(true);
      expect(r[r.length - 1].date.startsWith("1949")).toBe(true);
    }
  });

  it("carries the book's best-known turns at their printed prices", () => {
    const at = (set: "nine" | "three", date: string) => DOW_SWINGS[set].find((x) => x.date === date);
    expect(at("nine", "1929-09-03")).toEqual({ date: "1929-09-03", price: 386.1, kind: "high" });
    expect(at("three", "1932-07-08")).toEqual({ date: "1932-07-08", price: 40.56, kind: "low" });
    expect(at("nine", "1921-08-24")).toEqual({ date: "1921-08-24", price: 63.9, kind: "low" });
    // The printed misprint 189.34 is read as 289.34 (between 296.35 and 297.25).
    expect(at("three", "1930-04-15")?.price).toBe(289.34);
  });

  it("alternates tops and bottoms almost everywhere", () => {
    for (const set of ["nine", "three"] as const) {
      const r = DOW_SWINGS[set];
      const same = r.filter((x, i) => i > 0 && r[i - 1].kind === x.kind).length;
      expect(same).toBeLessThanOrEqual(6);
    }
  });
});

describe("scoring a call", () => {
  it("hits only on a turn of the expected kind inside the window", () => {
    const s = scoreCalls(
      [
        { label: "top", from: "1929-09-02", to: "1929-09-04", expect: "high" },
        { label: "wrong kind", from: "1929-09-02", to: "1929-09-04", expect: "low" },
      ],
      "nine",
    );
    expect(s.calls[0].hit).toBe(true);
    expect(s.calls[0].turn?.date).toBe("1929-09-03");
    expect(s.calls[1].hit).toBe(false);
    expect(s.calls[1].daysOff).toBeGreaterThan(0);
  });

  it("gives a wider window a higher base rate in the same year", () => {
    const narrow = windowBaseRate(DOW_SWINGS.nine, { label: "", from: "1925-03-01", to: "1925-03-02", expect: "high" });
    const wide = windowBaseRate(DOW_SWINGS.nine, { label: "", from: "1925-03-01", to: "1925-04-30", expect: "high" });
    expect(wide).toBeGreaterThan(narrow);
  });

  it("never scores a window inside the 1914 closure", () => {
    const ws = permanentDateWindows(1914, 1914, "three");
    expect(ws.some((w) => w.from >= "1914-07-31" && w.to <= "1914-12-11")).toBe(false);
  });
});

describe("the author's own scoring notes against his own table", () => {
  it("land within two days of the table's turn", () => {
    for (const c of checkSelfScoredClaims()) expect(Math.abs(c.nine!.days)).toBeLessThanOrEqual(2);
  });
});

describe("the committed run still says what the modules compute", () => {
  it("published forecasts, pooled and by year", () => {
    const pooled = { nine: pooledForecastScore("nine"), three: pooledForecastScore("three") };
    for (const set of ["nine", "three"] as const) {
      expect(run.publishedForecasts.pooled[set].hits).toBe(pooled[set].hits);
      expect(run.publishedForecasts.pooled[set].calls).toBe(PUBLISHED_FORECASTS.flatMap((f) => f.windows).length);
      expect(run.publishedForecasts.pooled[set].p).toBeCloseTo(pooled[set].p, 3);
    }
    expect(run.publishedForecasts.byYear.map((y: { id: string }) => y.id)).toEqual(scorePublishedForecasts().map((y) => y.id));
  });

  it("the macro cycle, in and out of sample", () => {
    const m = macroCycleRecord();
    expect(run.macroCycle.map((s: { hits: number }) => s.hits)).toEqual(m.map((s) => s.hits));
    expect(run.macroCycle.map((s: { windows: number }) => s.windows)).toEqual(m.map((s) => s.windows.length));
  });

  it("records the finding the docs report: the macro cycle does not beat chance out of sample", () => {
    const [, outOfSample, , strongOut] = macroCycleRecord();
    expect(outOfSample.p).toBeGreaterThan(0.05);
    expect(strongOut.p).toBeGreaterThan(0.05);
  });
});

describe("monthly turns and the projection", () => {
  it("finds the 1929 top and the 1932 low on the monthly record", () => {
    const turns = monthlyTurns();
    expect(turns.find((x) => x.month === "1929-09")?.kind).toBe("high");
    expect(turns.find((x) => x.month === "1932-06")?.kind).toBe("low");
  });

  it("projects Nov 2027, Sep 2029 and Aug 2106 among the four-length windows", () => {
    const months = projectMacroWindows(2026, 2110, 4).map((w) => w.month);
    expect(months).toContain("2027-11");
    expect(months).toContain("2029-09");
    expect(months).toContain("2106-08");
  });
});
