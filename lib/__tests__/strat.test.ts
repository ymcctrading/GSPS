import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { classifyBar, classifySeries } from "@/lib/strat/classify";
import { detectPatterns, gapRuleViolated } from "@/lib/strat/patterns";
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
