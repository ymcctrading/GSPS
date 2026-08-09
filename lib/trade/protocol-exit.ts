/**
 * The protocol's exit plan — how a position bought at the recommended levels
 * gets out of the trade without the user watching it.
 * -----------------------------------------------------------------------------
 * Until now, "attach protocol levels" meant one Alpaca bracket: the whole
 * position left at TP1, or the whole position left at the stop. That is not the
 * protocol. The protocol scales out, lets a remainder run, and tightens what it
 * is willing to give back as the trade proves itself.
 *
 * Four rules, in the order they bind:
 *
 *   1. Stop hit          → the user is completely out.
 *   2. TP1 hit           → 60% of the position is out.
 *   3. Master target hit → half of what is left is out (20% of the original).
 *      The last 20% keeps running until the user closes it, or until price
 *      pushes through the master target and then falls back through it, which
 *      closes the remainder.
 *   4. Once TP1 has been reached the stop can never sit below the entry again,
 *      and from there it trails the best price seen — so the trade cannot turn
 *      a proven winner back into a loss.
 *
 * Rules 1–3 are placed at the broker as resting orders (see `planProtocolExit`),
 * because a resting order works while the app is closed and a poll loop does
 * not. Rule 4 and the reversal half of rule 3 are *state-dependent* — they can
 * only be known once the trade has been somewhere — so they are expressed as a
 * single protective stop price that `planStopAdjustment` recomputes as the
 * trade moves, and that the exit manager pushes to the broker.
 *
 * Everything here is pure. The broker calls live in `lib/trade/exit-manager.ts`.
 */

import { snapToTick, tickSizeFor } from "@/lib/trade/tick-size";

/** Share of the position that leaves at TP1. */
export const SCALE_OUT_PCT = 0.6;

/** Share of *what remains after TP1* that leaves at the master target. */
export const MASTER_SCALE_OUT_PCT = 0.5;

export interface ProtocolLevels {
  stopLoss: number;
  takeProfit1: number;
  /** The protocol's second target. Null when the signal didn't publish one. */
  masterProfit?: number | null;
}

/**
 * Which job a resting order is doing. Mirrored onto `orders.protocol_leg` so a
 * row in the Portfolio can say why it exists rather than looking like three
 * duplicate orders for one symbol.
 */
export type TrancheKey = "scale_out" | "master" | "runner" | "single";

export interface Tranche {
  key: TrancheKey;
  qty: number;
  /** Resting limit price for this tranche's exit. Null = no profit leg. */
  takeProfit: number | null;
  stopLoss: number;
  /** One sentence for the ticket and the order row. */
  label: string;
}

export interface ExitPlan {
  tranches: Tranche[];
  /**
   * False when the quantity is too small to divide — a single share can only
   * be all-in or all-out, and pretending otherwise would round 60% up to 100%
   * without saying so.
   */
  splittable: boolean;
  scaleOutQty: number;
  masterQty: number;
  runnerQty: number;
  /** The share that actually leaves at TP1, after whole-share rounding. */
  scaleOutPct: number;
  /** What will happen, in one sentence, using the real quantities. */
  summary: string;
}

/**
 * Split a position into the tranches the protocol exits it in.
 *
 * Rounding favours the last tranche: `master` takes the floor of half the
 * remainder so the runner is never starved to zero by a rounding step. A
 * position of three shares therefore exits 2 / 0 / 1 rather than 2 / 1 / 0 —
 * the master target loses its leg before the trade loses its runner, because a
 * runner with nothing in it removes rules 3 and 4 entirely.
 */
