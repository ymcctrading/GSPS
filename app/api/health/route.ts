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
 *          "commit": "d2e65d0…",      // full commit id of this build, or null
 *          "builtAt": "…",            // when this build ran (UTC), or null
 *          "timestamp": "…"
 *        }
 *
 * `commit` and `builtAt` (lib/ops/buildInfo.ts) let a deploy check confirm the
 * serving build is the one just merged to `main`, not an older one.
 *
 * `feedMode` comes from the same provider seam the rest of the app uses
 * (`getMarketDataProvider().isLive`), so it can't drift from the data the
 * charts and scanner actually receive. Route Handlers aren't cached by default
 * in Next 16; `no-store` keeps any CDN/proxy from serving a stale mode.
 */

import { NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/data/provider";
import { feedModeOf } from "@/lib/data/feed-mode";
import { readBuildInfo } from "@/lib/ops/buildInfo";

export async function GET() {
  const provider = getMarketDataProvider();
  const feedMode = feedModeOf(provider);
  // Read by name, never destructured: next.config.ts `env` replaces each
  // `process.env.NAME` with its build-time value.
  const build = readBuildInfo({
    commit: process.env.GSPS_BUILD_COMMIT,
    builtAt: process.env.GSPS_BUILD_TIME,
  });

  return NextResponse.json(
    {
      status: "ok",
      feedMode,
      live: feedMode === "live",
      provider: provider.name,
      commit: build.commit,
      builtAt: build.builtAt,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
