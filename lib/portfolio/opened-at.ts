/**
 * When a position was first opened.
 * -----------------------------------------------------------------------------
 * The broker's position list has no "opened at" field — it reports what is
 * held right now, not when it started being held. The answer has to be derived
 * from the execution history, and the derivation is the whole point: an order's
 * *placement* time is not when a position opened. A limit order can rest for
 * days before it fills, and the position began at the fill.
 *
 * The rule this module implements:
 *
 *   Walk every filled execution for a symbol oldest → newest, carrying a signed
 *   net quantity. Each time that net leaves zero, the position opened; record
 *   the timestamp of the fill that did it. Each time the net returns to zero,
 *   the position closed and the recorded timestamp is discarded. What survives
 *   the walk is the first fill of the run the account is currently in.
 *
 * That single rule gives all three behaviours the portfolio needs:
 *
 *   - Partial fills keep the original timestamp, because the second partial
 *     doesn't take the net through zero.
 *   - Scaling in keeps it, for the same reason.
 *   - Flattening and re-entering produces a new timestamp, because the net
 *     touched zero in between.
 *
 * A position that reverses (long 100 → sell 150 → short 50) passes *through*
 * zero in a single fill. That fill both closed the long and opened the short,
 * so it becomes the new opened-at rather than being ignored.
 *
 * When the answer isn't knowable
 * ------------------------------
 * The broker returns a bounded window of order history. If the fills we can see
 * don't reconstruct the quantity the broker says is held, the position started
 * before the window and its true open time is not in the data. This module says
 * so — `reason: "insufficient-history"` — rather than returning the oldest
 * timestamp it happens to have, which would silently report the wrong date for
 * every long-held position. The UI renders that as
 * "Unavailable — historical fill data missing".
 */

/** One filled execution, in the shape both the broker adapter and tests use. */
export interface Execution {
  symbol: string;
  side: "buy" | "sell";
  /** Quantity filled. Zero-fill executions are ignored. */
  filledQty: number;
  /** ISO timestamp of the fill — not of the order's placement. */
  filledAt: string;
}

export type OpenedAtReason = "derived" | "insufficient-history" | "no-executions";

export interface OpenedAt {
  /** ISO timestamp of the first fill of the current open run, or null. */
  openedAt: string | null;
  reason: OpenedAtReason;
}

const UNKNOWN = (reason: OpenedAtReason): OpenedAt => ({ openedAt: null, reason });

/**
 * Quantities are compared against a broker-reported figure, which can carry
 * fractional shares. A tolerance below any real fractional fill keeps float
 * addition from turning an exact match into a mismatch.
 */
const QTY_EPSILON = 1e-6;

/**
 * Derive the open timestamp for one symbol's currently-held position.
 *
 * `currentQty` is the broker's signed quantity for the position — positive
 * long, negative short. It is the check that the execution history is complete:
 * if replaying the fills doesn't land on it, the history is short and no
 * timestamp is returned.
 */
export function deriveOpenedAt(executions: Execution[], currentQty: number): OpenedAt {
  if (Math.abs(currentQty) < QTY_EPSILON) return UNKNOWN("no-executions");

  const fills = executions
    .filter((e) => e.filledQty > 0 && Boolean(e.filledAt) && !Number.isNaN(Date.parse(e.filledAt)))
    .sort(byFillTime);

  if (fills.length === 0) return UNKNOWN("no-executions");

  let net = 0;
  let openedAt: string | null = null;

  for (const fill of fills) {
    const signed = fill.side === "buy" ? fill.filledQty : -fill.filledQty;
    const before = net;
    net += signed;

    const wasFlat = Math.abs(before) < QTY_EPSILON;
    const isFlat = Math.abs(net) < QTY_EPSILON;
    // A sign change means this fill closed the old position and opened a new
    // one in the other direction, so it starts a new run even though the net
    // never rested at zero.
    const reversed = !wasFlat && !isFlat && Math.sign(before) !== Math.sign(net);

    if (isFlat) openedAt = null;
    else if (wasFlat || reversed) openedAt = fill.filledAt;
  }

  // The replay has to agree with what the broker says is held. It won't if the
  // history window cut off mid-position, and a timestamp derived from a partial
  // history is a wrong answer wearing the costume of a right one.
  if (Math.abs(net - currentQty) > QTY_EPSILON) return UNKNOWN("insufficient-history");
  if (!openedAt) return UNKNOWN("insufficient-history");

  return { openedAt, reason: "derived" };
}

/**
 * Derive open timestamps for every held symbol in one pass, so a portfolio
 * with twenty legs replays the execution history once rather than twenty times.
 *
 * Keys are upper-cased symbols — OCC contract symbols included, since each
 * contract is its own position at the broker.
 */
export function deriveOpenedAtBySymbol(
  executions: Execution[],
  currentQtyBySymbol: Map<string, number>,
): Map<string, OpenedAt> {
  const bySymbol = new Map<string, Execution[]>();
  for (const e of executions) {
    const key = e.symbol.toUpperCase();
    const list = bySymbol.get(key);
    if (list) list.push(e);
    else bySymbol.set(key, [e]);
  }

  const result = new Map<string, OpenedAt>();
  for (const [symbol, qty] of currentQtyBySymbol) {
    const key = symbol.toUpperCase();
    result.set(key, deriveOpenedAt(bySymbol.get(key) ?? [], qty));
  }
  return result;
}

/** Oldest first, with a stable tiebreak so equal timestamps replay identically. */
function byFillTime(a: Execution, b: Execution): number {
  const ta = Date.parse(a.filledAt);
  const tb = Date.parse(b.filledAt);
  if (ta !== tb) return ta - tb;
  // Same instant: apply the closing side first. Replaying a flatten-and-reopen
  // pair in the other order would leave the net looking like a scale-in and
  // keep the stale timestamp.
  if (a.side !== b.side) return a.side === "sell" ? -1 : 1;
  return 0;
}

export const OPENED_AT_UNAVAILABLE = "Unavailable — historical fill data missing";

/**
 * "Aug 7, 2026 · 10:14 AM ET".
 *
 * Rendered in Eastern time with the zone named, not in the viewer's local
 * zone: a trader reads a fill time against the session it happened in, and an
 * unlabelled "10:14 AM" on a machine set to London is a different moment of
 * the trading day. The label is explicit so there is nothing to infer.
 */
export function formatOpenedAt(iso: string | null): string {
  if (!iso) return OPENED_AT_UNAVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return OPENED_AT_UNAVAILABLE;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const time = `${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
  return `${get("month")} ${get("day")}, ${get("year")} · ${time} ET`;
}
