/**
 * The chart's indicator periods and a member's saved presets (SYNTHESIZED_ROADMAP
 * Q2 item 6, 2026-10-22: "configurable periods and saved presets").
 *
 * What this is, and the line it keeps: the overlays and studies on the chart
 * (`components/chart/candles.tsx`, computed by `lib/indicators.ts`) are tools a
 * member drives to examine their own idea. They never feed a score, gate, plan,
 * entry, stop, target or order (AGENTS.md "Charting indicators"). A period set
 * here changes only what the chart draws. The Strategy Modes keep their own,
 * published periods (`lib/strategies/*`): a preset never moves them, so their
 * levels and the "aligned first" ranking (`lib/strategies/compare.ts`) never
 * change without the member knowing. When the order ticket switches a
 * technique's overlay on, the chart draws it on the technique's periods
 * (`DEFAULT_INDICATOR_PARAMS`, which equal the modes' own) and says so.
 *
 * Stored under `settings.prefs.chartIndicators` (`/api/settings/chart-indicators`),
 * so a member's periods and presets follow them across devices.
 *
 * Three-question basis:
 * 1. Gann: none, deliberately. These are the member's own tools, not GSPS's
 *    method; Gann's levels, angles and swing charts draw from their own rules.
 * 2. Cycles: a period here is a lookback window, not a claim that the market
 *    repeats on it, so Dewey's checklist does not apply.
 * 3. Hermetic: Mentalism. The chart shows the idea the member brings, on the
 *    terms they set; the platform declines to choose their lens for them. Law
 *    of Creation: overlay ⊗ periods saved as a preset is a mixture, a recalled
 *    view, and creates nothing the parts did not hold.
 *
 * Engineering choices, labelled: the bounds on each value and the limit of
 * `MAX_PRESETS` presets keep a stored setting small and every chart draw cheap.
 */

import { z } from "zod";

/** Overlays drawn in the price pane. The ids are kept from before periods were configurable. */
export const CHART_OVERLAYS = ["sma20", "sma50", "ema9", "bb", "psar", "supertrend", "vwap", "donchian"] as const;
export type ChartOverlay = (typeof CHART_OVERLAYS)[number];
/** Studies drawn in their own pane. */
export const CHART_STUDIES = ["volume", "rsi", "macd", "stoch"] as const;
export type ChartStudy = (typeof CHART_STUDIES)[number];

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const num = (min: number, max: number) => z.number().finite().min(min).max(max);

export const IndicatorParamsSchema = z.object({
  sma20: z.object({ period: int(2, 400) }),
  sma50: z.object({ period: int(2, 400) }),
  ema9: z.object({ period: int(2, 400) }),
  bb: z.object({ period: int(2, 400), mult: num(0.5, 5) }),
  psar: z.object({ step: num(0.001, 0.2), max: num(0.01, 1) }),
  supertrend: z.object({ period: int(2, 200), multiplier: num(0.5, 10) }),
  donchian: z.object({ period: int(2, 400) }),
  rsi: z.object({ period: int(2, 200) }),
  macd: z.object({ fast: int(2, 200), slow: int(3, 400), signal: int(2, 200) }),
  stoch: z.object({ period: int(2, 200), k: int(1, 50), d: int(1, 50) }),
});
export type IndicatorParams = z.infer<typeof IndicatorParamsSchema>;
export type ParamIndicator = keyof IndicatorParams;

/** The published periods. They equal the Strategy Modes' own (`lib/strategies/math.ts`). */
export const DEFAULT_INDICATOR_PARAMS: IndicatorParams = {
  sma20: { period: 20 },
  sma50: { period: 50 },
  ema9: { period: 9 },
  bb: { period: 20, mult: 2 },
  psar: { step: 0.02, max: 0.2 },
  supertrend: { period: 10, multiplier: 3 },
  donchian: { period: 20 },
  rsi: { period: 14 },
  macd: { fast: 12, slow: 26, signal: 9 },
  stoch: { period: 14, k: 3, d: 3 },
};

export const MAX_PRESETS = 12;
export const PRESET_NAME_MAX = 40;

