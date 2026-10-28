/**
 * GSPS — /api/market-scan
 * Runs the daily market-wide scan (up to `perSide` setups a side: reversions
 * and setups taken with the trend, ranked together by score — see
 * lib/marketScan.ts) and persists results to Supabase. Invoked by Vercel Cron
 * (Authorization: Bearer CRON_SECRET) or manually with the same header. A
 * short side stays short rather than padded.
 */

import { NextRequest, NextResponse } from "next/server";
import { MARKET_DATA_UNAVAILABLE, SyntheticMarketDataError } from "@/lib/data/feed-mode";
import { FULL_UNIVERSE_TOP, runMarketScan } from "@/lib/marketScan";
import { discoveryRows, prefilterRows, writeLedger } from "@/lib/ledger/evaluationLedger";
import { visibilityRank } from "@/lib/scan/listOrder";
import { buildScanRows, describeDbError, persistDailyScans, publishRefusal } from "@/lib/scan/publish";
import { persistCoarseTelemetry } from "@/lib/scan/telemetry";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUniversePolicy } from "@/lib/universe/policy";
import { etDateKey } from "@/lib/market/session";
import { enqueueFanOut, toFanOutPayload } from "@/lib/entitlements/fanout-queue";
import type { RankedSetup } from "@/lib/entitlements/result-selection";
import type { ScanResult } from "@/lib/types";
import { retiredSignalsFrom } from "@/lib/lifecycle/retire";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { resolveDiscoveryAndTrackingSymbols } from "@/lib/scan/universe-rotation";
import { isCronAuthorized } from "@/lib/cron-auth";
import { loadSweptCandidates } from "@/lib/scan/universeSweep";
import { recordShadowSignals } from "@/lib/shadow/record";

/**
 * scan_executions.source for this route's own per-profile monitor fan-out.
 * See supabase/migrations/0076_scheduled_full_universe_scan_source.sql for
 * why this needs its own value rather than reusing one of the five
 * scheduled_* sources in lib/entitlements/scheduled-scan.ts.
 */
