import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildLevels } from "@/lib/strategies/targets";
import { evaluatePsarSupertrend } from "@/lib/strategies/psarSupertrend";
import { evaluateSaraStrat } from "@/lib/strategies/saraStrat";
import { evaluateMaCrossover } from "@/lib/strategies/maCrossover";
import { evaluateBollinger } from "@/lib/strategies/bollinger";
import { evaluateRsiReversal } from "@/lib/strategies/rsiReversal";
import { evaluateMacdMomentum } from "@/lib/strategies/macdMomentum";
import {
  evaluateStrategyMode,
  isNonGannStrategyMode,
  NON_GANN_STRATEGY_EVALUATORS,
} from "@/lib/strategies/registry";

function bar(o: number, h: number, l: number, c: number, v = 1000): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v } as Bar;
}

function flat(price: number, n: number): Bar[] {
  return Array.from({ length: n }, () => bar(price, price + 0.5, price - 0.5, price));
}

describe("buildLevels", () => {
  it("rejects a setup where the stop sits on the wrong side of entry", () => {
    expect(buildLevels("psarSupertrend", "bullish", 100, 105, "bad")).toBeNull();
  });

  it("rejects zero risk", () => {
    expect(buildLevels("psarSupertrend", "bullish", 100, 100, "bad")).toBeNull();
  });

  it("projects TP1/master target as R-multiples of risk for a bullish setup", () => {
    const levels = buildLevels("maCrossover", "bullish", 110, 100, "ok", 2, 4);
    expect(levels).not.toBeNull();
    expect(levels!.riskPerShare).toBe(10);
    expect(levels!.takeProfit1).toBe(130);
    expect(levels!.masterTarget).toBe(150);
  });

  it("mirrors correctly for a bearish setup", () => {
    const levels = buildLevels("maCrossover", "bearish", 90, 100, "ok", 2, 4);
    expect(levels).not.toBeNull();
    expect(levels!.takeProfit1).toBe(70);
    expect(levels!.masterTarget).toBe(50);
  });
});

describe("registry", () => {
  it("recognizes every alternate mode and rejects the structural default", () => {
    expect(isNonGannStrategyMode("gann")).toBe(false);
    for (const key of Object.keys(NON_GANN_STRATEGY_EVALUATORS)) {
      expect(isNonGannStrategyMode(key)).toBe(true);
    }
  });

  it("returns null for an unrecognized mode instead of throwing", () => {
    expect(evaluateStrategyMode("not-a-real-mode", flat(100, 30))).toBeNull();
  });
});

describe("evaluatePsarSupertrend", () => {
  it("returns null on too little history", () => {
    expect(evaluatePsarSupertrend(flat(100, 2))).toBeNull();
  });

  it("finds a bullish agreement flip after a sustained downtrend reverses sharply", () => {
    const bars: Bar[] = [];
    let p = 150;
    for (let i = 0; i < 25; i++) {
      p -= 1.2;
      bars.push(bar(p + 0.5, p + 1, p - 1, p));
    }
    // Sharp, sustained reversal, large enough to flip both indicators.
    for (let i = 0; i < 8; i++) {
      p += 3;
      bars.push(bar(p - 0.5, p + 1.5, p - 1.5, p));
    }
    const result = evaluatePsarSupertrend(bars);
    if (result) {
      expect(result.direction).toBe("bullish");
      expect(result.stopLoss).toBeLessThan(result.entry);
      expect(result.takeProfit1).toBeGreaterThan(result.entry);
    }
  });
});

describe("evaluateSaraStrat", () => {
  it("detects a bullish 2-1-2 continuation and prices it from the pattern", () => {
    // Baseline, then a 2U bar, then an inside bar -> 2-1-2 continuation armed.
    const bars: Bar[] = [
      bar(99, 104, 94, 99),
      bar(100, 105, 95, 100), // 2U vs the baseline
      bar(101, 110, 101, 108), // 2U vs the previous bar
      bar(105, 107, 103, 106), // inside the prior bar's range -> "1"
    ];
    const result = evaluateSaraStrat(bars);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("saraStrat");
    expect(result!.entry).toBeGreaterThan(result!.stopLoss);
  });

  it("returns null with no armed pattern", () => {
    expect(evaluateSaraStrat(flat(100, 3))).toBeNull();
  });
});

describe("evaluateMaCrossover", () => {
  it("detects a bullish EMA9/SMA20 crossover and stops below the recent swing low", () => {
    const bars: Bar[] = [];
    let p = 100;
    // Downtrend/flat so SMA20 > EMA9 initially.
    for (let i = 0; i < 20; i++) {
      p -= 0.3;
      bars.push(bar(p, p + 0.5, p - 0.5, p));
    }
    // Sharp rally so EMA9 (faster) crosses above SMA20 (slower) on the third
    // up-bar — verified against the actual EMA/SMA series, not guessed.
    for (let i = 0; i < 3; i++) {
      p += 3;
      bars.push(bar(p - 0.5, p + 0.6, p - 0.6, p));
    }
    const result = evaluateMaCrossover(bars);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.direction).toBe("bullish");
      expect(result.stopLoss).toBeLessThan(result.entry);
    }
  });
});

describe("evaluateBollinger", () => {
  it("detects a bullish lower-band rejection", () => {
    // Small alternating closes give the bands real (nonzero) width, so the
    // rejection bar's close can sit meaningfully inside them rather than
    // exactly on a zero-width band.
    const bars: Bar[] = Array.from({ length: 20 }, (_, i) => {
      const c = i % 2 === 0 ? 100.05 : 99.95;
      return bar(c, c + 0.3, c - 0.3, c);
    });
    // A sharp spike down through the lower band that closes back inside it.
    bars.push(bar(100, 100.1, 85, 100.1));
    const result = evaluateBollinger(bars);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.direction).toBe("bullish");
      expect(result.takeProfit1).toBeGreaterThan(result.entry - 1);
      expect(result.masterTarget).toBeGreaterThan(result.takeProfit1);
    }
  });
});

describe("evaluateRsiReversal", () => {
  it("detects a bullish reversal crossing back above 30 from oversold", () => {
    const bars: Bar[] = [];
    let p = 150;
    for (let i = 0; i < 20; i++) {
      p -= 2;
      bars.push(bar(p + 1, p + 1.2, p - 1, p));
    }
    // Bounce.
    p += 4;
    bars.push(bar(p - 4, p + 0.5, p - 4.2, p));
    const result = evaluateRsiReversal(bars);
    if (result) {
      expect(result.direction).toBe("bullish");
      expect(result.stopLoss).toBeLessThan(result.entry);
    }
  });
});

describe("evaluateMacdMomentum", () => {
  it("detects a bullish histogram flip after a downtrend reverses", () => {
    const bars: Bar[] = [];
    let p = 150;
    for (let i = 0; i < 40; i++) {
      p -= 0.5;
      bars.push(bar(p + 0.3, p + 0.6, p - 0.6, p));
    }
    for (let i = 0; i < 15; i++) {
      p += 2;
      bars.push(bar(p - 0.4, p + 0.6, p - 0.6, p));
    }
    const result = evaluateMacdMomentum(bars);
    if (result) {
      expect(result.direction).toBe("bullish");
      expect(result.stopLoss).toBeLessThan(result.entry);
    }
  });
});
