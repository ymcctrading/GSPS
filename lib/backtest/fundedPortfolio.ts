/**
 * A funded, lot-level portfolio ledger (quant validation, edge isolation
 * handoff, task 2). Measurement only: nothing here changes a verdict, score,
 * plan, order or risk setting. `portfolio.ts` is left exactly as it was so the
 * original report can still be reproduced; this is the corrected simulator,
 * versioned separately (`FUNDED_PORTFOLIO_VERSION`).
 *
 * What it corrects in `portfolio.ts` (each a simulator correction, not a
 * trading-rule change):
 *
 * 1. **Cash is a ledger.** A purchase debits cash (shares × fill plus half
 *    the round-trip cost); a sale credits it. A short sale credits proceeds and
 *    books a liability. Nothing is bought without the cash to pay for it: no
 *    borrowing, no financing, no interest on cash (all declared).
 * 2. **Every lot is marked.** First lots and pyramid adds alike are valued at
 *    each session's close; a symbol with no close that session keeps its last
 *    mark and the session is counted (`staleMarks`), so a missing price never
 *    creates a return.
 * 3. **Adds are funded and capped.** An add buys `fraction` × the first lot's
 *    shares at the ledger's fill, only from cash on hand and only within
 *    `maxGrossExposure`; what doesn't fit is trimmed or skipped and counted.
 * 4. **Event time.** Sizing for session S uses equity marked at S − 1's close
 *    (never S's close). Within S: first lots at their fills, then adds, then
 *    exits, then the close mark. A same-session exit's proceeds can't fund
 *    that session's entries or adds (conservative: an exit at the open would
 *    have come first, and that is given up).
 * 5. **Allocation order is declared.** Same-session entries are taken in
 *    ledger order (the original's symbol order) or in a seeded shuffle, so the
 *    sensitivity can be measured.
 * 6. **Drawdown duration is named.** `maxDrawdown` with its own peak-to-trough
 *    sessions, and separately the longest underwater stretch (peak to recovery
 *    or the end), with whether it recovered.
 *
 * Declared limits, not corrected here: the exit path is the replay's, which
 * assumed every add filled; a trimmed add would in the replay have left a
 * different stop, so the campaign's exit is not recomputed (a causal answer
 * needs the replay run with funding, task 5). Planned risk is the first lot's
 * initial stop distance (the ledger holds no stop path); gross exposure is
 * reported beside it. Dividends are not credited (split-adjusted bars only).
 *
 * Design basis (AGENTS.md mandate). Gann: his capital rules (never more at
 * risk than the stop allows, and adds only from the market's own profits) are
 * why adds are funded from cash and capped, not assumed. Cycles: none claimed.
 * Hermetic: Correspondence, the account answers to every lot it holds, not
 * only the first. Law of Creation: lots ⊗ one cash account create the funding
 * constraint neither has alone; it re-enters as the trimmed-add count.
 */

import { seededRandom } from "@/lib/backtest/selectionBias";

export const FUNDED_PORTFOLIO_VERSION = "funded-ledger-1";

export interface LotFill {
  fraction: number;
  fill: number;
  at: string;
}

export interface FundedTrade {
  symbol: string;
  openedAt: string;
  /** Null while open at the data's end. */
  closedAt: string | null;
  entry: number;
  stop: number;
  side?: "long" | "short";
  direction?: "bullish" | "bearish";
  /** The whole line's exit price; required for a closed campaign. */
  exitPrice?: number | null;
  /** The replay's fills, first lot first. Absent means one lot at `entry`. */
  lotFills?: readonly LotFill[];
}

export interface FundedOptions {
  startEquity?: number;
  /** Planned first-lot risk as a share of equity (default 0.0025). */
  riskFraction?: number;
  /** Cap on total open planned risk as a share of equity (default 0.25). */
  maxOpenRiskFraction?: number;
  maxConcurrent?: number;
  /** Cap on a first lot's notional as a share of equity (default 0.1). */
  maxPositionFraction?: number;
  /** Cap on gross notional (longs plus short liabilities) as a multiple of equity (default 1: cash only). */
  maxGrossExposure?: number;
  /** Round-trip cost a share, half charged on each side (default 0.02). */
  costPerShare?: number;
  /** Same-session entry order: "ledger" (as given) or a seeded shuffle. */
  order?: "ledger" | { seed: number };
  /** Each symbol's daily bars (`t` ISO, `c` close). */
  closes: ReadonlyMap<string, ReadonlyArray<{ t: string; c: number }>>;
}