const FAN_OUT_SOURCE = "scheduled_full_universe_scan";

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
 * Live-timing verified 2026-09-23 on a preview deployment (PR #270): the
 * full coarse+full pipeline with both passes wired in completed in ~4.1s,
 * ~56s under this route's 60s budget — see `DISCOVERY_CHUNK_SIZE`'s own
 * comment (lib/scan/universe-rotation.ts) for the full breadcrumb figures.
 */
async function resolveExtraSymbols(service: ReturnType<typeof createServiceClient>, scanDate: string): Promise<string[]> {
  try {
    return await resolveDiscoveryAndTrackingSymbols(service, scanDate, LARGE_CAP_UNIVERSE);
  } catch (err) {
    console.warn(`market-scan: discovery/tracking symbols not resolved — ${describeDbError(err)}`);
    return [];
  }
}

/**
 * `fanOutToProfiles`: true only for the authenticated cron invocation (see
 * the GET handler below), never for a signed-in user's own manual "Refresh
 * scan" click (POST) — a single user's click must never fan monitor
 * transitions and notifications out to every other profile in the system.
 * This is the fix for ROADMAP.md's "Scan history" note: this route's cron
 * path previously wrote only `daily_scans` and never touched
 * `active_monitors` at all, so a symbol only ever seen through this route
 * (as opposed to the five lib/entitlements/scheduled-scan.ts jobs, which
 * already fan out) could sit on a user's Scan History tab as permanently
 * "untracked" even after becoming a real Execute setup.
 */
async function runAndPersist(options: { fanOutToProfiles: boolean } = { fanOutToProfiles: false }) {
  const service = createServiceClient();
  const { universe } = await getUniversePolicy(service);
  const scanDate = etDateKey(new Date());
  const [extraSymbols, sweptSymbols] = await Promise.all([
    resolveExtraSymbols(service, scanDate),
    loadSweptCandidates(service),
  ]);

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
    output = await runMarketScan(FULL_UNIVERSE_TOP, undefined, universe, extraSymbols, sweptSymbols);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`market-scan: scan itself failed — ${message}`);
    // A synthetic-data refusal names the server's configuration: logged above,
    // never returned (S-14).
    if (err instanceof SyntheticMarketDataError) {
      return NextResponse.json({ error: MARKET_DATA_UNAVAILABLE, code: "synthetic_market_data", persisted: false }, { status: 503 });
    }
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
    const refusal = publishRefusal(output);
    if (refusal) {
      persistError = refusal;
    } else {
      const outcome = await persistDailyScans(service, output.scanDate, rows);
      persisted = outcome.persisted;
      persistedCount = outcome.count;
      persistError = outcome.error;
    }
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

  // Discovery: logged, and stored in the evaluation ledger (below) where the
  // intraday scan's queue takes the session's discoveries as candidates to
  // examine. Nothing reads it to score, plan or notify.
  if (output.discoveries.length > 0) {
    const top = output.discoveries.slice(0, 15).map((d) => `${d.symbol}[${d.conditions.map((c) => c.kind).join("+")}]`);
    console.info(`market-scan: discovery ${output.discoveries.length} stocks, data as of ${output.discoveries[0].dataAsOf}: ${top.join(" ")}`);
  }

  // Coarse-gate calibration data — best-effort, and deliberately outside the
  // try/catch above so a telemetry write failure can never be mistaken for
  // the actual scan results failing to save.
  try {
    await persistCoarseTelemetry(service, output.coarseTelemetry);
  } catch (err) {
    console.warn(`market-scan: coarse telemetry not saved — ${describeDbError(err)}`);
  }

  // The evaluation ledger: the first time each stock cleared the pre-filter,
  // made the shortlist or was discovered this session. Best-effort.
  {
    const ledgerStarted = Date.now();
    const sessionDate = etDateKey(new Date());
    await writeLedger(
      service,
      [...prefilterRows(output.coarseTelemetry.filter((r) => r.scan_date === sessionDate), new Date()), ...discoveryRows(output.discoveries, sessionDate)],
      "market scan",
    );
    console.info(`market-scan: evaluation ledger written in ${Date.now() - ledgerStarted}ms`);
  }

  // Per-profile monitor evaluation + notification fan-out — cron path only
  // (see this function's own header comment above). Best-effort and
  // deliberately outside every try/catch above: a fan-out failure must
  // never be mistaken for the scan or the daily_scans publish itself
  // failing, and must never block either.
  let fanOutQueued = false;
  if (options.fanOutToProfiles) {
    // The forward test records the Execute calls this run publishes. This
    // scan is what fills the daily lists every 15 minutes, so a day the
    // timed scheduled scans found nothing (2026-10-21: 11 Executes on the
    // lists, none recorded) is still measured. A plan is one row a session
    // (lib/shadow/record.ts), so the repeats cost nothing; evaluation stays
    // with the scheduled scans. Best-effort: never fails the scan.
    try {
      const shadowStartedAt = Date.now();
      const { recorded } = await recordShadowSignals(service, [...output.bullish, ...output.bearish], FAN_OUT_SOURCE);
      console.log(`market-scan: shadow ${Date.now() - shadowStartedAt}ms — recorded ${recorded}`);
    } catch (err) {
      console.error(`market-scan: shadow signals not recorded — ${String(err)}`);
    }
    try {
      const qualifying: RankedSetup<ScanResult>[] = [
        ...output.bullish.map((r) => ({ side: "buy" as const, rank: visibilityRank(r), value: r })),
        ...output.bearish.map((r) => ({ side: "sell" as const, rank: visibilityRank(r), value: r })),
      ];
      // Same "looked at and found nothing" distinction scheduled-scan.ts's
      // fanOutToProfiles documents: a symbol this run's reduced universe
      // never scanned at all is correctly left alone, not treated as a
      // rejection.
      const rejectedSymbols = new Set(
        output.fullScanResults
          .filter((r) => !r.error && (r.decision.outputState === "Reject" || r.direction === "none"))
          .map((r) => r.symbol),
      );

      const { data: inserted, error: insertError } = await service
        .from("scan_executions")
        .insert({
          profile_id: null,
          source: FAN_OUT_SOURCE,
          market_date_et: output.scanDate,
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          eligible_count: qualifying.length,
          visible_count: qualifying.length,
          result_fresh_as_of: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        console.error(`market-scan: scan execution not recorded for fan-out — ${insertError?.message}`);
      } else {
        // Queued, not run here: the scan finishes at about +42s to +48s, so
        // the inline fan-out reached at most 6 of 24 members a run and none on
        // most (2026-10-22). /api/scan-fanout serves it within the minute,
        // with its own budget (lib/entitlements/fanout-queue.ts).
        const queueStartedAt = Date.now();
        fanOutQueued = await enqueueFanOut(service, {
          scanExecutionId: (inserted as { id: string }).id,
          source: FAN_OUT_SOURCE,
          payload: toFanOutPayload({
            qualifying,
            rejectedSymbols,
            retired: retiredSignalsFrom(output.fullScanResults),
          }),
        });
        console.log(`market-scan: fan-out queued=${fanOutQueued} in ${Date.now() - queueStartedAt}ms`);
      }
    } catch (err) {
      console.error(`market-scan: profile fan-out not queued — ${String(err)}`);
    }
  }

  return NextResponse.json({
    scanDate: output.scanDate,
    universeSize: output.universeSize,
    shortlisted: output.shortlisted,
    scanErrors: output.scanErrors,
    continuationFills: output.continuationFills,
    continuationSkipped: output.continuationSkipped,
    equitiesRead: output.equitiesRead,
    bullish: output.bullish.map((r) => ({ symbol: r.symbol, score: r.decision.score, state: r.decision.outputState })),
    bearish: output.bearish.map((r) => ({ symbol: r.symbol, score: r.decision.score, state: r.decision.outputState })),
    persisted,
    persistedCount,
    persistError,
    fanOutQueued,
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
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runAndPersist({ fanOutToProfiles: true });
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
