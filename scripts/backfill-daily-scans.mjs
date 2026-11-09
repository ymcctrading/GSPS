/**
 * Backfill `daily_scans` for trading days the scheduled scans missed.
 *
 * Why: production stopped on Oct 31, 2026, when Vercel paused the account
 * (until Nov 30; /mnt/project-files/owner/waiting-on-chuck.md). No scan ran,
 * so `daily_scans` has no rows after Oct 30, and every surface that reads it
 * (the dashboard lists, past scans, the evening report, the pre-open lines,
 * the intraday scanner's daily plans) has a hole. This rebuilds each missing
 * day with the current production scan (`runMarketScan`, `buildScanRows`,
 * `persistDailyScans`), run as of 19:00 ET that day, the evening scan's slot.
 *
 * No look-ahead: each day runs in its own process with the clock set to that
 * day's 19:00 ET and a fetch that cannot read past it (lib/backfill/timeTravel.ts):
 * bars requests are cut at the clock, bars not closed by it are dropped, the
 * latest trade is the last bar closed by it, and reads of the present (the
 * most-actives screener, quotes, snapshots) are refused, so the universe is
 * the curated large-cap list the scan falls back to when the screener fails,
 * led, as on the evening scan, by the discovery chunk the clock selects.
 * Prices are split-adjusted as of the run, as the scan's bars are, and a
 * stock that has split since the day is left out of that day's rows
 * (`splitSinceDay`), since its plan would be in units no member saw.
 * The scan's own writes (stores, telemetry, ledgers) are refused too; the
 * script writes `daily_scans` only, nothing else, and sends no notification,
 * fan-out or email.
 *
 * Usage (one command; the Alpaca proxy adds the key in the research environment):
 *   NODE_USE_ENV_PROXY=1 MARKET_DATA_PROVIDER=alpaca ALPACA_API_KEY=… ALPACA_API_SECRET=… \
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… \
 *   node scripts/backfill-daily-scans.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run] [--force] [--out DIR]
 *
 *   --from     first day to rebuild. Default: the day after the latest
 *              `scan_date` in `daily_scans` (needs the database).
 *   --to       last day. Default: the last trading day whose 19:00 ET has passed.
 *   --dry-run  run every day's scan and write the rows it would publish to
 *              --out (default $TMPDIR/backfill-daily-scans), touching no table.
 *   --force    also rebuild days that already have rows (upsert over them).
 *              Without it a day with any row is skipped, so a rerun, or a day
 *              the live scan has since written, is never overwritten.
 *
 * Idempotent: a day is skipped when it has rows (checked before the scan and
 * again just before the write), and the write is the production upsert on
 * (scan_date, direction, rank), which prunes only that day's higher ranks.
 *
 * Do not run against production until the pause has lifted and the PR has
 * passed review.
 */
import { createServer } from "vite";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(`--${name}`);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function viteServer() {
  return createServer({
    configFile: false,
    root,
    resolve: { alias: { "@": root } },
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });
}

/** A database client whose requests bypass the time-travel fetch, or null without credentials. */
async function writeClient(server, realFetch) {
  const { serviceRoleKey } = await server.ssrLoadModule("/lib/supabase/service-key.ts");
  const { createClient } = await server.ssrLoadModule("@supabase/supabase-js");
  let key;
  try {
    key = serviceRoleKey();
  } catch {
    return null;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false }, global: { fetch: realFetch } });
}

async function datesWithRows(client, from, to) {
  const { data, error } = await client.from("daily_scans").select("scan_date").gte("scan_date", from).lte("scan_date", to);
  if (error) throw new Error(`daily_scans read failed: ${error.message}`);
  return new Set((data ?? []).map((r) => r.scan_date));
}

