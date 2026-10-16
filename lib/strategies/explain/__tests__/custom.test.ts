import { describe, expect, it } from "vitest";
import { syntheticProvider } from "@/lib/data/synthetic";
import { compileCustomScript } from "@/lib/strategies/custom/compile";
import {
  explainCustomScript,
  parsePlanParams,
  planQuery,
} from "@/lib/strategies/explain";
import type { PlanInput } from "@/lib/strategies/explain";

const SRC = `rule bullish when crossesAbove(ema(9), sma(20)) {
  entry = high[0] * 1.0005
  stop = lowest(low, 10)
}

rule bearish when crossesBelow(ema(9), sma(20)) and rsi(14) < 50 {
  entry = low[0] * 0.9995
  stop = highest(high, 10)
}`;

async function bars() {
  const end = new Date("2026-09-30T00:00:00Z");
  return syntheticProvider.fetchBars(
    "SPY",
    "1Day",
    new Date(end.getTime() - 420 * 864e5),
    end,
    "us_equity",
  );
}

const id = {
  scriptId: "s1",
  scriptName: "Cross test",
  author: "tester",
  version: 1,
};

describe("explainCustomScript", () => {
  it("reads the nearest lines and the oscillators at each plan level", async () => {
    const b = await bars();
    const c = compileCustomScript(SRC, id);
    expect(c.ok).toBe(true);
    const close = b[b.length - 1].c;
    const plan: PlanInput = {
      direction: "bullish",
      entry: close * 1.01,
      stopLoss: close * 0.96,
      takeProfit1: close * 1.07,
      masterTarget: close * 1.13,
    };
    const r = explainCustomScript(
      { id: "s1", name: "Cross test" },
      c.ast!,
      c.evaluator!,
      b,
      plan,
    )!;
    expect(r.source).toBe("custom:s1");
    expect(r.levels).toHaveLength(4);
    for (const l of r.levels) {
      // At most the nearest line below, the nearest above, and rsi(14).
      expect(l.text.split("; ").length).toBeLessThanOrEqual(3);
      expect(l.text).toMatch(/rsi\(14\) would read \d/);
    }
    // The stop sits below every line, so only the nearest one above is named.
    const stop = r.levels.find((l) => l.level === "stopLoss")!;
    expect(stop.text.split("; ")).toHaveLength(2);
  });

  it("leans the way the rule that fires points, and nowhere when none fires", async () => {
    const all = await bars();
    const c = compileCustomScript(SRC, id);
    let fired = 0;
    for (let i = 40; i < all.length; i++) {
      const w = all.slice(0, i + 1);
      const close = w[w.length - 1].c;
      const plan: PlanInput = {
        direction: "bullish",
        entry: close * 1.01,
        stopLoss: close * 0.96,
        takeProfit1: close * 1.07,
        masterTarget: close * 1.13,
      };
      const r = explainCustomScript(
        { id: "s1", name: "Cross test" },
        c.ast!,
        c.evaluator!,
        w,
        plan,
      )!;
      const armed = c.evaluator!(w);
      if (armed) fired++;
      expect(r.agrees).toBe(armed ? armed.direction === "bullish" : null);
    }
    expect(fired).toBeGreaterThan(0);
  });
});

describe("parsePlanParams", () => {
  const plan: PlanInput = {
    direction: "bearish",
    entry: 100,
    stopLoss: 104,
    takeProfit1: 94,
    masterTarget: 88,
  };

  it("round-trips planQuery", () => {
    expect(parsePlanParams(new URLSearchParams(planQuery(plan)))).toEqual(plan);
  });

  it("accepts a plan with no targets, as an intraday alert can be", () => {
    const bare = { ...plan, takeProfit1: null, masterTarget: null };
    expect(parsePlanParams(new URLSearchParams(planQuery(bare)))).toEqual(bare);
  });

  it("rejects a plan whose levels sit on the wrong sides or are missing", () => {
    expect(
      parsePlanParams(
        new URLSearchParams(planQuery({ ...plan, stopLoss: 96 })),
      ),
    ).toBeNull();
    expect(
      parsePlanParams(
        new URLSearchParams(planQuery({ ...plan, takeProfit1: 105 })),
      ),
    ).toBeNull();
    expect(
      parsePlanParams(new URLSearchParams("direction=bearish&entry=100")),
    ).toBeNull();
    expect(
      parsePlanParams(
        new URLSearchParams("direction=sideways&entry=1&stop=2&tp1=3&mtp=4"),
      ),
    ).toBeNull();
  });
});
