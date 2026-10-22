/**
 * The figures a cell of the intraday alert replay is read by
 * (`scripts/intraday-alerts.mjs`): the all-trade mean R with its bootstrap
 * 95% interval, the two chronological halves, the win rate against the
 * break-even its own average win and loss imply, the trades still open at the
 * end, and the split by exit and by signal.
 */

import { bootstrapMeanCI95, computeClosedSummary, type ClosedSummary } from "./metrics";
import { isOpenAtEnd } from "./replay";
import type { AlertTrade } from "./replayIntradayAlerts";

export interface AlertCellSummary {
  n: number;
  /** Null with no trades. */
  expectancyR: number | null;
  medianR: number | null;
  expectancyCI95: [number, number] | null;
  winRate: number;
  /** avg loss / (avg win + avg loss), from the cell's own trades. */
  breakEvenWinRate: number | null;
  halves: { first: { n: number; expectancyR: number | null; from: string | null }; second: { n: number; expectancyR: number | null; from: string | null } };
  openAtEnd: number;
  closed: ClosedSummary;
  medianBarsHeld: number | null;
  byExit: Record<string, { n: number; expectancyR: number | null }>;
  bySignal: Record<string, { n: number; expectancyR: number | null }>;
  /** `plan_level_held` trades by how their daily plan was armed (crossing, oldLevel, hold). */
  byPlanEntryKind: Record<string, { n: number; expectancyR: number | null }>;
}

const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** The middle value, the mean of the two middle values for an even count. */
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function groupBy(trades: AlertTrade[], key: (t: AlertTrade) => string): Record<string, { n: number; expectancyR: number | null }> {
  const groups = new Map<string, number[]>();
  for (const t of trades) {
    const k = key(t);
    const list = groups.get(k);
    if (list) list.push(t.rMultiple);
    else groups.set(k, [t.rMultiple]);
  }
  return Object.fromEntries([...groups].map(([k, rs]) => [k, { n: rs.length, expectancyR: mean(rs) }]));
}

export function summariseAlertTrades(trades: AlertTrade[]): AlertCellSummary {
  const sorted = [...trades].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  const rs = sorted.map((t) => t.rMultiple);
  const half = Math.floor(sorted.length / 2);
  const first = sorted.slice(0, half);
  const second = sorted.slice(half);
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r <= 0);
  const avgWin = mean(wins) ?? 0;
  const avgLoss = Math.abs(mean(losses) ?? 0);
  return {
    n: sorted.length,
    expectancyR: mean(rs),
    medianR: median(rs),
    expectancyCI95: bootstrapMeanCI95(rs),
    winRate: sorted.length > 0 ? wins.length / sorted.length : 0,
    breakEvenWinRate: wins.length > 0 && losses.length > 0 ? avgLoss / (avgWin + avgLoss) : null,
    halves: {
      first: { n: first.length, expectancyR: mean(first.map((t) => t.rMultiple)), from: first[0]?.openedAt ?? null },
      second: { n: second.length, expectancyR: mean(second.map((t) => t.rMultiple)), from: second[0]?.openedAt ?? null },
    },
    openAtEnd: sorted.filter(isOpenAtEnd).length,
    closed: computeClosedSummary(sorted),
    medianBarsHeld: median(sorted.map((t) => t.barsHeld)),
    byExit: groupBy(sorted, (t) => String(t.exitReason)),
    bySignal: groupBy(sorted, (t) => t.signal),
    byPlanEntryKind: groupBy(sorted.filter((t) => t.signal === "plan_level_held"), (t) => t.entryKind ?? "unknown"),
  };
}
