import { describe, expect, it } from "vitest";
import { syntheticProvider } from "@/lib/data/synthetic";
import type { Bar } from "@/lib/types";
import {
  NON_GANN_STRATEGY_EVALUATORS,
  type NonGannStrategyModeId,
} from "@/lib/strategies/registry";
import { PLAN_EXPLAINERS } from "@/lib/strategies/explain";
import type { PlanInput } from "@/lib/strategies/explain";

async function fixture(
  symbol: string,
  timeframe: "1Day" | "15Min" = "1Day",
): Promise<Bar[]> {
  const end = new Date("2026-09-30T00:00:00Z");
  const days = timeframe === "1Day" ? 420 : 12;
  const start = new Date(end.getTime() - days * 864e5);
  return syntheticProvider.fetchBars(
    symbol,
    timeframe,
    start,
    end,
    "us_equity",
  );
}

function planAt(bars: Bar[], direction: "bullish" | "bearish"): PlanInput {
  const c = bars[bars.length - 1].c;
  const d = direction === "bullish" ? 1 : -1;
  return {
    direction,
    entry: c * (1 + d * 0.01),
    stopLoss: c * (1 - d * 0.04),
    takeProfit1: c * (1 + d * 0.0712345),
    masterTarget: c * (1 + d * 0.13),
  };
}

const MODES = Object.keys(PLAN_EXPLAINERS) as NonGannStrategyModeId[];

describe("plan explainers", () => {
  it("has an explainer for every built-in mode", () => {
    expect(new Set(MODES)).toEqual(
      new Set(Object.keys(NON_GANN_STRATEGY_EVALUATORS)),
    );
  });

  it("reads only the plan's own levels, rounded to cents, with one row per level", async () => {
    const bars = await fixture("SPY");
    const plan = planAt(bars, "bullish");
    for (const mode of MODES) {
      const r = PLAN_EXPLAINERS[mode](bars, plan);
      expect(r, mode).not.toBeNull();
      if (!r || r.levels.length === 0) continue; // a bar pattern may not be armed
      expect(r.levels.map((l) => l.level)).toEqual([
        "entry",
        "stopLoss",
        "takeProfit1",
        "masterTarget",
      ]);
      for (const l of r.levels) {
        expect(l.price).toBe(Math.round(plan[l.level]! * 100) / 100);
        expect(l.text.length).toBeGreaterThan(10);
      }
      expect(r.levels[2].text).toContain(
        `$${(Math.round(plan.takeProfit1! * 100) / 100).toFixed(2)}`,
      );
    }
  });

  it("skips a target the plan doesn't fix", async () => {
    const bars = await fixture("SPY");
    const plan = {
      ...planAt(bars, "bullish"),
      takeProfit1: null,
      masterTarget: null,
    };
    const r = PLAN_EXPLAINERS.maCrossover(bars, plan)!;
    expect(r.levels.map((l) => l.level)).toEqual(["entry", "stopLoss"]);
  });

  it("returns nothing it could place: no level fields beyond the plan's prices", async () => {
    const bars = await fixture("AAPL");
    const r = PLAN_EXPLAINERS.rsiReversal(bars, planAt(bars, "bearish"))!;
    expect(Object.keys(r).sort()).toEqual([
      "agrees",
      "label",
      "levels",
      "source",
      "summary",
    ]);
  });

  it("flips agreement when the plan's direction flips", async () => {
    const bars = await fixture("MSFT");
    for (const mode of MODES) {
      const up = PLAN_EXPLAINERS[mode](bars, planAt(bars, "bullish"));
      const down = PLAN_EXPLAINERS[mode](bars, planAt(bars, "bearish"));
      if (up?.agrees == null) continue;
      expect(down?.agrees, mode).toBe(!up.agrees);
    }
  });

  it("an oscillator reads higher at a higher hypothetical close", async () => {
    const bars = await fixture("SPY");
    const r = PLAN_EXPLAINERS.rsiReversal(bars, planAt(bars, "bullish"))!;
    const value = (text: string) => Number(/near (\d+)/.exec(text)![1]);
    const byPrice = [...r.levels]
      .sort((a, b) => a.price - b.price)
      .map((l) => value(l.text));
    expect([...byPrice].sort((a, b) => a - b)).toEqual(byPrice);
  });

  // Where a mode arms, its lean must match the direction it armed. RSI and
  // Bollinger are left out by design: they arm reversals from an extreme, so
  // their lean (above or below the middle) points the other way at that bar.
  const LEAN_MATCHES_ARMING: NonGannStrategyModeId[] = [
    "psarSupertrend",
    "saraStrat",
    "maCrossover",
    "macdMomentum",
    "vwap",
    "stochastic",
    "donchian",
  ];

  it.each(LEAN_MATCHES_ARMING)(
    "%s agrees with its own armed direction",
    async (mode) => {
      let checked = 0;
      for (const symbol of ["AAPL", "SPY", "MSFT", "NVDA", "TSLA", "AMZN"]) {
        // VWAP is session-anchored, so it only arms on intraday bars.
        const bars = await fixture(symbol, mode === "vwap" ? "15Min" : "1Day");
        for (let i = 40; i < bars.length; i++) {
          const window = bars.slice(0, i + 1);
          const armed = NON_GANN_STRATEGY_EVALUATORS[mode](window);
          if (!armed) continue;
          const r = PLAN_EXPLAINERS[mode](
            window,
            planAt(window, armed.direction),
          );
          expect(r?.agrees, `${mode} at bar ${i}`).not.toBe(false);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    },
  );

  it("never names the method in user-facing text", async () => {
    const bars = await fixture("SPY");
    for (const mode of MODES) {
      const r = PLAN_EXPLAINERS[mode](bars, planAt(bars, "bullish"));
      const text = [r?.summary, ...(r?.levels.map((l) => l.text) ?? [])].join(
        " ",
      );
      expect(text).not.toMatch(/gann|strat\b|sara/i);
    }
  });
});
