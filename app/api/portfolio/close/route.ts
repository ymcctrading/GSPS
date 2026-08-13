/**
 * GSPS — /api/portfolio/close
 * POST: manually flatten an open position at market.
 *
 * This is an alias for `/api/positions/close`, not a second implementation.
 * Its own header used to promise that "the next portfolio poll's reconciliation
 * pass records the close into `positions` and `trade_logs`" — a pass that was
 * never wired to anything, so a market close through here recorded nothing at
 * all and the promise quietly went unmet. Rather than restate the claim
 * correctly in two places, both paths now run the same handler: it reads the
 * position before liquidating it, writes the trade log with the exit left
 * pending, and lets `settlePendingTradeLogs` fill in the price the broker
 * actually gave.
 */

export { POST } from "@/app/api/positions/close/route";
