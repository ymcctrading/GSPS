import type { Interval } from "@/lib/marketData/types";

/**
 * The timeframe ladder, mirroring the reference app exactly. Each entry maps to
 * an interval + a lookback label shown in the "{lookback}:{interval}" selector.
 * `extended` variants request pre/post-market (ETH) and render session shading.
 * See docs/GSPS-Chart-UI-Spec.md.
 */
export interface Timeframe {
  /** Stable id, e.g. "1m" or "1m-ext". */
  id: string;
  /** Menu label, e.g. "1 Min" / "1 Min Extended". */
  menuLabel: string;
  /** Selector label, e.g. "15Days:1m". */
  selectorLabel: string;
  interval: Interval;
  extended: boolean;
}

const REGULAR: Array<Omit<Timeframe, "extended" | "id"> & { id: string }> = [
  { id: "1m", menuLabel: "1 Min", selectorLabel: "15Days:1m", interval: "1m" },
  { id: "5m", menuLabel: "5 MIN", selectorLabel: "15Days:5m", interval: "5m" },
  { id: "15m", menuLabel: "15 MIN", selectorLabel: "30Days:15m", interval: "15m" },
  { id: "30m", menuLabel: "30 Min", selectorLabel: "30Days:30m", interval: "30m" },
  { id: "1h", menuLabel: "1HR", selectorLabel: "180Days:1h", interval: "1h" },
  { id: "2h", menuLabel: "2 HR", selectorLabel: "180Days:2h", interval: "2h" },
  { id: "4h", menuLabel: "4hr", selectorLabel: "180Days:4h", interval: "4h" },
  { id: "1d", menuLabel: "Daily", selectorLabel: "5Yr:Day", interval: "1d" },
  { id: "1w", menuLabel: "Weekly", selectorLabel: "15Yr:Week", interval: "1w" },
  { id: "1M", menuLabel: "Monthly", selectorLabel: "MAX:Mon", interval: "1M" },
];

const EXT_LABEL: Record<Interval, string> = {
  "1m": "1 Min Extended",
  "5m": "5MIN Extended",
  "15m": "15Mins Extended",
  "30m": "30 MINS Extended",
  "1h": "1HR Extended",
  "2h": "2HR Extended",
  "4h": "4HR Extended",
  "1d": "Daily Extended",
  "1w": "Weekly Extended",
  "1M": "Monthly Extended",
};

export const TIMEFRAMES: Timeframe[] = [
  ...REGULAR.map((t) => ({ ...t, extended: false })),
  // Extended variants (ETH) — monthly has no extended variant in the app.
  ...REGULAR.filter((t) => t.interval !== "1M").map((t) => ({
    id: `${t.id}-ext`,
    menuLabel: EXT_LABEL[t.interval],
    selectorLabel: `${t.selectorLabel} · ETH`,
    interval: t.interval,
    extended: true,
  })),
];

export const DEFAULT_TIMEFRAME_ID = "1m";

export function timeframeById(id: string): Timeframe {
  return TIMEFRAMES.find((t) => t.id === id) ?? TIMEFRAMES[0];
}