export type FundedSkip = "invalid levels" | "no session" | "concurrency cap" | "unit over budget" | "open risk cap" | "insufficient cash" | "gross exposure cap" | "already open";

export interface CampaignTrace {
  symbol: string;
  openedAt: string;
  accepted: boolean;
  reason: FundedSkip | null;
  firstShares: number;
  addsFilled: number;
  addsTrimmed: number;
  addsSkipped: number;
  /** Dollar result, costs included; open campaigns marked at the last close. */
  pnl: number;
  open: boolean;
}

export interface FundedPoint {
  date: string;
  equity: number;
  cash: number;
  longValue: number;
  shortLiability: number;
  gross: number;
  openCampaigns: number;
  openRisk: number;
}

export interface DrawdownStats {
  maxDrawdown: number;
  peakDate: string | null;
  troughDate: string | null;
  peakToTroughSessions: number;
  longestUnderwaterSessions: number;
  recovered: boolean;
}

export interface FundedResult {
  version: string;
  startEquity: number;
  endEquity: number;
  curve: FundedPoint[];
  dailyReturns: number[];
  campaigns: CampaignTrace[];
  taken: number;
  skipped: Record<FundedSkip, number>;
  addsFilled: number;
  addsTrimmed: number;
  addsSkipped: number;
  staleMarks: number;
  totalCosts: number;
  totalReturn: number;
  cagr: number;
  sharpe: number;
  drawdown: DrawdownStats;
  maxGross: number;
  averageGross: number;
  exposure: number;
  /** Largest |equity − (start + realised P&L + open lots' unrealised P&L − open lots' entry costs)| over the curve: an independent check of the cash ledger. */
  reconciliationError: number;
  assumptions: string[];
}

const DEFAULTS = { startEquity: 100_000, riskFraction: 0.0025, maxOpenRiskFraction: 0.25, maxConcurrent: 100, maxPositionFraction: 0.1, maxGrossExposure: 1, costPerShare: 0.02 };

const dayOf = (iso: string) => iso.slice(0, 10);
const signOf = (t: FundedTrade): 1 | -1 => (t.side ? (t.side === "short" ? -1 : 1) : t.direction === "bearish" ? -1 : 1);

interface Lot {
  shares: number;
  fill: number;
}

interface Position {
  trade: FundedTrade;
  trace: CampaignTrace;
  dir: 1 | -1;
  firstShares: number;
  lots: Lot[];
  riskDollars: number;
  mark: number;
  /** Adds not yet due, in time order. */
  pendingAdds: LotFill[];
  closeDay: string | null;
}

/** Drawdown depth with its own peak-to-trough span, and the longest underwater stretch, from an equity series. */
export function drawdownStats(curve: ReadonlyArray<{ date: string; equity: number }>, start: number): DrawdownStats {
  let peak = start;
  let peakIdx = -1;
  let best = { maxDrawdown: 0, peakIdx: -1, troughIdx: -1 };
  let longest = 0;
  let underwaterFrom = -1;
  for (let i = 0; i < curve.length; i++) {
    const e = curve[i].equity;
    if (e >= peak) {
      if (underwaterFrom >= 0) longest = Math.max(longest, i - underwaterFrom);
      underwaterFrom = -1;
      peak = e;
      peakIdx = i;
    } else {
      if (underwaterFrom < 0) underwaterFrom = peakIdx;
      const dd = 1 - e / peak;
      if (dd > best.maxDrawdown) best = { maxDrawdown: dd, peakIdx, troughIdx: i };
    }
  }
  const recovered = underwaterFrom < 0;
  if (!recovered) longest = Math.max(longest, curve.length - 1 - underwaterFrom);
  return {
    maxDrawdown: best.maxDrawdown,
    peakDate: best.troughIdx < 0 ? null : best.peakIdx < 0 ? "start" : curve[best.peakIdx].date,
    troughDate: best.troughIdx < 0 ? null : curve[best.troughIdx].date,
    peakToTroughSessions: best.troughIdx < 0 ? 0 : best.troughIdx - best.peakIdx,
    longestUnderwaterSessions: longest,
    recovered,
  };
}

/** Annualised Sharpe of daily returns (252 sessions, zero rate), NaN with fewer than two. */
export function annualisedSharpe(r: readonly number[]): number {
  if (r.length < 2) return NaN;
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return v > 0 ? (m / Math.sqrt(v)) * Math.sqrt(252) : NaN;
}

