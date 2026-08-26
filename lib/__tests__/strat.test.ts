import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { classifyBar, classifySeries } from "@/lib/strat/classify";
import {
  MIN_RISK_ATR_FRACTION,
  detectPatterns,
  gapRuleViolated,
  riskFloorViolated,
} from "@/lib/strat/patterns";
import {
  LARGE_CAP_MAX_STOP_ATR_MULTIPLE,
  MAX_STOP_ATR_MULTIPLE,
  computeTradeLevels,
} from "@/lib/strat/levels";

function bar(o: number, h: number, l: number, c: number): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v: 1000 };
}

describe("classifyBar", () => {
  const prev = bar(100, 110, 90, 105);

  it("inside bar = 1", () => {
    expect(classifyBar(prev, bar(102, 108, 95, 100))).toBe("1");
  });
  it("breaks high only = 2U", () => {
    expect(classifyBar(prev, bar(105, 115, 95, 112))).toBe("2U");
  });
  it("breaks low only = 2D", () => {
    expect(classifyBar(prev, bar(100, 108, 85, 88))).toBe("2D");
  });
  it("breaks both = 3 (outside)", () => {
    expect(classifyBar(prev, bar(100, 115, 85, 110))).toBe("3");
  });
});

describe("detectPatterns (forward-thinking)", () => {
  it("arms a bullish 2-1-2 after a closed 2U then closed inside bar", () => {
    const bars = [
      bar(100, 105, 95, 102),
      bar(102, 110, 100, 108), // 2U
      bar(107, 109, 104, 106), // 1 (inside)
    ];
    // pad so length >= 4
    const padded = [bar(99, 104, 94, 100), ...bars];
    const patterns = detectPatterns(padded);
    const p = patterns.find((x) => x.name === "2-1-2" && x.direction === "bullish");
    expect(p).toBeDefined();
    expect(p!.triggerPrice).toBeCloseTo(109.01, 2); // inside bar high + 1¢
    expect(p!.stopPrice).toBeCloseTo(103.99, 2); // inside bar low − 1¢
  });

  it("arms a bearish 2-2 reversal off a closed 2U bar", () => {
    const bars = [
      bar(99, 104, 94, 100),
      bar(100, 105, 95, 102),
      bar(101, 106, 97, 104),
      bar(104, 112, 100, 111), // 2U into resistance
    ];
    const p = detectPatterns(bars).find((x) => x.name === "2-2" && x.direction === "bearish");
    expect(p).toBeDefined();
    expect(p!.triggerPrice).toBeCloseTo(99.99, 2); // 2U low − 1¢
    expect(p!.stopPrice).toBeCloseTo(112.01, 2); // 2U high + 1¢
  });

  it("names a 1-2-2 reversal when an inside bar precedes the trigger bar", () => {
    const bars = [
      bar(98, 112, 88, 100),
      bar(100, 110, 90, 105), // 1 (inside)
      bar(102, 108, 95, 100), // 1 (inside)
      bar(99, 107, 88, 90), //   2D (broke low only)
    ];
    const p = detectPatterns(bars).find((x) => x.name === "1-2-2" && x.direction === "bullish");
    expect(p).toBeDefined();
    expect(p!.triggerPrice).toBeCloseTo(107.01, 2); // 2D high + 1¢
  });

  it("names a 3-2-2 reversal when an outside bar precedes the trigger bar", () => {
    const bars = [
      bar(101, 111, 91, 106),
      bar(100, 110, 90, 105), // 1 (inside)
      bar(99, 115, 85, 110), //  3 (outside)
      bar(110, 120, 108, 118), // 2U (broke high only)
    ];
    const p = detectPatterns(bars).find((x) => x.name === "3-2-2" && x.direction === "bearish");
    expect(p).toBeDefined();
    expect(p!.triggerPrice).toBeCloseTo(107.99, 2); // 2U low − 1¢
  });

  it("detects a Pivot Machine Gun after 5+ consecutive lower highs", () => {
    const bars = [
      bar(110, 120, 105, 108),
      bar(108, 118, 103, 106),
      bar(106, 116, 101, 104),
      bar(104, 114, 99, 102),
      bar(102, 112, 97, 100),
      bar(100, 110, 95, 98),
    ];
    const p = detectPatterns(bars).find((x) => x.name === "PMG" && x.direction === "bullish");
    expect(p).toBeDefined();
    expect(p!.triggerPrice).toBeCloseTo(110.01, 2);
  });
});

describe("gap rule", () => {
  it("voids a bullish setup when price gapped over the trigger", () => {
    const pattern = {
      name: "2-1-2" as const,
      direction: "bullish" as const,
      triggerPrice: 100,
      stopPrice: 95,
      description: "",
    };
    expect(gapRuleViolated(pattern, 103)).toBe(true);
    expect(gapRuleViolated(pattern, 99.5)).toBe(false);
  });
});

