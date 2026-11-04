/**
 * Portfolio equity from a replay's trade ledger (quant validation, slice 1).
 * Measurement only: nothing here changes a verdict, score, plan or order.
 *
 * Why: every replay report is per-trade R. Hundreds of campaigns run at once
 * across correlated large caps, so a mean R says nothing about the capital a
 * trader needs, the drawdown they sit through, or how many independent bets
 * they really made. This walks the ledger in time order against one account:
 *
 * - **Sizing.** One R is the first lot's planned risk, |entry − stop| a share.
 *   Shares = floor(equity × `riskFraction` / risk a share), then capped by
 *   `maxPositionFraction` of equity in notional. If that rounds to zero the
 *   campaign is skipped ("unit over budget"), never rounded up.
 * - **Caps.** A campaign is skipped when the account already holds
 *   `maxConcurrent` campaigns, or when its planned risk would lift the total
 *   open planned risk past `maxOpenRiskFraction` of equity.
 * - **Result.** A campaign's dollar result is its `rMultiple` (the whole line,
 *   costs already charged by the replay) times its dollar risk. Pyramided adds
 *   are carried inside that R; their extra notional is not capped here, which
 *   is disclosed in `assumptions`.
 * - **Marking.** With `closes` (each symbol's daily closes) an open campaign's
 *   first lot is marked to market every session; without them equity moves
 *   only on exit days, and `assumptions` says so.
 *
 * Planned stop risk is not realised risk: a gap through the stop loses more
 * than 1R, and that shows in the R values the replay already measured.
 *
 * Design basis (AGENTS.md mandate). Gann: his capital rules (risk a tenth of
 * capital at most, and never more than the stop allows) are the reason sizing
 * is from the stop; the fractions here are engineering choices, labelled.
 * Cycles: none claimed. Hermetic: Correspondence, the account answers to the
 * sum of its trades. Law of Creation: trades ⊗ one account create the
 * drawdown and exposure neither holds alone.
 */

export interface PortfolioTrade {
  symbol: string;
  openedAt: string;
  /** Null while still open at the data's end (then marked at its last R). */
  closedAt: string | null;
  entry: number;
  stop: number;
  side?: "long" | "short";
  direction?: "bullish" | "bearish";
  rMultiple: number;
}

export interface PortfolioOptions {
  startEquity?: number;
  /** Planned risk per campaign as a share of equity (default 0.005, 0.5%). */
  riskFraction?: number;
  /** Total open planned risk cap as a share of equity (default 0.06). */
  maxOpenRiskFraction?: number;
  /** Most campaigns open at once (default 20). */
  maxConcurrent?: number;
  /** Most notional in one campaign's first lot as a share of equity (default 0.2). */
  maxPositionFraction?: number;
  /** Each symbol's daily closes, `t` an ISO time, for mark-to-market. */
  closes?: ReadonlyMap<string, ReadonlyArray<{ t: string; c: number }>>;
}

export type SkipReason = "unit over budget" | "open risk cap" | "concurrency cap" | "invalid levels";

export interface EquityPoint {
  date: string;
  equity: number;
  open: number;
}

export interface PortfolioResult {
  startEquity: number;
  endEquity: number;
  taken: number;
  skipped: Record<SkipReason, number>;
  curve: EquityPoint[];
  dailyReturns: number[];
  totalReturn: number;
  cagr: number;
  maxDrawdown: number;
  /** Longest stretch, in sessions on the curve, from a peak to its recovery (or the end). */
  maxDrawdownSessions: number;
  /** Share of sessions with at least one campaign open. */
  exposure: number;
  averageOpen: number;
  monthly: Array<{ month: string; return: number }>;
  losingMonths: number;
  assumptions: string[];
}

const DEFAULTS = { startEquity: 100_000, riskFraction: 0.005, maxOpenRiskFraction: 0.06, maxConcurrent: 20, maxPositionFraction: 0.2 };

/** The ET-agnostic session key of an ISO time: its UTC date. Replay times are 04:00 or 05:00 UTC (ET midnight), so the UTC date is the session. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function sideSign(t: PortfolioTrade): 1 | -1 {
  if (t.side) return t.side === "short" ? -1 : 1;
  return t.direction === "bearish" ? -1 : 1;
}

/** Weekdays from `from` to `to` inclusive (YYYY-MM-DD), used when no closes give the real sessions. */
function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let d = Date.parse(`${from}T00:00:00Z`); d <= end; d += 86_400_000) {
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(new Date(d).toISOString().slice(0, 10));
  }
  return out;
}

