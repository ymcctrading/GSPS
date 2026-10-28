import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Bar } from "@/lib/types";
import { PARALLEL_ANGLES, patternAngleLevels } from "@/lib/gann/patternAngles";
import { gannMasterLevels } from "@/lib/gann/masterLevels";
import { pointForBars } from "@/lib/gann/pointScale";
import { readWinningRun } from "@/lib/risk/dynamic-risk";

const DAY = 86_400_000;
const zig = Array.from({ length: 80 }, (_, i) => 100 + 10 * Math.sin(i / 5) + i * 0.2);
const daily: Bar[] = zig.map((c, i) => ({ t: new Date(Date.UTC(2026, 0, 5) + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));

describe("review 24: wiring the mutation run found unasserted", () => {
  it("parallels exactly the 45°, 2x1 and 4x1 (GA-12 to GA-16), as literals", () => {
    expect([...PARALLEL_ANGLES].sort()).toEqual(["1x1", "2x1", "4x1"]);
  });

  it("puts the nearest pattern angles on the S/R list the live scan and replay read", () => {
    const price = daily[daily.length - 1].c;
    const want = patternAngleLevels(daily, price, pointForBars(daily));
    expect(want.length).toBeGreaterThan(0);
    const got = gannMasterLevels(daily, daily, price, new Date("2026-06-01T15:00:00Z")).filter((l) => l.source === "patternAngle");
    expect(got.map((l) => l.price)).toEqual(want.map((l) => l.price));
  });

  it("sizes the portfolio manager on the trading unit", () => {
    const pm = readFileSync("lib/automation/portfolio-manager.ts", "utf8");
    // Paper: the unit from STARTING_CASH; live: from the first verified equity (A-RISK-04, 2026-10-22).
    expect(pm).toMatch(/\? gannRiskCapital\(\{ equity: equityBasis, startingCapital: STARTING_CASH, \.\.\.run \}\)\.capital/);
    expect(pm).toMatch(/gannRiskCapital\(\{ equity: equityBasis, startingCapital: liveStart \?\? 0,/);
    // With no readable run there is no step-up on paper (review 25, RK-7).
    expect(pm).toMatch(/: Math\.min\(equityBasis, STARTING_CASH\)/);
  });

  it("measures the confluence card's angle slope in price-scaled points", () => {
    const card = readFileSync("lib/signals/confluence/gann.ts", "utf8");
    expect(card).toMatch(/normalizedSlope\(inputs\.currentPrice, majorLow, angleUnit\(inputs\.dailyBars\), timeDisplacementBars\)/);
  });

  it("counts only the unbroken run of wins ending at the latest close", async () => {
    const rows = [
      { outcome: "profit", profit_loss_dollars: 100 },
      { outcome: "profit", profit_loss_dollars: 50 },
      { outcome: "loss", profit_loss_dollars: -80 },
      { outcome: "profit", profit_loss_dollars: 999 },
    ];
    const q: Record<string, unknown> = {};
    for (const m of ["from", "select", "eq", "in", "not", "order"]) q[m] = () => q;
    q.limit = async () => ({ data: rows, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readWinningRun(q as any, "u1")).toEqual({ consecutiveWins: 2, streakProfitUsd: 150 });
  });
});
