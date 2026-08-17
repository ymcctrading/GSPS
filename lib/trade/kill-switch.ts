/**
 * Global trading kill switch.
 * -----------------------------------------------------------------------------
 * One environment variable that stops every order-placing and position-closing
 * path in the app, without a code change and without pulling the Alpaca keys
 * (which would also break the read-only portfolio and scanner views).
 *
 *   TRADING_DISABLED=true
 *
 * Anything other than a case-insensitive "true" leaves trading enabled, so a
 * typo, an empty string, or an unset variable can never silently halt trading.
 * The failure direction is deliberate in both senses: you cannot disable
 * trading by accident, and you cannot re-enable it by accident either — the
 * value has to say `true` and nothing else.
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
 * The response body for a refused request, or null when trading is enabled.
 * Callers return it with a 503 — the condition is operational and temporary,
 * not a fault in the request.
 */
export function killSwitchRefusal(): KillSwitchRefusal | null {
  return tradingDisabled()
    ? { error: TRADING_DISABLED_MESSAGE, code: "trading_disabled" }
    : null;
}
