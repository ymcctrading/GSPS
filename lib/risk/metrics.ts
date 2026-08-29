/**
 * Loss/drawdown metrics for the circuit breaker.
 *
 * Three separate metrics, deliberately not collapsed into one "total funds"
 * number: a 48h loss spike, a bad start-of-day open, and a 30-day rolling
 * high-water drawdown answer different questions and trigger different
 * states (see lib/risk/config.ts). Every input equity point must already be
 * investment P&L — i.e. external flows (deposits/withdrawals/transfers/
 * corporate actions) stripped out via `lib/risk/account.ts` — otherwise a
 * deposit mid-window would read as a loss recovering.
 */

export interface EquitySample {
  at: Date;
  equity: number;
}

/** Percent loss (positive = a loss; 0 or negative = flat/up) from a baseline to the latest sample. */
export interface LossMetric {
  /** Positive percent lost from the baseline; 0 when flat or up. */
  lossPct: number;
  baselineEquity: number;
  currentEquity: number;
}

function pctLoss(baseline: number, current: number): number {
  if (!(baseline > 0)) return 0;
  return Math.max(0, ((baseline - current) / baseline) * 100);
}

/**
 * Loss over the trailing 48 hours: baseline is the equity at (or just before)
 * `now - 48h`, current is the latest sample at or before `now`.
 */
export function rolling48hLoss(samples: EquitySample[], now: Date): LossMetric {
  const cutoff = new Date(now.getTime() - 48 * 3600 * 1000);
  return windowLoss(samples, cutoff, now);
}

/**
 * Loss since the start of the current trading day: baseline is the last
 * equity sample at or before `sessionStart` (the prior close), current is
 * the latest sample.
 */
export function startOfDayLoss(samples: EquitySample[], sessionStart: Date, now: Date): LossMetric {
  return windowLoss(samples, sessionStart, now);
}

function windowLoss(samples: EquitySample[], from: Date, to: Date): LossMetric {
  const sorted = [...samples].sort((a, b) => a.at.getTime() - b.at.getTime());
  const before = sorted.filter((s) => s.at.getTime() <= from.getTime());
  const upTo = sorted.filter((s) => s.at.getTime() <= to.getTime());
  const baseline = before.length > 0 ? before[before.length - 1].equity : (upTo[0]?.equity ?? 0);
  const current = upTo.length > 0 ? upTo[upTo.length - 1].equity : baseline;
  return { lossPct: pctLoss(baseline, current), baselineEquity: baseline, currentEquity: current };
}

/**
 * 30-day rolling high-water drawdown: the high-water mark is the peak equity
 * within the trailing 30 days, not all-time — a mark set 90 days ago and
 * never revisited should not keep the account permanently near a lock
 * threshold.
 */
export function rollingHighWaterDrawdown(samples: EquitySample[], now: Date): LossMetric {
  const cutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const window = samples
    .filter((s) => s.at.getTime() >= cutoff.getTime() && s.at.getTime() <= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (window.length === 0) return { lossPct: 0, baselineEquity: 0, currentEquity: 0 };
  const peak = window.reduce((max, s) => Math.max(max, s.equity), window[0].equity);
  const current = window[window.length - 1].equity;
  return { lossPct: pctLoss(peak, current), baselineEquity: peak, currentEquity: current };
}
