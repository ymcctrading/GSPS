/**
 * GSPS — /api/market-scan
 * Runs the daily market-wide scan (up to `perSide` bullish + `perSide` bearish
 * reversions, plus a small guaranteed allotment of momentum continuations
 * scouted on every run — see lib/marketScan.ts) and persists results to
 * Supabase. Invoked by Vercel Cron (Authorization: Bearer CRON_SECRET) or
 * manually with the same header. A side short of `perSide` is topped up with
 * continuations rather than padded.
 */

import { NextRequest, NextResponse } from "next/server";
import { FULL_UNIVERSE_TOP, runMarketScan } from "@/lib/marketScan";
import { buildScanRows, describeDbError, persistDailyScans } from "@/lib/scan/publish";
import { persistCoarseTelemetry } from "@/lib/scan/telemetry";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUniversePolicy } from "@/lib/universe/policy";
import { etDateKey } from "@/lib/market/session";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { resolveDiscoveryAndTrackingSymbols } from "@/lib/scan/universe-rotation";

/**
 * How recently the autonomous full-universe scan (see
 * .github/workflows/full-market-scan.yml, every 15 minutes through the
 * session; `FULL_UNIVERSE_TOP` in lib/marketScan.ts for the current symbol
 * count) has to have last written today's rows for a manual "Refresh scan"
 * click to reuse them instead of re-running the full scan itself.
 *
 * This is the fix for the scan timing out under the dashboard's "Refresh
 * scan" button: the button was always re-running the entire full-universe
 * scan synchronously in front of the user, racing the same 60s Hobby
 * ceiling `FULL_UNIVERSE_TOP`'s own doc comment records a live 700-symbol
 * run actually losing. Since the autonomous scan is now continuously
 * refreshing `daily_scans` throughout the day, a manual click that lands
 * moments after one of those runs has nothing new to compute — the stored
 * rows already are "up to the second." A click that lands more than this
 * window past the last write still gets a genuinely fresh scan.
 */
const REUSE_RECENT_SCAN_MS = 60_000;

// The Vercel Hobby plan hard-caps function execution at 60s regardless of
// what this says — a higher value here is silently unenforced, not granted.
// This route calls runMarketScan with FULL_UNIVERSE_TOP (lib/marketScan.ts),
// sized to finish well inside this ceiling per that constant's own budget
// comment — re-check wall-clock time before raising it further.
export const maxDuration = 60;

/**
 * Discovery + tracking symbols this run must include, ahead of the actives
 * screener — see `lib/scan/universe-rotation.ts`'s own header for the full
 * three-question design basis (Gann: none claimed; Dewey: phase-resumption
 * applied as an engineering property, not a market claim; Hermetic: Rhythm —
 * a returning cycle, not a linear drain-and-halt). Best-effort: a read
 * failure here degrades to "this run relies on the actives screener and
 * curated fallback alone," same as `resolveUniverse` already does when the
 * screener itself fails, rather than aborting the scan over it.
 *
 * NOT YET LIVE-TIMING-VERIFIED. `DISCOVERY_CHUNK_SIZE`
 * (lib/scan/universe-rotation.ts) is explicitly provisional — sharing this
 * route's 60s budget with a tracking-pass re-scan of every already-published
 * symbol is new cost `FULL_UNIVERSE_TOP`'s own measured timing never
 * accounted for. Confirm against a live `mark()`-breadcrumb run before
 * treating this as safe at the current chunk size, the same discipline
 * `FULL_UNIVERSE_TOP` itself went through after the 2026-09-22 timeout.
 */
async function resolveExtraSymbols(scanDate: string): Promise<string[]> {
  try {
    return await resolveDiscoveryAndTrackingSymbols(createServiceClient(), scanDate, LARGE_CAP_UNIVERSE);
  } catch (err) {
    console.warn(`market-scan: discovery/tracking symbols not resolved — ${describeDbError(err)}`);
    return [];
  }
}

