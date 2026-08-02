/**
 * GSPS — /api/health
 * A tiny liveness check that also reports which market-data feed is active, so
 * you can confirm the live/simulated switch flipped without eyeballing prices:
 *
 *   GET /api/health
 *     -> {
 *          "status": "ok",
 *          "feedMode": "simulated",   // "live" | "simulated"
 *          "live": false,
 *          "provider": "synthetic",   // the resolved provider's name
 *          "timestamp": "…"
 *        }
 *
 * `feedMode` comes from the same provider seam the rest of the app uses
 * (`getMarketDataProvider().isLive`), so it can't drift from the data the
 * charts and scanner actually receive. Route Handlers aren't cached by default
 * in Next 16; `no-store` keeps any CDN/proxy from serving a stale mode.
 */

import { NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/data/provider";
import { feedModeOf } from "@/lib/data/feed-mode";

export async function GET() {
  const provider = getMarketDataProvider();
  const feedMode = feedModeOf(provider);

  return NextResponse.json(
    {
      status: "ok",
      feedMode,
      live: feedMode === "live",
      provider: provider.name,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