describe("risk floor", () => {
  // The shape that prompted this: a PMG armed on AAPL with a 35¢ stop on a
  // $308 stock — 0.11% of price, and a fraction of a 15-minute candle.
  const hairTrigger = {
    name: "PMG" as const,
    direction: "bearish" as const,
    triggerPrice: 308.81,
    stopPrice: 309.16,
    description: "",
  };

  it("rejects a stop far tighter than the average bar range", () => {
    expect(riskFloorViolated(hairTrigger, 1.5)).toBe(true);
  });

  it("accepts the same stop when the timeframe is genuinely that quiet", () => {
    // Derived from the constant rather than hardcoded: the floor moved from a
    // third to three quarters once it was measured against replayed results,
    // and a literal here just silently encodes whatever it used to be.
    const risk = Math.abs(hairTrigger.triggerPrice - hairTrigger.stopPrice);
    const quietEnough = risk / MIN_RISK_ATR_FRACTION;
    expect(riskFloorViolated(hairTrigger, quietEnough * 0.99)).toBe(false);
    expect(riskFloorViolated(hairTrigger, quietEnough * 1.01)).toBe(true);
  });

  it("rejects a stop too tight to clear its own costs, whatever the ATR", () => {
    // 10¢ on a $308 stock is 0.03% of price — under the cost floor even though
    // it sits well above a third of this (near-zero) ATR.
    const scalp = { ...hairTrigger, stopPrice: 308.91 };
    expect(riskFloorViolated(scalp, 0.01)).toBe(true);
  });

  it("falls back to the cost floor when ATR is unavailable", () => {
    // A flat or too-short series returns ATR 0, which must not wave setups
    // through on the noise test alone.
    expect(riskFloorViolated(hairTrigger, 0)).toBe(false);
    expect(riskFloorViolated({ ...hairTrigger, stopPrice: 308.91 }, 0)).toBe(true);
  });

  it("passes a setup whose stop sits right at the noise floor", () => {
    const atRange = 3;
    const pattern = {
      ...hairTrigger,
      triggerPrice: 100,
      stopPrice: 100 + atRange * MIN_RISK_ATR_FRACTION,
    };
    expect(riskFloorViolated(pattern, atRange)).toBe(false);
  });
});