interface OpenPosition {
  trade: PortfolioTrade;
  shares: number;
  riskDollars: number;
  close: string | null;
}

export function simulatePortfolio(trades: readonly PortfolioTrade[], options: PortfolioOptions = {}): PortfolioResult {
  const o = { ...DEFAULTS, ...options };
  for (const [k, v] of Object.entries({ startEquity: o.startEquity, riskFraction: o.riskFraction, maxOpenRiskFraction: o.maxOpenRiskFraction, maxPositionFraction: o.maxPositionFraction })) {
    if (!(Number.isFinite(v) && v > 0)) throw new Error(`simulatePortfolio: ${k} must be a positive number`);
  }
  if (!(Number.isInteger(o.maxConcurrent) && o.maxConcurrent >= 1)) throw new Error("simulatePortfolio: maxConcurrent must be a whole number >= 1");

  const skipped: Record<SkipReason, number> = { "unit over budget": 0, "open risk cap": 0, "concurrency cap": 0, "invalid levels": 0 };
  const assumptions = [
    `Risk ${(o.riskFraction * 100).toFixed(2)}% of equity a campaign, open planned risk capped at ${(o.maxOpenRiskFraction * 100).toFixed(1)}%, at most ${o.maxConcurrent} open, first lot at most ${(o.maxPositionFraction * 100).toFixed(0)}% of equity.`,
    "Shares round down; a campaign whose single share exceeds the budget is skipped.",
    "Pyramided adds are inside each campaign's R; their extra notional is not capped.",
    "Campaigns that open the same session are taken in ledger order (symbol order), an engineering choice.",
  ];

  const valid = trades.filter((t) => {
    const ok = Number.isFinite(t.entry) && Number.isFinite(t.stop) && t.entry > 0 && t.stop > 0 && t.entry !== t.stop && Number.isFinite(t.rMultiple);
    if (!ok) skipped["invalid levels"]++;
    return ok;
  });
  if (valid.length === 0) {
    return { startEquity: o.startEquity, endEquity: o.startEquity, taken: 0, skipped, curve: [], dailyReturns: [], totalReturn: 0, cagr: 0, maxDrawdown: 0, maxDrawdownSessions: 0, exposure: 0, averageOpen: 0, monthly: [], losingMonths: 0, assumptions };
  }

  // Session grid.
  let sessions: string[];
  const first = valid.reduce((m, t) => (dayOf(t.openedAt) < m ? dayOf(t.openedAt) : m), dayOf(valid[0].openedAt));
  const last = valid.reduce((m, t) => {
    const d = dayOf(t.closedAt ?? t.openedAt);
    return d > m ? d : m;
  }, first);
  const closeIndex = new Map<string, Map<string, number>>();
  if (o.closes && o.closes.size > 0) {
    const set = new Set<string>();
    for (const [sym, bars] of o.closes) {
      const m = new Map<string, number>();
      for (const b of bars) {
        const d = dayOf(b.t);
        if (Number.isFinite(b.c) && b.c > 0) m.set(d, b.c);
        if (d >= first && d <= last) set.add(d);
      }
      closeIndex.set(sym, m);
    }
    sessions = [...set].sort();
    assumptions.push("Open campaigns' first lots are marked to each session's close; adds are realised at exit only.");
  } else {
    sessions = weekdays(first, last);
    assumptions.push("No daily closes supplied: equity moves only on exit days (no mark-to-market), so drawdowns are understated and weekday holidays read as flat sessions.");
  }

  const opensBy = new Map<string, PortfolioTrade[]>();
  for (const t of valid) {
    const d = dayOf(t.openedAt);
    if (!opensBy.has(d)) opensBy.set(d, []);
    opensBy.get(d)!.push(t);
  }

  let cash = o.startEquity; // realised equity
  const open: OpenPosition[] = [];
  const lastMark = new Map<OpenPosition, number>();
  const curve: EquityPoint[] = [];
  let taken = 0;
  let openSessions = 0;
  let openSum = 0;

  const marked = (session: string) => {
    let unreal = 0;
    for (const p of open) {
      const c = closeIndex.get(p.trade.symbol)?.get(session);
      if (c !== undefined) lastMark.set(p, sideSign(p.trade) * (c - p.trade.entry) * p.shares);
      unreal += lastMark.get(p) ?? 0;
    }
    return cash + unreal;
  };

  for (const session of sessions) {
    // Exits first: a campaign that closes today frees its risk before today's entries.
    for (let k = open.length - 1; k >= 0; k--) {
      const p = open[k];
      if (p.close !== null && p.close <= session) {
        cash += p.trade.rMultiple * p.riskDollars;
        lastMark.delete(p);
        open.splice(k, 1);
      }
    }
    // Entries, sized on equity as it stands (marked when closes exist).
    const equityNow = marked(session);
    for (const t of opensBy.get(session) ?? []) {
      if (open.length >= o.maxConcurrent) {
        skipped["concurrency cap"]++;
        continue;
      }
      const perShare = Math.abs(t.entry - t.stop);
      const byRisk = Math.floor((equityNow * o.riskFraction) / perShare);
      const byNotional = Math.floor((equityNow * o.maxPositionFraction) / t.entry);
      const shares = Math.min(byRisk, byNotional);
      if (!(shares >= 1)) {
        skipped["unit over budget"]++;
        continue;
      }
      const riskDollars = shares * perShare;
      const openRisk = open.reduce((s, p) => s + p.riskDollars, 0);
      if (openRisk + riskDollars > equityNow * o.maxOpenRiskFraction + 1e-9) {
        skipped["open risk cap"]++;
        continue;
      }
      const close = t.closedAt ? dayOf(t.closedAt) : null;
      const pos: OpenPosition = { trade: t, shares, riskDollars, close };
      // A campaign opened and closed the same session is realised now.
      if (close !== null && close <= session) cash += t.rMultiple * riskDollars;
      else open.push(pos);
      taken++;
    }
    const equity = marked(session);
    if (open.length > 0) openSessions++;
    openSum += open.length;
    curve.push({ date: session, equity, open: open.length });
  }
  // Still open at the data's end: realised at their last R (the replay marks those to market).
  for (const p of open) cash += p.trade.rMultiple * p.riskDollars;
  const endEquity = cash;
  if (curve.length > 0) curve[curve.length - 1] = { ...curve[curve.length - 1], equity: endEquity };

  const dailyReturns: number[] = [];
  for (let i = 1; i < curve.length; i++) dailyReturns.push(curve[i - 1].equity > 0 ? curve[i].equity / curve[i - 1].equity - 1 : 0);

  let peak = o.startEquity;
  let peakIdx = -1;
  let maxDrawdown = 0;
  let maxDrawdownSessions = 0;
  for (let i = 0; i < curve.length; i++) {
    const e = curve[i].equity;
    if (e >= peak) {
      peak = e;
      peakIdx = i;
    } else {
      maxDrawdown = Math.max(maxDrawdown, 1 - e / peak);
      maxDrawdownSessions = Math.max(maxDrawdownSessions, i - peakIdx);
    }
  }

  const monthly: Array<{ month: string; return: number }> = [];
  let prevEnd = o.startEquity;
  for (let i = 0; i < curve.length; i++) {
    const m = curve[i].date.slice(0, 7);
    if (i === curve.length - 1 || curve[i + 1].date.slice(0, 7) !== m) {
      monthly.push({ month: m, return: prevEnd > 0 ? curve[i].equity / prevEnd - 1 : 0 });
      prevEnd = curve[i].equity;
    }
  }

  const years = curve.length > 1 ? (Date.parse(curve[curve.length - 1].date) - Date.parse(curve[0].date)) / (365.25 * 86_400_000) : 0;
  const totalReturn = endEquity / o.startEquity - 1;
  return {
    startEquity: o.startEquity,
    endEquity,
    taken,
    skipped,
    curve,
    dailyReturns,
    totalReturn,
    cagr: years > 0 && endEquity > 0 ? Math.pow(endEquity / o.startEquity, 1 / years) - 1 : NaN,
    maxDrawdown,
    maxDrawdownSessions,
    exposure: curve.length > 0 ? openSessions / curve.length : 0,
    averageOpen: curve.length > 0 ? openSum / curve.length : 0,
    monthly,
    losingMonths: monthly.filter((m) => m.return < 0).length,
    assumptions,
  };
}