export const ChartPresetSchema = z.object({
  name: z.string().trim().min(1).max(PRESET_NAME_MAX),
  overlays: z.array(z.enum(CHART_OVERLAYS)).max(CHART_OVERLAYS.length),
  studies: z.array(z.enum(CHART_STUDIES)).max(CHART_STUDIES.length),
  params: IndicatorParamsSchema,
});
export type ChartPreset = z.infer<typeof ChartPresetSchema>;

export interface ChartIndicatorPrefs {
  params: IndicatorParams;
  presets: ChartPreset[];
}

/**
 * One indicator's stored values, or the default where they are missing or out
 * of bounds. MACD's fast period must sit under its slow one.
 */
function resolveOne<K extends ParamIndicator>(key: K, raw: unknown): IndicatorParams[K] {
  const shape = IndicatorParamsSchema.shape[key];
  const parsed = shape.safeParse({ ...DEFAULT_INDICATOR_PARAMS[key], ...(raw && typeof raw === "object" ? raw : {}) });
  if (!parsed.success) return DEFAULT_INDICATOR_PARAMS[key];
  const value = parsed.data as IndicatorParams[K];
  if (key === "macd") {
    const m = value as IndicatorParams["macd"];
    if (m.fast >= m.slow) return DEFAULT_INDICATOR_PARAMS[key];
  }
  return value;
}

/** Every indicator's values, each falling back to its default on its own. */
export function resolveIndicatorParams(raw: unknown): IndicatorParams {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<ParamIndicator, unknown>;
  for (const key of Object.keys(DEFAULT_INDICATOR_PARAMS) as ParamIndicator[]) out[key] = resolveOne(key, obj[key]);
  return out as IndicatorParams;
}

/** The stored prefs, cleaned: bad presets are dropped, names kept unique (the last wins). */
export function resolveChartIndicatorPrefs(raw: unknown): ChartIndicatorPrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const byName = new Map<string, ChartPreset>();
  for (const p of Array.isArray(obj.presets) ? obj.presets : []) {
    const parsed = ChartPresetSchema.safeParse(p);
    if (!parsed.success) continue;
    const preset = { ...parsed.data, params: resolveIndicatorParams(parsed.data.params) };
    byName.delete(preset.name.toLowerCase());
    byName.set(preset.name.toLowerCase(), preset);
  }
  return { params: resolveIndicatorParams(obj.params), presets: [...byName.values()].slice(-MAX_PRESETS) };
}

/** Whether an indicator's values differ from the published ones. */
export function isCustomised(params: IndicatorParams, key: ParamIndicator): boolean {
  return JSON.stringify(params[key]) !== JSON.stringify(DEFAULT_INDICATOR_PARAMS[key]);
}

const fmt = (n: number) => String(Number(n.toFixed(3)));

/** The chip's label, read from the periods in force. */
export function indicatorLabel(key: ChartOverlay | ChartStudy, params: IndicatorParams): string {
  switch (key) {
    case "sma20":
      return `SMA ${params.sma20.period}`;
    case "sma50":
      return `SMA ${params.sma50.period}`;
    case "ema9":
      return `EMA ${params.ema9.period}`;
    case "bb":
      return `Boll (${params.bb.period},${fmt(params.bb.mult)})`;
    case "psar":
      return isCustomised(params, "psar") ? `PSAR (${fmt(params.psar.step)},${fmt(params.psar.max)})` : "PSAR";
    case "supertrend":
      return isCustomised(params, "supertrend")
        ? `Supertrend (${params.supertrend.period},${fmt(params.supertrend.multiplier)})`
        : "Supertrend";
    case "vwap":
      return "VWAP";
    case "donchian":
      return `Donchian ${params.donchian.period}`;
    case "volume":
      return "Volume";
    case "rsi":
      return `RSI ${params.rsi.period}`;
    case "macd":
      return `MACD ${params.macd.fast}/${params.macd.slow}/${params.macd.signal}`;
    case "stoch":
      return `Stoch ${params.stoch.period}/${params.stoch.k}/${params.stoch.d}`;
  }
}

/**
 * The periods the chart draws with: the member's, except the indicators a
 * chosen technique switched on, which draw on the technique's own periods.
 */
