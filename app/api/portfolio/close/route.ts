/**
 * GSPS — /api/portfolio/close
 * POST: manually flatten an open position at market.
 *
 * This is an alias for `/api/positions/close`, not a second implementation —
 * both paths run the same handler, which simulates the closing fill
 * synchronously and writes the trade log itself (see
 * lib/brokers/simulator.ts).
 */

export { POST } from "@/app/api/positions/close/route";
