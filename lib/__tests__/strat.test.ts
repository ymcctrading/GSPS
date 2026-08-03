import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { classifyBar, classifySeries } from "@/lib/strat/classify";
import {
  MIN_RISK_ATR_FRACTION,
  detectPatterns,
  gapRuleViolated,
  riskFloorViolated,
} from "@/lib/strat/patterns";
import { computeTradeLevels } from "@/lib/strat/levels";

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
    // ATR 0.9: the floor is 0.30, and the 0.35 stop clears it.
    expect(riskFloorViolated(hairTrigger, 0.9)).toBe(false);
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
  });

  it("warns when structural stop is outside the 12–18% band", () => {
    const pattern = {
      name: "2-2" as const,
      direction: "bullish" as const,
      triggerPrice: 100,
      stopPrice: 99, // 1% risk — far tighter than band
      description: "",
    };
    const levels = computeTradeLevels(pattern, { t: "", o: 98, h: 101, l: 96, c: 99, v: 0 }, []);
    expect(levels.stopBandWarning).toContain("tighter");
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