export function planProtocolExit(qty: number, levels: ProtocolLevels): ExitPlan {
  const whole = Math.floor(qty);
  const mp = levels.masterProfit ?? null;

  if (!Number.isFinite(whole) || whole < 2) {
    return {
      tranches: [
        {
          key: "single",
          qty: Math.max(1, whole),
          takeProfit: levels.takeProfit1,
          stopLoss: levels.stopLoss,
          label: "Exits whole at TP1 or at the stop",
        },
      ],
      splittable: false,
      scaleOutQty: Math.max(1, whole),
      masterQty: 0,
      runnerQty: 0,
      scaleOutPct: 1,
      summary:
        "A single share can't be scaled out of, so this order exits whole — at TP1 or at the stop, whichever comes first. Buy two or more to trade the protocol's staged exit.",
    };
  }

  // Clamped to leave at least one share behind: a 60% scale-out that rounds to
  // the whole position is a full exit wearing the wrong name.
  const scaleOutQty = Math.min(Math.max(Math.round(whole * SCALE_OUT_PCT), 1), whole - 1);
  const remainder = whole - scaleOutQty;
  const masterQty = mp == null ? 0 : Math.floor(remainder * MASTER_SCALE_OUT_PCT);
  const runnerQty = remainder - masterQty;

  const tranches: Tranche[] = [
    {
      key: "scale_out",
      qty: scaleOutQty,
      takeProfit: levels.takeProfit1,
      stopLoss: levels.stopLoss,
      label: "Takes profit at TP1",
    },
  ];
  if (masterQty > 0 && mp != null) {
    tranches.push({
      key: "master",
      qty: masterQty,
      takeProfit: mp,
      stopLoss: levels.stopLoss,
      label: "Takes profit at the master target",
    });
  }
  if (runnerQty > 0) {
    tranches.push({
      key: "runner",
      qty: runnerQty,
      takeProfit: null,
      stopLoss: levels.stopLoss,
      label: "Runs on, protected by the trailing stop",
    });
  }

  const pct = scaleOutQty / whole;
  return {
    tranches,
    splittable: true,
    scaleOutQty,
    masterQty,
    runnerQty,
    scaleOutPct: pct,
    summary: buildSummary(whole, scaleOutQty, masterQty, runnerQty, pct),
  };
}

function buildSummary(
  qty: number,
  scaleOut: number,
  master: number,
  runner: number,
  pct: number,
): string {
  const share = `${scaleOut} of ${qty} shares (${Math.round(pct * 100)}%)`;
  const parts = [`${share} exit at TP1`];
  if (master > 0) parts.push(`${master} at the master target`);
  if (runner > 0) parts.push(`${runner} run on behind a trailing stop`);
  return `${parts.join(", ")}. The stop covers all ${qty} shares, so a stop-out closes the trade completely.`;
}

/** ---- The protective stop ------------------------------------------------ */

export type StopReason =
  /** The protocol's own stop, unchanged — the trade hasn't proved anything yet. */
  | "protocol"
  /** TP1 was reached, so the stop can no longer sit below the entry. */
  | "break_even"
  /** Trailing the best price seen by one unit of the original risk. */
  | "trailing"
  /** Price pushed through the master target; a fall back through it exits. */
  | "master_reversal";

export interface ExitState {
  /** Only long entries are bracketed by this app, but the maths is sided. */
  side: "long" | "short";
  /** The price actually filled at, once the broker reports one. */
  entryPrice: number;
  levels: ProtocolLevels;
  /** Best price the trade has seen since entry, as far as we have sampled it. */
  highWater: number | null;
  /** The current mark. Null when no live price is available this pass. */
  lastPrice: number | null;
  /** The stop currently resting at the broker, if we've placed one. */
  appliedStop: number | null;
}

export type ExitAction =
  /** The resting stop is already where it should be. */
  | { kind: "none"; stop: number; reason: StopReason }
  /** Move every remaining tranche's stop to `stop`. */
  | { kind: "replace_stop"; stop: number; reason: StopReason; explanation: string }
  /**
   * The level that should be protecting the trade is already on the wrong side
   * of the market — the move happened between two samples. A resting stop
   * placed here would be rejected or would fill at an arbitrary price, so the
   * remainder is closed at market instead.
   */
  | { kind: "close_all"; stop: number; reason: StopReason; explanation: string };

