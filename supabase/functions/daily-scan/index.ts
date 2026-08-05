/**
 * `daily-scan` — retired 2026-08-05. This stub is the deployed body.
 *
 * What it used to do: read a scored universe from GSPS_SCAN_ENDPOINT, rank it
 * through a copy of the reversion waterfall, delete the day's rows from
 * `daily_scans` and insert its own. When that endpoint was unset or failed —
 * which was every run — it fell back to `mockScoredUniverse()`: ten fixed
 * symbols priced at entry `100 + i`, stop `entry - 3`, TP1 `entry + 4`, master
 * profit `entry + 8`. Those placeholder prices reached the dashboard as
 * tradeable setups and stayed there for two weeks, which is how SPY came to be
 * listed entering at $100.00.
 *
 * The daily scan is `/api/market-scan` in the Next.js app: the real
 * multi-timeframe protocol against live bars, writing the same table on the
 * Vercel cron. Migration `0007` removed this function's pg_cron schedule.
 *
 * Nothing schedules it now, but the deployed function stayed publicly
 * invokable, and its first act was a delete against today's rows. So the body
 * is replaced rather than left dormant: it touches no data and answers 410.
 * `verify_jwt` is on as well — two locks, because the cost of being wrong here
 * is fabricated prices on a screen someone sizes a position against.
 *
 * Do not restore the previous body. A fallback that invents prices is not a
 * fallback; a scan with no data should fail and say so.
 */

// @ts-nocheck - Deno edge runtime

Deno.serve(
  () =>
    new Response(
      JSON.stringify({
        error: "gone",
        message:
          "The daily market scan runs at /api/market-scan. This function is retired and writes nothing.",
      }),
      { status: 410, headers: { "Content-Type": "application/json" } },
    ),
);
