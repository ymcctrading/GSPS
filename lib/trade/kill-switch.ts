/**
 * Global trading kill switch.
 * -----------------------------------------------------------------------------
 * One environment variable that stops every path that opens or grows a
 * position, without a code change and without pulling the Alpaca keys (which
 * would also break the read-only portfolio and scanner views).
 *
 *   TRADING_DISABLED=true
 *
 * Anything other than a case-insensitive "true" leaves trading enabled, so a
 * typo, an empty string, or an unset variable can never silently halt trading.
 * The failure direction is deliberate in both senses: you cannot disable
 * trading by accident, and you cannot re-enable it by accident either — the
 * value has to say `true` and nothing else.
 *
 * Protective actions are exempt by design, not by accident: `/api/positions/close`
 * never calls `killSwitchRefusal` at all, and `placeSimulatedOrder` skips it
 * for a sell that closes/reduces an existing long or a buy that covers an
 * existing short — see the callers for the exact carve-out. Nothing today
 * requires this — every order this switch guards is a paper trade, and the
 * product constitution's "exits/reductions always available" principle
 * governs live trading, not the simulator. The exemption is here anyway,
 * ahead of live trading landing, so the switch doesn't need re-auditing once
 * a real halt actually has to leave a way out for existing positions.
 *
 * Per-user kill switches need a column and a policy, and they land with the
 * per-user connection work. This is the global one, which is the half that
 * matters during an incident.
 */

/** True when trading is halted for everyone by environment configuration. */
export function tradingDisabled(): boolean {
  return (process.env.TRADING_DISABLED ?? "").trim().toLowerCase() === "true";
}

/** The sentence shown to a user whose order was refused by the kill switch. */
export const TRADING_DISABLED_MESSAGE =
  "Trading is temporarily disabled on this deployment. Your existing positions and resting orders at the broker are untouched.";

export interface KillSwitchRefusal {
  error: string;
  code: "trading_disabled";
}

/**
 * True when an order only moves an existing position toward flat — a sell
 * against a long, or a buy against a short. Such an order is a protective
 * action, exempt from the kill switch on the same reasoning live trading will
 * eventually require: exits, reductions, and profit-taking should stay
 * available regardless of what halted new entries. An order with no existing
 * position behind it, or one on the same side as the position it would grow,
 * is not protective and stays subject to the halt.
 */
export function isProtectiveOrder(
  existingPositionSide: "long" | "short" | null,
  orderSide: "buy" | "sell",
): boolean {
  return (
    (existingPositionSide === "long" && orderSide === "sell") ||
    (existingPositionSide === "short" && orderSide === "buy")
  );
}

/**
 * The response body for a refused request, or null when trading is enabled.
 * Callers return it with a 503 — the condition is operational and temporary,
 * not a fault in the request.
 */
export function killSwitchRefusal(): KillSwitchRefusal | null {
  return tradingDisabled()
    ? { error: TRADING_DISABLED_MESSAGE, code: "trading_disabled" }
    : null;
}