export function simulateFundedPortfolio(trades: readonly FundedTrade[], options: FundedOptions): FundedResult {
  const o = { ...DEFAULTS, ...options };
  for (const k of ["startEquity", "riskFraction", "maxOpenRiskFraction", "maxPositionFraction", "maxGrossExposure"] as const) {
    if (!(Number.isFinite(o[k]) && o[k] > 0)) throw new Error(`simulateFundedPortfolio: ${k} must be a positive number`);
  }
  if (!(Number.isFinite(o.costPerShare) && o.costPerShare >= 0)) throw new Error("simulateFundedPortfolio: costPerShare must be >= 0");
  if (!(Number.isInteger(o.maxConcurrent) && o.maxConcurrent >= 1)) throw new Error("simulateFundedPortfolio: maxConcurrent must be a whole number >= 1");
  const half = o.costPerShare / 2;

  const skipped: Record<FundedSkip, number> = { "invalid levels": 0, "no session": 0, "concurrency cap": 0, "unit over budget": 0, "open risk cap": 0, "insufficient cash": 0, "gross exposure cap": 0, "already open": 0 };
  const campaigns: CampaignTrace[] = [];
  const traceOf = (t: FundedTrade): CampaignTrace => ({ symbol: t.symbol, openedAt: t.openedAt, accepted: false, reason: null, firstShares: 0, addsFilled: 0, addsTrimmed: 0, addsSkipped: 0, pnl: 0, open: false });
  const skip = (tr: CampaignTrace, why: FundedSkip) => {
    tr.reason = why;
    skipped[why]++;
  };

  // Closes by symbol and the session grid (every date any supplied series trades).
  const closeBy = new Map<string, Map<string, number>>();
  const grid = new Set<string>();
  for (const [sym, bars] of o.closes) {
    const m = new Map<string, number>();
    for (const b of bars) {
      if (Number.isFinite(b.c) && b.c > 0) {
        m.set(dayOf(b.t), b.c);
        grid.add(dayOf(b.t));
      }
    }
    closeBy.set(sym, m);
  }

  const valid: FundedTrade[] = [];
  for (const t of trades) {
    const tr = traceOf(t);
    campaigns.push(tr);
    const fills = t.lotFills ?? [{ fraction: 1, fill: t.entry, at: t.openedAt }];
    const ok =
      Number.isFinite(t.entry) && Number.isFinite(t.stop) && t.entry > 0 && t.stop > 0 && t.entry !== t.stop &&
      fills.length > 0 && fills.every((f) => Number.isFinite(f.fill) && f.fill > 0 && Number.isFinite(f.fraction) && f.fraction > 0) &&
      (t.closedAt === null || (Number.isFinite(t.exitPrice ?? NaN) && (t.exitPrice as number) > 0));
    if (!ok) skip(tr, "invalid levels");
    else if (!grid.has(dayOf(t.openedAt)) || !closeBy.has(t.symbol)) skip(tr, "no session");
    else valid.push(t);
  }
  const traceFor = new Map<FundedTrade, CampaignTrace>();
  trades.forEach((t, k) => traceFor.set(t, campaigns[k]));

  const assumptions = [
    `${FUNDED_PORTFOLIO_VERSION}: cash-funded lots, no borrowing, no financing, no interest on cash, no dividends credited.`,
    `First lot risk ${(o.riskFraction * 100).toFixed(3)}% of prior-close equity, open planned risk at most ${(o.maxOpenRiskFraction * 100).toFixed(1)}%, at most ${o.maxConcurrent} open, first lot at most ${(o.maxPositionFraction * 100).toFixed(1)}% of equity, gross notional at most ${o.maxGrossExposure}× equity.`,
    "Sizing uses equity at the prior session's close. Within a session: first lots, then adds, then exits, then the close mark; same-session exits fund nothing that session.",
    "Adds buy their fraction of the first lot's shares, trimmed to cash on hand and the gross cap; the exit path stays the replay's (which assumed every add filled).",
    `Same-session entries in ${o.order === "ledger" || o.order === undefined ? "ledger order" : `a seeded shuffle (seed ${(o.order as { seed: number }).seed})`}. One campaign a symbol at a time.`,
    `Cost $${o.costPerShare.toFixed(3)} a share round trip, half on each side, on every executed share.`,
    "Open campaigns at the data's end are marked at the last close, not liquidated.",
  ];

  const sessions = [...grid].filter((d) => d >= (valid.length ? valid.reduce((m, t) => (dayOf(t.openedAt) < m ? dayOf(t.openedAt) : m), "9999") : "9999")).sort();
  const opensBy = new Map<string, FundedTrade[]>();
  for (const t of valid) {
    const d = dayOf(t.openedAt);
    if (!opensBy.has(d)) opensBy.set(d, []);
    opensBy.get(d)!.push(t);
  }
  const rand = o.order && o.order !== "ledger" ? seededRandom(o.order.seed) : null;

  let cash = o.startEquity;
  let totalCosts = 0;
  let staleMarks = 0;
  const open: Position[] = [];
  const curve: FundedPoint[] = [];
  let priorEquity = o.startEquity;
  let addsFilled = 0;
  let addsTrimmed = 0;
  let addsSkipped = 0;
  let reconciliationError = 0;
  let realised = 0;
  let taken = 0;

  const positionValue = () => {
    let longV = 0;
    let shortL = 0;
    for (const p of open) {
      const sh = p.lots.reduce((s, l) => s + l.shares, 0);
      if (p.dir === 1) longV += sh * p.mark;
      else shortL += sh * p.mark;
    }
    return { longV, shortL };
  };
  const grossNow = () => {
    const { longV, shortL } = positionValue();
    return longV + shortL;
  };
  /** Buy (long) or sell short `shares` at `price`; returns false without the cash. */
  const execute = (dir: 1 | -1, shares: number, price: number) => {
    const fee = shares * half;
    if (dir === 1) {
      const outlay = shares * price + fee;
      if (outlay > cash + 1e-9) return false;
      cash -= outlay;
    } else {
      if (fee > cash + 1e-9) return false;
      cash += shares * price - fee;
    }
    totalCosts += fee;
    return true;
  };
  const closePosition = (p: Position, price: number) => {
    const sh = p.lots.reduce((s, l) => s + l.shares, 0);
    const fee = sh * half;
    cash += p.dir === 1 ? sh * price - fee : -(sh * price) - fee;
    totalCosts += fee;
    p.trace.pnl = p.lots.reduce((s, l) => s + p.dir * (price - l.fill) * l.shares, 0) - (sh * half + sh * half);
    realised += p.trace.pnl;
  };

  for (const session of sessions) {
    // 1. First lots, sized on the prior close's equity, funded from cash on hand.
    const todays = [...(opensBy.get(session) ?? [])];
    if (rand) {
      for (let k = todays.length - 1; k > 0; k--) {
        const j = Math.floor(rand() * (k + 1));
        [todays[k], todays[j]] = [todays[j], todays[k]];
      }
    }
    for (const t of todays) {
      const tr = traceFor.get(t)!;
      if (open.some((p) => p.trade.symbol === t.symbol)) {
        skip(tr, "already open");
        continue;
      }
      if (open.length >= o.maxConcurrent) {
        skip(tr, "concurrency cap");
        continue;
      }
      const fills = t.lotFills ?? [{ fraction: 1, fill: t.entry, at: t.openedAt }];
      const first = fills[0];
      const perShare = Math.abs(t.entry - t.stop);
      const shares = Math.min(Math.floor((priorEquity * o.riskFraction) / perShare), Math.floor((priorEquity * o.maxPositionFraction) / first.fill));
      if (!(shares >= 1)) {
        skip(tr, "unit over budget");
        continue;
      }
      const risk = shares * perShare;
      if (open.reduce((s, p) => s + p.riskDollars, 0) + risk > priorEquity * o.maxOpenRiskFraction + 1e-9) {
        skip(tr, "open risk cap");
        continue;
      }
      if (grossNow() + shares * first.fill > priorEquity * o.maxGrossExposure + 1e-9) {
        skip(tr, "gross exposure cap");
        continue;
      }
      const dir = signOf(t);
      if (!execute(dir, shares, first.fill)) {
        skip(tr, "insufficient cash");
        continue;
      }
      tr.accepted = true;
      tr.firstShares = shares;
      taken++;
      open.push({ trade: t, trace: tr, dir, firstShares: shares, lots: [{ shares, fill: first.fill }], riskDollars: risk, mark: first.fill, pendingAdds: fills.slice(1), closeDay: t.closedAt ? dayOf(t.closedAt) : null });
    }

    // 2. Adds due this session, funded from cash on hand and within the gross cap.
    for (const p of open) {
      while (p.pendingAdds.length && dayOf(p.pendingAdds[0].at) <= session) {
        const add = p.pendingAdds.shift()!;
        const want = Math.floor(p.firstShares * add.fraction);
        if (want < 1) {
          p.trace.addsSkipped++;
          addsSkipped++;
          continue;
        }
        const room = Math.max(0, priorEquity * o.maxGrossExposure - grossNow());
        const byCash = p.dir === 1 ? Math.floor(cash / (add.fill + half)) : Math.floor(cash / half);
        const sh = Math.min(want, Math.floor(room / add.fill), byCash);
        if (sh < 1) {
          p.trace.addsSkipped++;
          addsSkipped++;
          continue;
        }
        execute(p.dir, sh, add.fill);
        p.lots.push({ shares: sh, fill: add.fill });
        if (sh < want) {
          p.trace.addsTrimmed++;
          addsTrimmed++;
        } else {
          p.trace.addsFilled++;
          addsFilled++;
        }
      }
    }

    // 3. Exits on this session, at the replay's exit price.
    for (let k = open.length - 1; k >= 0; k--) {
      const p = open[k];
      if (p.closeDay !== null && p.closeDay <= session) {
        // Adds dated after the exit can't happen; drop them uncounted as fills.
        p.trace.addsSkipped += p.pendingAdds.length;
        addsSkipped += p.pendingAdds.length;
        closePosition(p, p.trade.exitPrice as number);
        open.splice(k, 1);
      }
    }

    // 4. Mark every open lot at today's close.
    for (const p of open) {
      const c = closeBy.get(p.trade.symbol)?.get(session);
      if (c === undefined) staleMarks++;
      else p.mark = c;
    }
    const { longV, shortL } = positionValue();
    const equity = cash + longV - shortL;
    // Independent of the cash ledger: start + closed campaigns' P&L + open lots' P&L at the mark − their entry costs.
    const unrealised = open.reduce((s, p) => s + p.lots.reduce((u, l) => u + p.dir * (p.mark - l.fill) * l.shares - l.shares * half, 0), 0);
    reconciliationError = Math.max(reconciliationError, Math.abs(equity - (o.startEquity + realised + unrealised)));
    curve.push({ date: session, equity, cash, longValue: longV, shortLiability: shortL, gross: longV + shortL, openCampaigns: open.length, openRisk: open.reduce((s, p) => s + p.riskDollars, 0) });
    priorEquity = equity;
  }

  for (const p of open) {
    p.trace.open = true;
    const sh = p.lots.reduce((s, l) => s + l.shares, 0);
    p.trace.pnl = p.lots.reduce((s, l) => s + p.dir * (p.mark - l.fill) * l.shares, 0) - sh * half;
  }

  const endEquity = curve.length ? curve[curve.length - 1].equity : o.startEquity;
  const dailyReturns: number[] = [];
  let prev = o.startEquity;
  for (const pt of curve) {
    dailyReturns.push(prev > 0 ? pt.equity / prev - 1 : 0);
    prev = pt.equity;
  }
  const years = curve.length > 1 ? (Date.parse(curve[curve.length - 1].date) - Date.parse(curve[0].date)) / (365.25 * 86_400_000) : 0;
  const grossRatios = curve.map((pt) => (pt.equity > 0 ? pt.gross / pt.equity : NaN)).filter(Number.isFinite);
  return {
    version: FUNDED_PORTFOLIO_VERSION,
    startEquity: o.startEquity,
    endEquity,
    curve,
    dailyReturns,
    campaigns,
    taken,
    skipped,
    addsFilled,
    addsTrimmed,
    addsSkipped,
    staleMarks,
    totalCosts,
    totalReturn: endEquity / o.startEquity - 1,
    cagr: years > 0 && endEquity > 0 ? Math.pow(endEquity / o.startEquity, 1 / years) - 1 : NaN,
    sharpe: annualisedSharpe(dailyReturns),
    drawdown: drawdownStats(curve, o.startEquity),
    maxGross: grossRatios.length ? Math.max(...grossRatios) : 0,
    averageGross: grossRatios.length ? grossRatios.reduce((s, x) => s + x, 0) / grossRatios.length : 0,
    exposure: curve.length ? curve.filter((pt) => pt.openCampaigns > 0).length / curve.length : 0,
    reconciliationError,
    assumptions,
  };
}
