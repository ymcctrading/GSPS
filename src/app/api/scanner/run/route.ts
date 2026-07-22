/**
 * POST /api/scanner/run
 * Triggers the post-close mean-reversion scan. Intended to be called by an
 * external scheduler (Vercel Cron / GitHub Actions) at 16:15 ET on weekdays —
 * NOT by end users. See lib/scanner/cron.ts for the schedule.
 *
 * Optional body: { "tickers": ["SPY","AAPL", ...] } to override the universe.
 */
import { NextRequest, NextResponse } from "next/server";
import { runScanAndCache } from "@/lib/scanner/runScan";
import { DEFAULT_WATCHLIST } from "@/config/watchlist";

export const dynamic = "force-dynamic";
// Allow the full universe scan to run to completion on Vercel.
export const maxDuration = 60;

/**
 * GET handler: this is what Vercel Cron calls (cron invocations are GET).
 * Runs the default-universe scan.
 */
export async function GET() {
  try {
    const payload = await runScanAndCache(DEFAULT_WATCHLIST);
    return NextResponse.json({ ok: true, payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let universe = DEFAULT_WATCHLIST;
  try {
    const body = await req.json();
    if (Array.isArray(body?.tickers) && body.tickers.length) {
      universe = body.tickers.map((t: unknown) => String(t).toUpperCase());
    }
  } catch {
    // No/invalid body — use the default universe.
  }

  try {
    const payload = await runScanAndCache(universe);
    return NextResponse.json({ ok: true, payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