/**
 * Where the stop should be, given everything the trade has done so far.
 *
 * One number rather than one rule per tranche: each rule only ever *raises* the
 * floor under a long (lowers the ceiling over a short), so the binding rule is
 * simply the tightest one, and applying the tightest to every remaining tranche
 * is what makes "a stop-out takes the user completely out" true.
 *
 * The stop never loosens. A high-water price that came from a sampled poll can
 * be stale, but it can never be too high, so a stop derived from it can only be
 * too loose — never tighter than the trade actually earned.
 */
export function planStopAdjustment(state: ExitState): ExitAction {
  const { levels, entryPrice, highWater, lastPrice, appliedStop } = state;
  const long = state.side === "long";
  const tick = tickSizeFor({ assetType: "EQUITY" }, entryPrice > 0 ? entryPrice : 1).size;

  // "Tighter" is upward for a long and downward for a short. Every comparison
  // below goes through this so the short case isn't a second code path.
  const isTighter = (a: number, b: number) => (long ? a > b : a < b);

  let stop = levels.stopLoss;
  let reason: StopReason = "protocol";
  const adopt = (candidate: number, next: StopReason) => {
    if (!Number.isFinite(candidate)) return;
    if (isTighter(candidate, stop)) {
      stop = candidate;
      reason = next;
    }
  };

  const best = highWater ?? lastPrice;
  const reached = (level: number | null | undefined): boolean => {
    if (level == null || best == null) return false;
    return long ? best >= level : best <= level;
  };

  // Rule 4. TP1 reached is the threshold: from there the entry is the floor,
  // and the trade trails by the risk it was originally willing to take.
  if (reached(levels.takeProfit1)) {
    adopt(entryPrice, "break_even");
    const riskUnit = long ? entryPrice - levels.stopLoss : levels.stopLoss - entryPrice;
    if (riskUnit > 0 && best != null) {
      adopt(long ? best - riskUnit : best + riskUnit, "trailing");
    }
  }

  // Rule 3's reversal half. Armed only once price has actually traded through
  // the master target; a tick inside it so the exit needs a genuine cross back,
  // not a touch on the way up.
  if (levels.masterProfit != null && reached(levels.masterProfit)) {
    adopt(long ? levels.masterProfit - tick : levels.masterProfit + tick, "master_reversal");
  }

  // Snap away from the market: a long's stop rounds down, a short's rounds up,
  // so tick rounding can never tighten a stop past where the rule put it.
  stop = snapToTick(stop, tick, long ? "down" : "up");

  // A stop that has already been placed is a promise. Ratchet only.
  if (appliedStop != null && isTighter(appliedStop, stop)) {
    return { kind: "none", stop: appliedStop, reason };
  }

  const unchanged = appliedStop != null && Math.abs(appliedStop - stop) < tick / 2;
  if (unchanged) return { kind: "none", stop, reason };

  const explanation = explain(reason, stop, long);

  // The market is already through the level we were about to rest an order at.
  if (lastPrice != null && (long ? lastPrice <= stop : lastPrice >= stop)) {
    return { kind: "close_all", stop, reason, explanation };
  }

  return { kind: "replace_stop", stop, reason, explanation };
}

function explain(reason: StopReason, stop: number, long: boolean): string {
  const usd = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  switch (reason) {
    case "break_even":
      return `TP1 was reached, so the stop moves to the entry (${usd(stop)}). The trade can no longer end at a loss.`;
    case "trailing":
      return `The stop trails the best price seen to ${usd(stop)}, locking in part of the move.`;
    case "master_reversal":
      return `Price traded through the master target, so the remainder now exits if it falls back ${long ? "below" : "above"} it (${usd(stop)}).`;
    case "protocol":
    default:
      return `The protocol stop rests at ${usd(stop)}.`;
  }
}

/** The best price seen, extended by the latest mark. */
export function extendHighWater(
  side: "long" | "short",
  highWater: number | null,
  price: number | null,
): number | null {
  if (price == null || !Number.isFinite(price)) return highWater;
  if (highWater == null) return price;
  return side === "long" ? Math.max(highWater, price) : Math.min(highWater, price);
}
