import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { evaluateMaCrossover } from "@/lib/strategies/maCrossover";
import { compileCustomScript } from "@/lib/strategies/custom/compile";
import { parseScript, ParseError } from "@/lib/strategies/custom/parser";
import { MAX_AST_NODES, MAX_SOURCE_LENGTH } from "@/lib/strategies/custom/limits";

function bar(o: number, h: number, l: number, c: number, v = 1000): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v } as Bar;
}

function flat(price: number, n: number): Bar[] {
  return Array.from({ length: n }, () => bar(price, price + 0.5, price - 0.5, price));
}

const IDENTITY = { scriptId: "script-1", scriptName: "Test EMA/SMA clone", author: "tester", version: 1 };

const MA_CROSSOVER_SOURCE = `
  rule bullish when crossesAbove(ema(9), sma(20)) {
    entry = high[0] * 1.0005
    stop = lowest(low, 10)
    tp1r = 2
    mtpr = 4
  }
  rule bearish when crossesBelow(ema(9), sma(20)) {
    entry = low[0] * 0.9995
    stop = highest(high, 10)
    tp1r = 2
    mtpr = 4
  }
`;

function trendReversalBars(): Bar[] {
  const bars: Bar[] = [];
  let p = 150;
  for (let i = 0; i < 25; i++) {
    p -= 1.2;
    bars.push(bar(p + 0.5, p + 1, p - 1, p));
  }
  for (let i = 0; i < 5; i++) {
    p += 4;
    bars.push(bar(p - 0.5, p + 1.5, p - 1.5, p));
  }
  return bars;
}

describe("compileCustomScript — parity with a built-in mode", () => {
  it("produces the same entry/stop/targets as evaluateMaCrossover for an equivalent rule", () => {
    const bars = trendReversalBars();
    const builtIn = evaluateMaCrossover(bars);
    const compiled = compileCustomScript(MA_CROSSOVER_SOURCE, IDENTITY);

    expect(compiled.ok).toBe(true);
    expect(compiled.errors).toEqual([]);
    const result = compiled.evaluator!(bars);

    expect(builtIn).not.toBeNull();
    expect(result).not.toBeNull();
    expect(result!.direction).toBe(builtIn!.direction);
    expect(result!.entry).toBeCloseTo(builtIn!.entry, 8);
    expect(result!.stopLoss).toBeCloseTo(builtIn!.stopLoss, 8);
    expect(result!.takeProfit1).toBeCloseTo(builtIn!.takeProfit1, 8);
    expect(result!.masterTarget).toBeCloseTo(builtIn!.masterTarget, 8);
    expect(result!.riskPerShare).toBeCloseTo(builtIn!.riskPerShare, 8);
  });

  it("always carries the script's own identity, never a generic label", () => {
    const compiled = compileCustomScript(MA_CROSSOVER_SOURCE, IDENTITY);
    const result = compiled.evaluator!(trendReversalBars());
    expect(result!.scriptId).toBe(IDENTITY.scriptId);
    expect(result!.scriptName).toBe(IDENTITY.scriptName);
    expect(result!.author).toBe(IDENTITY.author);
    expect(result!.rationale).toContain(IDENTITY.scriptName);
    expect(result!.rationale).toContain(IDENTITY.author);
  });

  it("returns null (not an error) when nothing armed on the latest bar", () => {
    const compiled = compileCustomScript(MA_CROSSOVER_SOURCE, IDENTITY);
    expect(compiled.evaluator!(flat(100, 30))).toBeNull();
  });

  it("is deterministic across repeated calls on the same bars", () => {
    const compiled = compileCustomScript(MA_CROSSOVER_SOURCE, IDENTITY);
    const bars = trendReversalBars();
    const a = compiled.evaluator!(bars);
    const b = compiled.evaluator!(bars);
    expect(a).toEqual(b);
  });

  it("returns null on too little history instead of throwing", () => {
    const compiled = compileCustomScript(MA_CROSSOVER_SOURCE, IDENTITY);
    expect(compiled.evaluator!(flat(100, 1))).toBeNull();
    expect(compiled.evaluator!([])).toBeNull();
  });
});