/** One day, in its own process: the clock and every cache start clean. */
async function runDay(day, { dryRun, force, out }) {
  const realFetch = globalThis.fetch;
  const server = await viteServer();
  const result = { day, status: "unknown" };
  try {
    const tt = await server.ssrLoadModule("/lib/backfill/timeTravel.ts");
    const clock = tt.backfillClock(day);
    if (clock.getTime() > Date.now()) throw new Error(`${day} 19:00 ET has not happened yet`);
    if (tt.tradingDaysBetween(day, day).length !== 1) throw new Error(`${day} is not a trading day`);

    const db = await writeClient(server, realFetch);
    if (!dryRun && !db) throw new Error("a write needs NEXT_PUBLIC_SUPABASE_URL and the service key");
    if (db && !force && (await datesWithRows(db, day, day)).has(day)) {
      return { ...result, status: "skipped: rows exist" };
    }

    // From here on the process lives at 19:00 ET on `day`, for good: the clock
    // and the fetch are never put back, because the scan leaves background reads
    // and store writes running after it returns, and those must stay in the
    // past and stay refused. The process exits once the day is done.
    const RealDate = globalThis.Date;
    const { fetch: travel, stats } = tt.makeTimeTravelFetch(clock, realFetch, {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vebhpmmzxixlhujlptue.supabase.co",
    });
    globalThis.fetch = travel;
    tt.installFakeClock(clock);
    let output;
    let rows;
    let splitDropped = [];
    let extraSymbols = [];
    {
      const { FULL_UNIVERSE_TOP, runMarketScan } = await server.ssrLoadModule("/lib/marketScan.ts");
      const { buildScanRows, publishRefusal } = await server.ssrLoadModule("/lib/scan/publish.ts");
      const { getUniversePolicy } = await server.ssrLoadModule("/lib/universe/policy.ts");
      const { createServiceClient } = await server.ssrLoadModule("/lib/supabase/server.ts");
      let universe;
      try {
        ({ universe } = await getUniversePolicy(createServiceClient()));
      } catch (err) {
        console.warn(`${day}: universe policy not read (${String(err)}); code defaults used`);
      }
      // As the evening scan calls it (app/api/market-scan/route.ts): its extra
      // symbols are the day's tracked rows (none, for a missing day) and the
      // discovery chunk, which is anchored to the clock (lib/scan/universe-rotation.ts),
      // so the fake clock gives the chunk the 7 PM ET scan would have used.
      // No swept symbols: the overnight sweep did not run during the pause.
      const { resolveRotationChunk, resolveTrackedSymbols } = await server.ssrLoadModule("/lib/scan/universe-rotation.ts");
      const { LARGE_CAP_UNIVERSE } = await server.ssrLoadModule("/lib/scan/large-cap-universe.ts");
      let tracked = [];
      try {
        tracked = await resolveTrackedSymbols(createServiceClient(), day);
      } catch {
        tracked = [];
      }
      const chunk = resolveRotationChunk(LARGE_CAP_UNIVERSE)?.symbols ?? [];
      extraSymbols = [...new Set([...tracked, ...chunk])];
      output = await runMarketScan(FULL_UNIVERSE_TOP, undefined, universe, extraSymbols, []);
      if (output.scanDate !== day) throw new Error(`the scan filed itself under ${output.scanDate}, not ${day}`);
      const refusal = publishRefusal(output);
      if (refusal) throw new Error(refusal);
      // A stock that has split since the day would carry its plan in today's
      // units (Alpaca split-adjusts as of the request), which no member saw on
      // the day: its rows are left out, and listed in the summary.
      splitDropped = await tt.splitSinceDay(
        [...output.bullish, ...output.bearish].map((r) => r.symbol),
        clock,
        realFetch,
      );
      const keep = (r) => !splitDropped.includes(r.symbol);
      rows = [
        ...buildScanRows(day, "bullish", output.bullish.filter(keep)),
        ...buildScanRows(day, "bearish", output.bearish.filter(keep)),
      ];
    }
    // When the row was really written, beside the day's own `updated_at` and
    // `scannedAt`, which read the clock, as an on-time run would have stamped them.
    const backfilledAt = new RealDate(RealDate.now()).toISOString();
    for (const r of rows) r.detail = { ...r.detail, backfilledAt };

    const summary = {
      day,
      clock: clock.toISOString(),
      universeSize: output.universeSize,
      shortlisted: output.shortlisted,
      scanErrors: output.scanErrors,
      rows: rows.length,
      splitDropped,
      extraSymbols: extraSymbols.length,
      bullish: rows.filter((r) => r.direction === "bullish").length,
      bearish: rows.filter((r) => r.direction === "bearish").length,
      timeTravel: {
        barsRequests: stats.barsRequests,
        droppedBars: stats.droppedBars,
        rebuiltTrades: stats.rebuiltTrades,
        refusedReads: [...new Set(stats.refusedReads)],
        refusedWrites: [...new Set(stats.refusedWrites)],
        refusedHosts: [...new Set(stats.refusedHosts)],
        dbReads: [...new Set(stats.dbReads)],
      },
    };

    if (dryRun) {
      await mkdir(out, { recursive: true });
      await writeFile(path.join(out, `${day}.json`), JSON.stringify({ summary, rows }, null, 1) + "\n");
      return { ...result, ...summary, status: "dry run: written to " + path.join(out, `${day}.json`) };
    }
    // Check again just before writing: the live scan may have written the day meanwhile.
    if (!force && (await datesWithRows(db, day, day)).has(day)) return { ...result, ...summary, status: "skipped: rows appeared" };
    const { persistDailyScans } = await server.ssrLoadModule("/lib/scan/publish.ts");
    const outcome = await persistDailyScans(db, day, rows);
    return { ...result, ...summary, status: outcome.persisted ? `written: ${outcome.count} rows` : `not written: ${outcome.error}` };
  } catch (err) {
    return { ...result, status: `failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function main() {
  const dryRun = flag("dry-run");
  const force = flag("force");
  const out = arg("out") ?? path.join(os.tmpdir(), "backfill-daily-scans");

  const day = arg("day");
  if (day) {
    if (!DAY.test(day)) throw new Error(`--day must be YYYY-MM-DD, got ${day}`);
    const result = await runDay(day, { dryRun, force, out });
    console.log(`BACKFILL_RESULT ${JSON.stringify(result)}`);
    process.exit(result.status.startsWith("failed") ? 1 : 0);
  }

  const server = await viteServer();
  let days;
  try {
    const tt = await server.ssrLoadModule("/lib/backfill/timeTravel.ts");
    let from = arg("from");
    let to = arg("to");
    if (!to) {
      // The last trading day whose evening scan time has passed.
      const today = new Date().toISOString().slice(0, 10);
      const recent = tt.tradingDaysBetween(new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10), today);
      to = recent.filter((d) => tt.backfillClock(d).getTime() <= Date.now()).at(-1);
    }
    if (!from) {
      const db = await writeClient(server, globalThis.fetch);
      if (!db) throw new Error("--from is needed without database credentials");
      const { data, error } = await db.from("daily_scans").select("scan_date").order("scan_date", { ascending: false }).limit(1);
      if (error || !data?.[0]) throw new Error(`latest scan_date not read: ${error?.message ?? "no rows"}`);
      from = tt.nextDay(data[0].scan_date);
    }
    if (!DAY.test(from) || !DAY.test(to)) throw new Error(`bad range ${from}..${to}`);
    days = tt.tradingDaysBetween(from, to);
    console.log(`backfill ${dryRun ? "(dry run) " : ""}${from}..${to}: ${days.length} trading days: ${days.join(" ")}`);
  } finally {
    await server.close();
  }

  const results = [];
  for (const d of days) {
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), "--day", d, "--out", out, ...(dryRun ? ["--dry-run"] : []), ...(force ? ["--force"] : [])],
      { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 },
    );
    const line = (child.stdout ?? "").split("\n").find((l) => l.startsWith("BACKFILL_RESULT "));
    const result = line ? JSON.parse(line.slice("BACKFILL_RESULT ".length)) : { day: d, status: `failed: exit ${child.status}` };
    results.push(result);
    console.log(`${d}: ${result.status}${result.rows !== undefined ? ` (${result.bullish} bullish, ${result.bearish} bearish, ${result.timeTravel.droppedBars} bars past the clock dropped)` : ""}`);
  }
  const failed = results.filter((r) => r.status.startsWith("failed"));
  console.log(`done: ${results.length - failed.length} of ${results.length} days without error`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