async function runAndPersist() {
  const { universe } = await getUniversePolicy(createServiceClient());
  const scanDate = etDateKey(new Date());
  const extraSymbols = await resolveExtraSymbols(scanDate);

  // `runMarketScan` itself was previously uncaught here: a thrown
  // MarketDataError (e.g. Alpaca's free-tier rate limit, hit more easily now
  // that the large-cap universe covers ~765 symbols — see fetchBarsBatch's
  // CHUNK_CONCURRENCY comment) crashed this route with no response body. The
  // client's `res.json()` then failed with "Unexpected end of JSON input" —
  // a confusing symptom of the real error being invisible to the caller.
  // Caught here so a scan failure always reports as JSON, same as every
  // other failure mode this route already handles below.
  let output: Awaited<ReturnType<typeof runMarketScan>>;
  try {
    output = await runMarketScan(FULL_UNIVERSE_TOP, undefined, universe, extraSymbols);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`market-scan: scan itself failed — ${message}`);
    return NextResponse.json({ error: message, persisted: false }, { status: 502 });
  }

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
    continuationSkipped: output.continuationSkipped,
    bullish: output.bullish.map((r) => ({ symbol: r.symbol, score: r.decision.score, state: r.decision.outputState })),
    bearish: output.bearish.map((r) => ({ symbol: r.symbol, score: r.decision.score, state: r.decision.outputState })),
    persisted,
    persistedCount,
    persistError,
  });
}

/**
 * Rows already published for today, if the most recent write across either
 * direction landed within `REUSE_RECENT_SCAN_MS`. Null when there's nothing
 * that fresh — either no scan has run today at all, or the freshest one is
 * old enough that a manual refresh should get genuinely current data.
 *
 * Reads with the service client (bypassing RLS) since this runs before the
 * caller's own signed-in client is otherwise used for anything else here —
 * `daily_scans` is readable by any authenticated user anyway (migration
 * 0001's policy), but the service client avoids a second round trip to
 * re-derive that.
 */
async function recentlyPublishedScan(scanDate: string): Promise<{
  updatedAt: string;
  bullish: { symbol: string; score: number; state: string }[];
  bearish: { symbol: string; score: number; state: string }[];
} | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("daily_scans")
    .select("direction, rank, symbol, score, output_state, updated_at")
    .eq("scan_date", scanDate)
    .order("rank");
  if (error || !data || data.length === 0) return null;

  const newestUpdatedAt = data.reduce(
    (max, r) => (r.updated_at > max ? r.updated_at : max),
    data[0].updated_at as string,
  );
  const age = Date.now() - new Date(newestUpdatedAt).getTime();
  if (!(age >= 0 && age < REUSE_RECENT_SCAN_MS)) return null;

  const toEntry = (r: (typeof data)[number]) => ({ symbol: r.symbol, score: r.score, state: r.output_state });
  return {
    updatedAt: newestUpdatedAt,
    bullish: data.filter((r) => r.direction === "bullish").map(toEntry),
    bearish: data.filter((r) => r.direction === "bearish").map(toEntry),
  };
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

/**
 * Manual refresh — any signed-in user can rebuild the market scan on demand.
 *
 * Reuses today's rows instead of re-scanning when the autonomous 15-minute
 * scan already wrote them within `REUSE_RECENT_SCAN_MS` — see that constant's
 * comment. Otherwise runs a genuinely fresh scan, same as before.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const scanDate = etDateKey(new Date());
  const recent = await recentlyPublishedScan(scanDate);
  if (recent) {
    return NextResponse.json({
      scanDate,
      bullish: recent.bullish,
      bearish: recent.bearish,
      persisted: true,
      persistedCount: recent.bullish.length + recent.bearish.length,
      persistError: null,
      reused: true,
      reusedFrom: recent.updatedAt,
    });
  }

  return runAndPersist();
}
