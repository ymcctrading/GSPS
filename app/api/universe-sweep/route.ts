/**
 * GSPS — /api/universe-sweep: the evening sweep (`lib/scan/universeSweep.ts`).
 *
 * Run by the database's scheduler every five minutes in the small hours of New
 * York time, Tuesday to Saturday (migration 0109). Each call fully scores the next stocks in the scan universe that have
 * no row for tonight yet, with `scanTicker` (the same score a manual scan
 * gives), batch by batch until its time is nearly spent, and stores each
 * verdict in `universe_sweep`. The next day's market scan re-scores the best
 * of them first. Off every person's path: nobody waits on it.
 *
 * Only between midnight and 4 AM New York time: the
 * score reads the sessions completed before the day it is run on
 * (`scanTicker`'s `sessions`), so a run after midnight scores the session that
 * just closed and is filed under the day it is for, as the morning's scans
 * read it. An evening run would leave out the day's own bar, and one in or
 * before the session would file a day still being made, so it does nothing
 * then.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getMarketDataProvider, fetchAllTimeframesBatch } from "@/lib/data/provider";
import { MARKET_DATA_UNAVAILABLE, syntheticDataRefusal } from "@/lib/data/feed-mode";
import { etDateKey, etParts } from "@/lib/market/session";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { getUniversePolicy } from "@/lib/universe/policy";
import { EXECUTION_TIMEFRAME } from "@/lib/timeframe";
import { scanTicker } from "@/lib/scanTicker";
import { hasTradePlan } from "@/lib/marketScan";
import { nextUnswept, SWEEP_BATCH } from "@/lib/scan/universeSweep";

export const maxDuration = 60;

/** No new batch starts after this many ms, so the last one finishes inside the 60 s. */
const SWEEP_DEADLINE_MS = 35_000;
/** The sweep runs before 4 AM New York time, when pre-market opens. */
const SWEEP_LATEST_ET_MINUTES = 4 * 60;
/** A failed read is tried again after this long. */
const RETRY_AFTER_MS = 20 * 60_000;
/** Days of sweep rows kept. */
const KEEP_DAYS = 30;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const now = new Date();
  if (etParts(now).minutes >= SWEEP_LATEST_ET_MINUTES) {
    return NextResponse.json({ skipped: "outside_sweep_hours" });
  }
  const provider = getMarketDataProvider();
  if (syntheticDataRefusal("run the evening sweep", provider)) {
    return NextResponse.json({ error: MARKET_DATA_UNAVAILABLE, code: "synthetic_market_data" }, { status: 503 });
  }

  const basisDate = etDateKey(now);
  const service = createServiceClient();
  const { data: done, error: readError } = await service
    .from("universe_sweep")
    .select("symbol, error, swept_at")
    .eq("basis_date", basisDate)
    .limit(5000);
  if (readError) return NextResponse.json({ error: `Sweep rows not read: ${readError.message}` }, { status: 500 });
  // A stock whose read failed (a rate limit, a feed gap) is tried again once
  // the rest are scored, at most every `RETRY_AFTER_MS`, until the window ends.
  const retryBefore = now.getTime() - RETRY_AFTER_MS;
  const doneRows = (done ?? []) as { symbol: string; error: string | null; swept_at: string }[];
  const swept = new Set(doneRows.map((r) => r.symbol.toUpperCase()));
  const retry = doneRows
    .filter((r) => r.error && new Date(r.swept_at).getTime() < retryBefore)
    .map((r) => r.symbol.toUpperCase());
  const { universe } = await getUniversePolicy(service);

  let scored = 0;
  let errors = 0;
  const batchMs: number[] = [];
  while (Date.now() - startedAt < SWEEP_DEADLINE_MS) {
    let batch = nextUnswept(LARGE_CAP_UNIVERSE, swept, SWEEP_BATCH);
    if (batch.length === 0) batch = retry.splice(0, SWEEP_BATCH);
    if (batch.length === 0) break;
    const batchStarted = Date.now();
    const bars = await fetchAllTimeframesBatch(batch, EXECUTION_TIMEFRAME);
    const results = await Promise.all(
      batch.map((symbol) =>
        scanTicker(symbol, undefined, undefined, bars.get(symbol), universe).catch(
          (err: unknown) => ({ error: String(err) }) as Awaited<ReturnType<typeof scanTicker>>,
        ),
      ),
    );
    const sweptAt = new Date().toISOString();
    const rows = results.map((r, i) => {
      const planned = !r.error && hasTradePlan(r);
      return {
        basis_date: basisDate,
        symbol: batch[i],
        direction: planned ? r.direction : "none",
        score: r.error ? null : r.decision.score,
        output_state: r.error ? null : r.decision.outputState,
        setup_kind: planned ? r.setupKind : null,
        entry: planned ? (r.levels?.entry ?? null) : null,
        error: r.error ?? null,
        swept_at: sweptAt,
      };
    });
    const { error } = await service.from("universe_sweep").upsert(rows, { onConflict: "basis_date,symbol" });
    if (error) return NextResponse.json({ error: `Sweep rows not stored: ${error.message}`, scored }, { status: 500 });
    for (const s of batch) swept.add(s);
    scored += batch.length;
    errors += rows.filter((r) => r.error).length;
    batchMs.push(Date.now() - batchStarted);
  }

  // Kept for a month, enough to compare nights; older rows go.
  const cutoff = etDateKey(new Date(now.getTime() - KEEP_DAYS * 86_400_000));
  const { error: pruneError } = await service.from("universe_sweep").delete().lt("basis_date", cutoff);
  if (pruneError) console.warn("[universe-sweep] old rows not pruned:", pruneError.message);

  const remaining = nextUnswept(LARGE_CAP_UNIVERSE, swept, LARGE_CAP_UNIVERSE.length).length;
  const ms = Date.now() - startedAt;
  console.log(
    `[universe-sweep] ${basisDate}: scored ${scored} (${errors} errors) in ${ms}ms, ` +
      `batches of ${SWEEP_BATCH} took ${batchMs.join("/")}ms, ${remaining} left`,
  );
  return NextResponse.json({ basisDate, scored, errors, remaining, ms, batchMs });
}
