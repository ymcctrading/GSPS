/**
 * GSPS — /api/market-scan
 * Runs the daily market-wide scan (up to 15 bullish + 15 bearish reversions,
 * plus a small guaranteed allotment of momentum continuations scouted on every
 * run — see lib/marketScan.ts) and persists results to Supabase. Invoked by
 * Vercel Cron (Authorization: Bearer CRON_SECRET) or manually with the same
 * header. A side short of 15 is topped up with continuations rather than
 * padded.
 */

import { NextRequest, NextResponse } from "next/server";
import { runMarketScan } from "@/lib/marketScan";
import { buildScanRows, describeDbError, persistDailyScans } from "@/lib/scan/publish";
import { persistCoarseTelemetry } from "@/lib/scan/telemetry";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 300;

async function runAndPersist() {
  const output = await runMarketScan();

  // Persist (best-effort — the scan output is returned either way)
  let persisted = false;
  let persistedCount = 0;
  let persistError: string | null = null;
  try {
    const rows = [
      ...buildScanRows(output.scanDate, "bullish", output.bullish),
      ...buildScanRows(output.scanDate, "bearish", output.bearish),
    ];
    const outcome = await persistDailyScans(createServiceClient(), output.scanDate, rows);
    persisted = outcome.persisted;
    persistedCount = outcome.count;
    persistError = outcome.error;
  } catch (err) {
    // A throw here is the client itself failing to build — a missing service
    // role key, most likely — rather than the write being rejected.
    persistError = describeDbError(err);
  }
  if (persistError) {
    // `scanErrors` distinguishes "the feed failed for most/all of the
    // shortlist" from "everything scanned cleanly and just didn't arm" —
    // the two produce the identical publish-side message otherwise.
    console.error(
      `market-scan: ${output.scanDate} not saved — ${persistError} ` +
        `[shortlisted=${output.shortlisted} scanErrors=${output.scanErrors}]`,
    );
  }

  // Coarse-gate calibration data — best-effort, and deliberately outside the
  // try/catch above so a telemetry write failure can never be mistaken for
  // the actual scan results failing to save.
  try {
    await persistCoarseTelemetry(createServiceClient(), output.coarseTelemetry);
  } catch (err) {
    console.warn(`market-scan: coarse telemetry not saved — ${describeDbError(err)}`);
  }

  return NextResponse.json({
    scanDate: output.scanDate,
    universeSize: output.universeSize,
    shortlisted: output.shortlisted,
    scanErrors: output.scanErrors,
    continuationFills: output.continuationFills,
    bullish: output.bullish.map((r) => ({ symbol: r.symbol, score: r.decision.score, state: r.decision.outputState })),
    bearish: output.bearish.map((r) => ({ symbol: r.symbol, score: r.decision.score, state: r.decision.outputState })),
    persisted,
    persistedCount,
    persistError,
  });
}

/**
 * Cron entry point — authorized with the shared CRON_SECRET.
 *
 * Vercel only attaches the `Authorization: Bearer` header when CRON_SECRET is
 * set on the project, so an unset secret doesn't leave the endpoint open, it
 * makes the scheduled scan 401 silently. The response says which of the two it
 * is; the dashboard sitting on a stale day is the symptom either way.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("market-scan: CRON_SECRET is not set — the scheduled scan cannot run");
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on this deployment" },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runAndPersist();
}

/** Manual refresh — any signed-in user can rebuild the market scan on demand. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return runAndPersist();
}
