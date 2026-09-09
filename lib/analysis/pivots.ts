import type { Bar } from "@/lib/types";

export interface Pivot {
  index: number;
  bar: Bar;
  price: number;
  kind: "high" | "low";
  /**
   * Blueprint ("GSPS Implementation Blueprint" §8.2) audit fields: when the
   * pivot bar itself printed, and when it became usable — the timestamp of
   * the `strength`-th confirming bar on the far side, the same bar whose
   * close is what makes `findPivots` emit this pivot at all. A pivot is
   * never returned before its confirming bars exist in `bars`, so these are
   * always both populated; there is no "occurred but unconfirmed" state.
   */
  occurrenceTimestamp: string;
  confirmationTimestamp: string;
}

/** Swing pivots: a bar whose high/low exceeds `strength` neighbors on each side. */
export function findPivots(bars: Bar[], strength = 3): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = strength; i < bars.length - strength; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      if (bars[j].h >= bars[i].h) isHigh = false;
      if (bars[j].l <= bars[i].l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    const occurrenceTimestamp = bars[i].t;
    const confirmationTimestamp = bars[i + strength].t;
    if (isHigh) {
      pivots.push({ index: i, bar: bars[i], price: bars[i].h, kind: "high", occurrenceTimestamp, confirmationTimestamp });
    }
    if (isLow) {
      pivots.push({ index: i, bar: bars[i], price: bars[i].l, kind: "low", occurrenceTimestamp, confirmationTimestamp });
    }
  }
  return pivots;
}

/** Cluster pivot prices into support/resistance zones within `tolerancePct` of each other. */
export function clusterLevels(prices: number[], tolerancePct = 1.0): number[] {
  if (prices.length === 0) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const current = clusters[clusters.length - 1];
    const mean = current.reduce((s, p) => s + p, 0) / current.length;
    if (Math.abs(sorted[i] - mean) / mean * 100 <= tolerancePct) current.push(sorted[i]);
    else clusters.push([sorted[i]]);
  }
  // Weight clusters by touch count: more touches = stronger level. Return cluster means.
  return clusters
    .sort((a, b) => b.length - a.length)
    .map((c) => c.reduce((s, p) => s + p, 0) / c.length);
}

export function atr(bars: Bar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].c;
    trs.push(
      Math.max(
        bars[i].h - bars[i].l,
        Math.abs(bars[i].h - prevClose),
        Math.abs(bars[i].l - prevClose),
      ),
    );
  }
  const window = trs.slice(-period);
  return window.reduce((s, t) => s + t, 0) / window.length;
}

export function sma(values: number[], period: number): number {
  const window = values.slice(-period);
  if (window.length === 0) return 0;
  return window.reduce((s, v) => s + v, 0) / window.length;
}
