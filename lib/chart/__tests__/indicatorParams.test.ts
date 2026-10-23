import { describe, expect, it } from "vitest";
import {
  ChartPresetSchema,
  DEFAULT_INDICATOR_PARAMS,
  MAX_PRESETS,
  PARAM_FIELDS,
  effectiveParams,
  indicatorLabel,
  resolveChartIndicatorPrefs,
  resolveIndicatorParams,
  type ParamIndicator,
} from "../indicatorParams";

describe("indicator periods", () => {
  it("are the Strategy Modes' own published periods by default", () => {
    expect(DEFAULT_INDICATOR_PARAMS.ema9.period).toBe(9);
    expect(DEFAULT_INDICATOR_PARAMS.sma20.period).toBe(20);
    expect(DEFAULT_INDICATOR_PARAMS.bb).toEqual({ period: 20, mult: 2 });
    expect(DEFAULT_INDICATOR_PARAMS.macd).toEqual({ fast: 12, slow: 26, signal: 9 });
    expect(DEFAULT_INDICATOR_PARAMS.stoch).toEqual({ period: 14, k: 3, d: 3 });
    expect(DEFAULT_INDICATOR_PARAMS.supertrend).toEqual({ period: 10, multiplier: 3 });
  });

  it("fall back one indicator at a time when stored values are missing or out of bounds", () => {
    const p = resolveIndicatorParams({ sma20: { period: 34 }, rsi: { period: 0 }, bb: { mult: 2.5 }, junk: 1 });
    expect(p.sma20.period).toBe(34);
    expect(p.rsi).toEqual(DEFAULT_INDICATOR_PARAMS.rsi);
    expect(p.bb).toEqual({ period: 20, mult: 2.5 });
    expect(resolveIndicatorParams(null)).toEqual(DEFAULT_INDICATOR_PARAMS);
    expect(resolveIndicatorParams({ sma20: { period: Number.NaN } }).sma20).toEqual(DEFAULT_INDICATOR_PARAMS.sma20);
    expect(resolveIndicatorParams({ sma20: { period: 2.5 } }).sma20).toEqual(DEFAULT_INDICATOR_PARAMS.sma20);
  });

  it("refuse a MACD whose fast period is not under its slow one", () => {
    expect(resolveIndicatorParams({ macd: { fast: 26, slow: 12, signal: 9 } }).macd).toEqual(DEFAULT_INDICATOR_PARAMS.macd);
    expect(resolveIndicatorParams({ macd: { fast: 5, slow: 35, signal: 5 } }).macd).toEqual({ fast: 5, slow: 35, signal: 5 });
  });

  it("label each chip from the periods in force", () => {
    const p = resolveIndicatorParams({ sma50: { period: 200 }, macd: { fast: 8, slow: 21, signal: 5 }, psar: { step: 0.03 } });
    expect(indicatorLabel("sma50", p)).toBe("SMA 200");
    expect(indicatorLabel("macd", p)).toBe("MACD 8/21/5");
    expect(indicatorLabel("psar", p)).toBe("PSAR (0.03,0.2)");
    expect(indicatorLabel("psar", DEFAULT_INDICATOR_PARAMS)).toBe("PSAR");
    expect(indicatorLabel("bb", DEFAULT_INDICATOR_PARAMS)).toBe("Boll (20,2)");
  });

  it("draw a technique's own lines on the technique's periods, whatever the member set", () => {
    const mine = resolveIndicatorParams({ ema9: { period: 13 }, sma20: { period: 30 }, rsi: { period: 7 } });
    const drawn = effectiveParams(mine, new Set<ParamIndicator>(["ema9", "sma20"]));
    expect(drawn.ema9.period).toBe(9);
    expect(drawn.sma20.period).toBe(20);
    expect(drawn.rsi.period).toBe(7);
    expect(effectiveParams(mine, new Set())).toBe(mine);
  });

  it("offers an editable field for every value it stores", () => {
    for (const key of Object.keys(DEFAULT_INDICATOR_PARAMS) as ParamIndicator[]) {
      expect(PARAM_FIELDS[key].map((f) => f.field).sort()).toEqual(Object.keys(DEFAULT_INDICATOR_PARAMS[key]).sort());
    }
  });
});

describe("presets", () => {
  const preset = (name: string) => ({ name, overlays: ["sma20"], studies: ["rsi"], params: DEFAULT_INDICATOR_PARAMS });

  it("drop invalid presets and keep names unique, the last saved winning", () => {
    const prefs = resolveChartIndicatorPrefs({
      presets: [preset("Swing"), { name: "", overlays: [], studies: [], params: DEFAULT_INDICATOR_PARAMS }, preset("swing"), { nope: 1 }],
    });
    expect(prefs.presets.map((p) => p.name)).toEqual(["swing"]);
  });

  it("keep at most the last MAX_PRESETS", () => {
    const many = Array.from({ length: MAX_PRESETS + 3 }, (_, i) => preset(`P${i}`));
    const prefs = resolveChartIndicatorPrefs({ presets: many });
    expect(prefs.presets).toHaveLength(MAX_PRESETS);
    expect(prefs.presets[0].name).toBe("P3");
  });

  it("refuse unknown indicators", () => {
    expect(ChartPresetSchema.safeParse({ ...preset("x"), overlays: ["ichimoku"] }).success).toBe(false);
  });
});
