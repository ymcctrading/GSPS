/**
 * Protocol target tracking — which of TP1 / MP / SL a trade actually reached.
 *
 * A hit recorded in the database always wins: it's the moment the level was
 * crossed. When nothing is recorded (the common case for a position still
 * open), the level is evaluated against the current price, which tells the user
 * where the trade stands right now without pretending it's a settled outcome.
 */

export type TargetKey = "tp1" | "mp" | "sl";

export type TargetState =
  /** Recorded as crossed in the ledger. */
  | "hit"
  /** Currently through the level, not yet recorded. */
  | "reached"
  /** Level exists, price hasn't got there. */
  | "pending"
  /** No level was set on this order. */
  | "none";

export interface TargetLevels {
  tp1: number | null;
  mp: number | null;
  sl: number | null;
}

export interface RecordedHits {
  tp1At?: string | null;
  mpAt?: string | null;
  slAt?: string | null;
}

export type TargetStatus = Record<TargetKey, TargetState>;

/**
 * A long trade reaches its profit targets from below and its stop from above;
 * a short is the mirror image. `price` is the current mark — pass null when
 * there's no live price and unrecorded levels stay `pending`.
 */
export function evaluateTargets(
  side: "buy" | "sell",
  levels: TargetLevels,
  price: number | null,
  recorded: RecordedHits = {},
): TargetStatus {
  const long = side === "buy";

  const state = (level: number | null, at: string | null | undefined, kind: TargetKey): TargetState => {
    if (at) return "hit";
    if (level == null) return "none";
    if (price == null) return "pending";
    // Profit targets sit beyond entry in the trade's direction; the stop sits
    // behind it. Both flip when the trade is short.
    const throughTarget = long ? price >= level : price <= level;
    const throughStop = long ? price <= level : price >= level;
    const through = kind === "sl" ? throughStop : throughTarget;
    return through ? "reached" : "pending";
  };

  return {
    tp1: state(levels.tp1, recorded.tp1At, "tp1"),
    mp: state(levels.mp, recorded.mpAt, "mp"),
    sl: state(levels.sl, recorded.slAt, "sl"),
  };
}

/** True when the level was reached, whether recorded or live. */
export function isReached(state: TargetState): boolean {
  return state === "hit" || state === "reached";
}