export function effectiveParams(params: IndicatorParams, techniqueIndicators: ReadonlySet<ParamIndicator>): IndicatorParams {
  if (techniqueIndicators.size === 0) return params;
  const out = { ...params } as Record<ParamIndicator, unknown>;
  for (const key of techniqueIndicators) out[key] = DEFAULT_INDICATOR_PARAMS[key];
  return out as IndicatorParams;
}

/** One change to a member's chart indicator settings (the PUT body). */
export const ChartIndicatorChangeSchema = z.union([
  z.object({ params: IndicatorParamsSchema }).strict(),
  z.object({ savePreset: ChartPresetSchema }).strict(),
  z.object({ deletePreset: z.string().trim().min(1).max(PRESET_NAME_MAX) }).strict(),
]);
export type ChartIndicatorChange = z.infer<typeof ChartIndicatorChangeSchema>;

export type ChartIndicatorChangeResult =
  | { ok: true; prefs: Record<string, unknown>; chartIndicators: ChartIndicatorPrefs }
  | { ok: false; error: string };

const MACD_ORDER_ERROR = "MACD's fast period must be shorter than its slow one.";

/**
 * Applies one change to a member's whole `settings.prefs` and returns the
 * prefs to store. Every other key is kept: `prefs` also holds the trade style
 * history the exit managers read (`gannRules.tradeStyleHistory`), Guided Mode
 * and onboarding. The caller must pass prefs it actually read; a failed read
 * is never stood in for by `{}`, or the write would erase those keys.
 */
export function applyChartIndicatorChange(
  prefs: Record<string, unknown>,
  change: ChartIndicatorChange,
): ChartIndicatorChangeResult {
  const current = resolveChartIndicatorPrefs(prefs.chartIndicators);
  const next: ChartIndicatorPrefs = { ...current };
  if ("params" in change) {
    if (change.params.macd.fast >= change.params.macd.slow) return { ok: false, error: MACD_ORDER_ERROR };
    next.params = resolveIndicatorParams(change.params);
  } else if ("savePreset" in change) {
    if (change.savePreset.params.macd.fast >= change.savePreset.params.macd.slow) {
      return { ok: false, error: MACD_ORDER_ERROR };
    }
    const key = change.savePreset.name.toLowerCase();
    const others = current.presets.filter((p) => p.name.toLowerCase() !== key);
    if (others.length >= MAX_PRESETS) {
      return { ok: false, error: `You can keep up to ${MAX_PRESETS} presets. Delete one first.` };
    }
    next.presets = [...others, change.savePreset];
  } else {
    const key = change.deletePreset.toLowerCase();
    next.presets = current.presets.filter((p) => p.name.toLowerCase() !== key);
  }
  return { ok: true, prefs: { ...prefs, chartIndicators: next }, chartIndicators: next };
}

/** The editable fields of each indicator, for the settings panel. */
export const PARAM_FIELDS: Record<ParamIndicator, { field: string; label: string; step: number }[]> = {
  sma20: [{ field: "period", label: "Period", step: 1 }],
  sma50: [{ field: "period", label: "Period", step: 1 }],
  ema9: [{ field: "period", label: "Period", step: 1 }],
  bb: [
    { field: "period", label: "Period", step: 1 },
    { field: "mult", label: "Std dev", step: 0.1 },
  ],
  psar: [
    { field: "step", label: "Step", step: 0.01 },
    { field: "max", label: "Max", step: 0.01 },
  ],
  supertrend: [
    { field: "period", label: "Period", step: 1 },
    { field: "multiplier", label: "Multiplier", step: 0.1 },
  ],
  donchian: [{ field: "period", label: "Period", step: 1 }],
  rsi: [{ field: "period", label: "Period", step: 1 }],
  macd: [
    { field: "fast", label: "Fast", step: 1 },
    { field: "slow", label: "Slow", step: 1 },
    { field: "signal", label: "Signal", step: 1 },
  ],
  stoch: [
    { field: "period", label: "Period", step: 1 },
    { field: "k", label: "%K", step: 1 },
    { field: "d", label: "%D", step: 1 },
  ],
};
