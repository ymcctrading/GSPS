/**
 * GSPS v2.0 — /api/health route (Next.js App Router)
 * -----------------------------------------------------
 * A tiny liveness check that also reports which market-data feed is active,
 * so you can confirm the live/simulated switch flipped without eyeballing
 * prices:
 *
 *   GET /api/health
 *     -> {
 *          "status": "ok",
 *          "feedMode": "simulated",
 *          "live": false,
 *          "credentials": { "wsUrl": false, "apiKey": false },
 *          "timestamp": "…"
 *        }
 *
 * `feedMode` is "live" only when BOTH MARKET_DATA_WS_URL and
 * MARKET_DATA_API_KEY are set; otherwise the engine auto-falls back to the
 * high-fidelity simulated feed and this reports "simulated". `credentials`
 * shows which half of the switch is present (booleans only — never the
 * secret values) so a "simulated" result is self-diagnosing.
 *
 * Integration note: this file belongs at `app/api/health/route.ts` alongside
 * `route.ts` (/api/scan) and `batch-route.ts` (/api/batch-scan). It shares the
 * SAME resolution logic as MarketDataIngestor via `activeFeedMode()`, so the
 * check can never drift from what the ingestor actually does.
 */

import { NextResponse } from "next/server";
import { activeFeedMode } from "@/engine/market-data/marketDataIngestor";

// Read env at request time (not build time) so the check reflects the current
// switch, and never let a proxy/CDN cache a stale mode.
export const dynamic = "force-dynamic";

export async function GET() {
  const feedMode = activeFeedMode();

  return NextResponse.json(
    {
      status: "ok",
      feedMode,
      live: feedMode === "live",
      credentials: {
        wsUrl: Boolean(process.env.MARKET_DATA_WS_URL),
        apiKey: Boolean(process.env.MARKET_DATA_API_KEY),
      },
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