describe("compileCustomScript — invalid setups rejected, not silently accepted", () => {
  it("rejects a stop on the wrong side of entry", () => {
    const source = `
      rule bullish when close[0] > 0 {
        entry = close[0]
        stop = close[0] * 2
      }
    `;
    const compiled = compileCustomScript(source, IDENTITY);
    expect(compiled.ok).toBe(true);
    expect(compiled.evaluator!(flat(100, 5))).toBeNull();
  });
});

describe("parser — grammar and whitelist enforcement", () => {
  it("rejects an unknown identifier", () => {
    expect(() => parseScript(`rule bullish when close[0] > 0 { entry = wma(20) stop = low[0] }`)).toThrow(ParseError);
  });

  it("rejects an unknown field on a multi-output indicator", () => {
    expect(() =>
      parseScript(`rule bullish when close[0] > 0 { entry = macd(12,26,9).notarealfield stop = low[0] }`),
    ).toThrow(ParseError);
  });

  it("requires a field on a multi-output indicator", () => {
    expect(() =>
      parseScript(`rule bullish when close[0] > 0 { entry = macd(12,26,9) stop = low[0] }`),
    ).toThrow(ParseError);
  });

  it("rejects a field on a single-output indicator", () => {
    expect(() =>
      parseScript(`rule bullish when close[0] > 0 { entry = sma(20).value stop = low[0] }`),
    ).toThrow(ParseError);
  });

  it("rejects lowest() applied to the wrong series", () => {
    expect(() =>
      parseScript(`rule bullish when close[0] > 0 { entry = lowest(high, 10) stop = low[0] }`),
    ).toThrow(ParseError);
  });

  it("rejects an out-of-range indicator period", () => {
    expect(() =>
      parseScript(`rule bullish when close[0] > 0 { entry = sma(5000) stop = low[0] }`),
    ).toThrow(ParseError);
  });

  it("rejects an out-of-range lookback offset", () => {
    expect(() =>
      parseScript(`rule bullish when close[0] > 0 { entry = close[9999] stop = low[0] }`),
    ).toThrow(ParseError);
  });

  it("rejects a second bullish block", () => {
    const source = `
      rule bullish when close[0] > 0 { entry = close[0] stop = low[0] }
      rule bullish when close[0] > 1 { entry = close[0] stop = low[0] }
    `;
    expect(() => parseScript(source)).toThrow(ParseError);
  });

  it("rejects an empty script", () => {
    expect(() => parseScript("")).toThrow(ParseError);
  });

  it("rejects a script with no entry statement", () => {
    expect(() => parseScript(`rule bullish when close[0] > 0 { stop = low[0] }`)).toThrow(ParseError);
  });

  it("rejects mtpr <= tp1r", () => {
    expect(() =>
      parseScript(`rule bullish when close[0] > 0 { entry = close[0] stop = low[0] tp1r = 3 mtpr = 2 }`),
    ).toThrow(ParseError);
  });

  it("rejects source longer than the maximum length", () => {
    const huge = "rule bullish when close[0] > 0 { entry = close[0] + " + "0 + ".repeat(MAX_SOURCE_LENGTH) + "0 stop = low[0] }";
    expect(() => parseScript(huge)).toThrow(ParseError);
  });

  it("rejects an AST with more nodes than the maximum", () => {
    const chain = Array.from({ length: MAX_AST_NODES + 10 }, () => "close[0]").join(" + ");
    const source = `rule bullish when close[0] > 0 { entry = ${chain} stop = low[0] }`;
    expect(() => parseScript(source)).toThrow(ParseError);
  });

  it("rejects deeply nested parentheses beyond the max expression depth", () => {
    const nested = "(".repeat(60) + "close[0]" + ")".repeat(60);
    const source = `rule bullish when close[0] > 0 { entry = ${nested} stop = low[0] }`;
    expect(() => parseScript(source)).toThrow(ParseError);
  });

  it("accepts boolean combinators and comparisons", () => {
    const ast = parseScript(
      `rule bullish when rsi(14) < 30 and not (close[0] > sma(20)) { entry = close[0] stop = low[0] }`,
    );
    expect(ast.bullish).not.toBeNull();
    expect(ast.bearish).toBeNull();
  });

  it("supports # line comments", () => {
    const ast = parseScript(`
      # a comment
      rule bullish when close[0] > 0 { # another
        entry = close[0]
        stop = low[0]
      }
    `);
    expect(ast.bullish).not.toBeNull();
  });
});
