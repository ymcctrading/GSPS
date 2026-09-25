/**
 * Bounds enforced at parse time for every custom Strategy Mode script.
 *
 * There is no loop, recursion, or unbounded construct anywhere in the DSL
 * grammar (`parser.ts`) — a script is a pure expression tree, walked once per
 * evaluated bar index. That alone rules out an infinite loop. What is still
 * bounded here is the *size* of that tree and of the indicator computations
 * it can request, so a single script can't make one evaluation call
 * disproportionately expensive (a 500-period SMA times a 300-node tree is
 * still O(bars) work, not O(bars^2) or worse) or blow the parser's own call
 * stack on pathological nesting.
 */

/** Source text length, in characters. Generous for a script that mirrors one
 * of the nine built-in modes (all well under 500 chars written this way)
 * while still bounding parse cost and storage size. */
export const MAX_SOURCE_LENGTH = 4000;

/** Total AST node count across both rule blocks combined. */
export const MAX_AST_NODES = 300;

/** Maximum expression nesting depth (function args, parens, binary/boolean
 * chains). Bounds recursive-descent parse/interpret stack depth. */
export const MAX_EXPR_DEPTH = 20;

/** Maximum lookback offset (`series[N]`) or indicator period/lookback
 * parameter. 500 bars is already far beyond what any of the nine built-in
 * modes use (the largest is a 20-bar Donchian/Bollinger lookback). */
export const MAX_PERIOD_OR_OFFSET = 500;

/** Minimum indicator period/lookback parameter — 1 for anything expressed as
 * a count of bars, 0.0001 for the two float PSAR parameters. */
export const MIN_PERIOD = 1;