describe("computeTradeLevels", () => {
  it("produces 2R TP1 and 3R master profit with structural stop", () => {
    const pattern = {
      name: "2-1-2" as const,
      direction: "bullish" as const,
      triggerPrice: 100,
      stopPrice: 85, // 15% risk — inside the 12–18% band
      description: "",
    };
    const levels = computeTradeLevels(pattern, { t: "", o: 98, h: 101, l: 96, c: 99, v: 0 }, []);
    expect(levels.entry).toBe(100);
    expect(levels.stopLoss).toBe(85);
    expect(levels.takeProfit1).toBe(130); // 2R
    expect(levels.masterProfit).toBe(145); // 3R
    expect(levels.stopBandWarning).toBeNull();
    // No Gann targets were supplied, so the master target is a plain 3R
    // projection with nothing structural behind it.
    expect(levels.masterFromStructure).toBe(false);
  });

  it("states the counter-scenario against the stop actually computed, not the pattern's raw stop", () => {
    const pattern = {
      name: "2-2" as const,
      direction: "bearish" as const,
      triggerPrice: 100,
      stopPrice: 115,
      description: "",
    };
    const levels = computeTradeLevels(pattern, { t: "", o: 98, h: 101, l: 96, c: 99, v: 0 }, []);
    expect(levels.pivotPlan).toContain("bearish 2-2");
    expect(levels.pivotPlan).toContain(levels.stopLoss.toFixed(2));
  });

  describe("masterFromStructure", () => {
    // This flag is the scored criterion, so both branches have to be reachable
    // and reported honestly. It replaced a test of `rewardToRiskTp1 >= 2`,
    // which max(2R, structural) can never fail, and a test of TP1's own
    // structural branch, which in practice never fires.
    const bullish = {
      name: "2-1-2" as const,
      direction: "bullish" as const,
      triggerPrice: 100,
      stopPrice: 90, // $10 of risk — 3R at 130, capped at 5R = 150
      description: "",
    };
    const prev = { t: "", o: 100, h: 105, l: 98, c: 102, v: 0 };

    it("is true when a Gann target sits in the master window", () => {
      const levels = computeTradeLevels(bullish, prev, [137]);
      expect(levels.masterFromStructure).toBe(true);
      expect(levels.masterProfit).toBe(137);
    });

    it("is false when no target is in range, and the master stays a 3R projection", () => {
      const levels = computeTradeLevels(bullish, prev, [1000, 12]);
      expect(levels.masterFromStructure).toBe(false);
      expect(levels.masterProfit).toBe(130); // plain 3R
    });

    it("is false when the only targets sit short of the 3R floor", () => {
      // A level between entry and 3R cannot confirm a target beyond it.
      const levels = computeTradeLevels(bullish, prev, [115, 125]);
      expect(levels.masterFromStructure).toBe(false);
      expect(levels.masterProfit).toBe(130);
    });

    it("snaps to the nearest qualifying target, not the furthest", () => {
      const levels = computeTradeLevels(bullish, prev, [145, 133, 138]);
      expect(levels.masterFromStructure).toBe(true);
      expect(levels.masterProfit).toBe(133);
    });

    it("reads targets below entry for a bearish setup", () => {
      const bearish = { ...bullish, direction: "bearish" as const, stopPrice: 110 };
      const snapped = computeTradeLevels(bearish, { t: "", o: 98, h: 101, l: 95, c: 97, v: 0 }, [63]);
      expect(snapped.masterFromStructure).toBe(true);
      expect(snapped.masterProfit).toBe(63);

      // The same price above entry is not a target for a short.
      const ignored = computeTradeLevels(bearish, { t: "", o: 98, h: 101, l: 95, c: 97, v: 0 }, [137]);
      expect(ignored.masterFromStructure).toBe(false);
      expect(ignored.masterProfit).toBe(70); // 3R below a 100 entry
    });
  });

  describe("stop advisory", () => {
    const pattern = {
      name: "2-2" as const,
      direction: "bullish" as const,
      triggerPrice: 100,
      stopPrice: 99, // $1 of risk
      description: "",
    };
    const prev = { t: "", o: 98, h: 101, l: 96, c: 99, v: 0 };

    it("reports the premium band on both sides when a premium is known", () => {
      // $1 of risk against $10 of premium is 10% — inside the band's floor.
      expect(computeTradeLevels(pattern, prev, [], 10).stopBandWarning).toContain("tighter");
      // …and against $4 it is 25%, above the ceiling.
      expect(computeTradeLevels(pattern, prev, [], 4).stopBandWarning).toContain("wider");
      // $6.50 puts it at ~15%, mid-band.
      expect(computeTradeLevels(pattern, prev, [], 6.5).stopBandWarning).toBeNull();
    });

    it("says nothing about the premium band when no premium is supplied", () => {
      // The old behaviour measured the stop against share price, which lands
      // near 1% on every equity setup and so warned "tighter" every time —
      // while advising the reader to increase position size.
      expect(computeTradeLevels(pattern, prev, []).stopBandWarning).toBeNull();
    });

    it("flags a stop far wider than the instrument's average candle", () => {
      // $1 of risk against a $0.20 average candle is 5x — well past the ceiling.
      const levels = computeTradeLevels(pattern, prev, [], undefined, 0.2);
      expect(levels.stopBandWarning).toContain("average candle");
      expect(levels.stopBandWarning).not.toContain("%");
    });

    it("stays quiet at a normal stop width", () => {
      // 1x the average candle — the measured median is 0.8x.
      expect(computeTradeLevels(pattern, prev, [], undefined, 1).stopBandWarning).toBeNull();
    });

    it("prefers the premium band over the volatility one when both are known", () => {
      const levels = computeTradeLevels(pattern, prev, [], 4, 0.2);
      expect(levels.stopBandWarning).toContain("premium");
    });
  });

  describe("large-cap widening", () => {
    // $2 of risk on a $1 average execution candle — 2x, wide enough to bite
    // the default 2.5x ceiling's leeway trim but not the widened one, so the
    // two behave differently rather than coincidentally the same.
    const pattern = {
      name: "2-1-2" as const,
      direction: "bullish" as const,
      triggerPrice: 100,
      stopPrice: 96.5, // $3.50 structural risk — beyond the default 2.5x*$1 ceiling
      description: "",
    };
    const prev = { t: "", o: 98, h: 101, l: 96, c: 99, v: 0 };

    it("widens the stop's noise leeway for a large-cap stock", () => {
      const ordinary = computeTradeLevels(pattern, prev, [], undefined, 1, "us_equity", false);
      const largeCap = computeTradeLevels(pattern, prev, [], undefined, 1, "us_equity", true);
      // Both are clipped to their respective ceilings (2.5x vs 3.5x an
      // execution candle of 1), so the large-cap stop sits further from entry.
      expect(ordinary.stopLoss).toBe(100 - MAX_STOP_ATR_MULTIPLE);
      expect(largeCap.stopLoss).toBe(100 - LARGE_CAP_MAX_STOP_ATR_MULTIPLE);
      expect(largeCap.riskPerShare).toBeGreaterThan(ordinary.riskPerShare);
    });

    it("raises the stop-band warning threshold for a large-cap stock", () => {
      // 3x an average candle clears the default 2.5x ceiling but not the
      // large-cap 3.5x one.
      const ordinary = computeTradeLevels(pattern, prev, [], undefined, 1, "us_equity", false);
      const largeCap = computeTradeLevels(pattern, prev, [], undefined, 1, "us_equity", true);
      expect(ordinary.stopBandWarning).toContain("average candle");
      expect(largeCap.stopBandWarning).toBeNull();
    });

    it("ignores the large-cap flag for crypto", () => {
      const flaggedCrypto = computeTradeLevels(pattern, prev, [], undefined, 1, "crypto", true);
      const ordinaryCrypto = computeTradeLevels(pattern, prev, [], undefined, 1, "crypto", false);
      expect(flaggedCrypto.stopLoss).toBe(ordinaryCrypto.stopLoss);
    });

    it("a wider large-cap risk-per-share means fewer shares for the same risk budget", () => {
      // The point of the change: at a fixed dollar risk budget, more risk per
      // share means fewer shares — directly addressing the oversized guided
      // recommendations this session started with.
      const ordinary = computeTradeLevels(pattern, prev, [], undefined, 1, "us_equity", false);
      const largeCap = computeTradeLevels(pattern, prev, [], undefined, 1, "us_equity", true);
      const riskBudget = 1_000;
      expect(riskBudget / largeCap.riskPerShare).toBeLessThan(riskBudget / ordinary.riskPerShare);
    });
  });

  it("steps master profit past a structural TP1 that has run beyond 3R", () => {
    // entry 100, stop 95 (risk 5): 2R=110, 3R=115, 5R=125. A previous-bar high
    // of 130 puts the structural TP1 past even 5R. That is a wide bar, not a
    // corrupt signal, so master profit steps out a further 1R beyond TP1
    // rather than the whole scan being rejected.
    const pattern = {
      name: "2-1-2" as const,
      direction: "bullish" as const,
      triggerPrice: 100,
      stopPrice: 95,
      description: "",
    };
    const levels = computeTradeLevels(pattern, { t: "", o: 120, h: 130, l: 115, c: 128, v: 0 }, []);
    expect(levels.takeProfit1).toBe(130);
    expect(levels.masterProfit).toBe(135);
    expect(levels.rewardToRiskMaster).toBeCloseTo(7, 5);
  });

  it("steps master profit past a structural TP1 on a bearish setup", () => {
    // entry 100, stop 105 (risk 5): 2R=90, 3R=85, 5R=75. A previous-bar low of
    // 70 puts the structural TP1 past 5R — same shape, opposite direction.
    const pattern = {
      name: "2-1-2" as const,
      direction: "bearish" as const,
      triggerPrice: 100,
      stopPrice: 105,
      description: "",
    };
    const levels = computeTradeLevels(pattern, { t: "", o: 80, h: 85, l: 70, c: 72, v: 0 }, []);
    expect(levels.takeProfit1).toBe(70);
    expect(levels.masterProfit).toBe(65);
    expect(levels.rewardToRiskMaster).toBeCloseTo(7, 5);
  });

  it("prefers a structural extension sitting between TP1 and the stepped-out master", () => {
    // Same bullish setup: TP1 lands on 130, so the master target searches
    // (130, 135] and should snap to the structural level at 133 instead of the
    // bare 1R step.
    const pattern = {
      name: "2-1-2" as const,
      direction: "bullish" as const,
      triggerPrice: 100,
      stopPrice: 95,
      description: "",
    };
    const levels = computeTradeLevels(
      pattern,
      { t: "", o: 120, h: 130, l: 115, c: 128, v: 0 },
      [128, 133, 140],
    );
    expect(levels.masterProfit).toBe(133);
  });

  it("rejects a pattern whose entry and stop are the same price", () => {
    const pattern = {
      name: "2-2" as const,
      direction: "bullish" as const,
      triggerPrice: 100,
      stopPrice: 100,
      description: "",
    };
    expect(() =>
      computeTradeLevels(pattern, { t: "", o: 98, h: 101, l: 96, c: 99, v: 0 }, []),
    ).toThrow(/no risk to size against/);
  });
});

describe("classifySeries", () => {
  it("classifies each bar against its predecessor", () => {
    const bars = [
      bar(100, 110, 90, 105),
      bar(102, 108, 95, 100), // 1
      bar(100, 112, 96, 111), // 2U
      bar(111, 113, 89, 92), // 3
    ];
    expect(classifySeries(bars)).toEqual(["1", "2U", "3"]);
  });
});
