/**
 * The day the hosting pause lifts: put the scan history back and check the
 * schedule is running again. The steps, in order, and the owner's runbook
 * beside them: /mnt/project-files/owner/after-the-pause-runbook.md.
 *
 * Why: Vercel paused the account on Oct 31, 2026 until Nov 30. No scheduled
 * job reached the app in between (each call got 402 DEPLOYMENT_DISABLED), so
 * `daily_scans` stops at Oct 30 and the usage meter's last reading is Oct 31.
 *
 *   node scripts/after-pause-recovery.mjs <step> [options]
 *
 *   deploy      GET <APP_URL>/api/health. Passes on 200 with status "ok";
 *               a 402 means the pause is still on.
 *   dry-run     the backfill in dry-run mode (scripts/backfill-daily-scans.mjs)
 *               for --from (default 2026-10-30) to --to (default: the last
 *               trading day whose 7 PM ET scan time has passed), then checks
 *               every day's row count: a failed day or a day with no rows
 *               fails the step; a count outside half the smallest to twice the
 *               largest of the last 15 live days before the pause is listed
 *               as a warning to look at.
 *   write       the same range for real. Needs --yes. Runs the dry-run check
 *               first and stops if it fails, then writes, then reads each
 *               day's rows back from the table.
 *   meter       has the usage meter recorded since --since (default: 2 hours
 *               ago)? Reads usage_readings.read_at and usage_events.
 *   next-scan   did the evening scan write today's rows on time? Looks at the
 *               latest trading day whose 7 PM ET has passed (or --day): its
 *               rows must exist, be stamped within 90 minutes of 7 PM ET and
 *               carry no `backfilledAt` (so they are the live scan's).
 *   sql         prints the checks the script cannot make itself (the
 *               schedule and the migrations live in schemas the app's API
 *               cannot read), to paste into the Supabase SQL editor.
 *   all         deploy, dry-run; with --yes also write, meter and next-scan.
 *
 * Environment: NEXT_PUBLIC_SUPABASE_URL and the service key (read through
 * serviceRoleKey()), APP_URL (default https://gsps.vercel.app), and the
 * backfill's own Alpaca variables (see its header).
 *
 * It changes nothing but `daily_scans`, and that only in `write` with --yes,
 * through the backfill, which skips any day that already has rows.
 */
import { createServer } from "vite";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKFILL = path.join(root, "scripts", "backfill-daily-scans.mjs");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(`--${name}`);

const say = (level, msg) => console.log(`  ${level.padEnd(4)}  ${msg}`);
const ok = (msg) => say("PASS", msg);
const warn = (msg) => say("WARN", msg);
const fail = (msg) => say("FAIL", msg);
const report = (v) => say(v.level, v.message);

async function loadTools() {
  const server = await createServer({
    configFile: false,
    root,
    resolve: { alias: { "@": root } },
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });
  const tt = await server.ssrLoadModule("/lib/backfill/timeTravel.ts");
  const rc = await server.ssrLoadModule("/lib/backfill/recovery.ts");
  const { serviceRoleKey } = await server.ssrLoadModule("/lib/supabase/service-key.ts");
  const { createClient } = await server.ssrLoadModule("@supabase/supabase-js");
  let db = null;
  let key;
  try {
    key = serviceRoleKey();
  } catch {
    key = undefined;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url && key) db = createClient(url, key, { auth: { persistSession: false } });
  return { server, tt, rc, db };
}

/** The last trading day whose 7 PM ET scan time has passed, at `now`. */
function lastScanDay(tt, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const recent = tt.tradingDaysBetween(new Date(now - 10 * 86_400_000).toISOString().slice(0, 10), today);
  return recent.filter((d) => tt.backfillClock(d).getTime() <= now).at(-1);
}

async function stepDeploy() {
  const base = (process.env.APP_URL ?? "https://gsps.vercel.app").replace(/\/$/, "");
  console.log(`deploy: ${base}/api/health`);
  let res;
  try {
    res = await fetch(`${base}/api/health`, { headers: { "cache-control": "no-cache" } });
  } catch (err) {
    fail(`no answer: ${String(err)}`);
    return false;
  }
  const text = await res.text();
  if (res.status === 402) {
    fail(`402 ${text.split("\n")[0]}: the hosting pause is still on`);
    return false;
  }
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: reported below
  }
  if (res.status !== 200 || body?.status !== "ok") {
    fail(`HTTP ${res.status}: ${text.slice(0, 120)}`);
    return false;
  }
  ok(`HTTP 200, status ok, market data ${body.feedMode} (${body.provider}), server time ${body.timestamp}`);
  return true;
}

/** The last 15 live days' row counts before the pause: the reference band. */
async function liveBand(tools) {
  if (!tools.db) return null;
  const { data, error } = await tools.db
    .from("daily_scans")
    .select("scan_date")
    .lte("scan_date", tools.rc.LAST_LIVE_DAY)
    .gte("scan_date", "2026-10-01");
  if (error || !data?.length) return null;
  return tools.rc.liveBand(data.map((r) => r.scan_date));
}

function runBackfill(from, to, extra) {
  const args = [BACKFILL, "--from", from, "--to", to, ...extra];
  console.log(`  running: node ${path.relative(root, BACKFILL)} ${args.slice(1).join(" ")}`);
  const child = spawnSync(process.execPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write((child.stdout ?? "").split("\n").map((l) => `    ${l}`).join("\n") + "\n");
  return child.status ?? 1;
}

/**
 * Checks each day's dry-run file. A day skipped because its rows exist (Oct 30,
 * or a day the live scan has written) is fine and has no file.
 */
async function checkDryRun(rc, days, out, band) {
  let good = true;
  for (const d of days) {
    let file = null;
    try {
      file = JSON.parse(await readFile(path.join(out, `${d}.json`), "utf8"));
    } catch {
      file = null;
    }
    const v = rc.judgeDryRunDay(d, file, band);
    report(v);
    if (v.level === "FAIL") good = false;
  }
  return good;
}

async function stepDryRun(tools, out) {
  const from = arg("from") ?? tools.rc.LAST_LIVE_DAY;
  const to = arg("to") ?? lastScanDay(tools.tt);
  if (!DAY.test(from) || !DAY.test(to)) throw new Error(`bad range ${from}..${to}`);
  const days = tools.tt.tradingDaysBetween(from, to);
  console.log(`dry-run: ${from}..${to}, ${days.length} trading days, files in ${out}`);
  const status = runBackfill(from, to, ["--dry-run", "--out", out]);
  const band = await liveBand(tools);
  if (!band) warn("no database credentials: row counts are not compared with the live days");
  const good = (await checkDryRun(tools.rc, days, out, band)) && status === 0;
  (good ? ok : fail)(`dry run ${good ? "passed" : "did not pass"} (backfill exit ${status})`);
  return { good, from, to, days };
}

async function stepWrite(tools, out) {
  if (!flag("yes")) {
    fail("write needs --yes (it writes daily_scans in the database the credentials point at)");
    return false;
  }
  if (!tools.db) {
    fail("write needs NEXT_PUBLIC_SUPABASE_URL and the service key");
    return false;
  }
  const dry = await stepDryRun(tools, out);
  if (!dry.good) {
    fail("the dry run did not pass, so nothing was written");
    return false;
  }
  console.log(`write: ${dry.from}..${dry.to}`);
  const status = runBackfill(dry.from, dry.to, []);
  const { data, error } = await tools.db.from("daily_scans").select("scan_date").gte("scan_date", dry.from).lte("scan_date", dry.to);
  if (error) {
    fail(`read back failed: ${error.message}`);
    return false;
  }
  const counts = new Map();
  for (const r of data ?? []) counts.set(r.scan_date, (counts.get(r.scan_date) ?? 0) + 1);
  let good = status === 0;
  for (const d of dry.days) {
    const n = counts.get(d) ?? 0;
    if (n > 0) ok(`${d}: ${n} rows in daily_scans`);
    else {
      fail(`${d}: no rows in daily_scans`);
      good = false;
    }
  }
  (good ? ok : fail)(`write ${good ? "done: every trading day in the range has rows" : "left a gap"} (backfill exit ${status})`);
  return good;
}

async function stepMeter(tools) {
  if (!tools.db) {
    fail("meter needs NEXT_PUBLIC_SUPABASE_URL and the service key");
    return false;
  }
  const since = arg("since") ?? new Date(Date.now() - 2 * 3_600_000).toISOString();
  console.log(`meter: anything recorded since ${since}?`);
  const readings = await tools.db.from("usage_readings").select("meter, read_at, percent, hold").order("read_at", { ascending: false });
  const events = await tools.db.from("usage_events").select("meter, occurred_at").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(500);
  if (readings.error || events.error) {
    fail(`read failed: ${readings.error?.message ?? events.error?.message}`);
    return false;
  }
  const verdicts = tools.rc.judgeMeter(readings.data ?? [], events.data ?? [], since);
  verdicts.forEach(report);
  return verdicts.slice(0, 2).every((v) => v.level === "PASS");
}

async function stepNextScan(tools) {
  if (!tools.db) {
    fail("next-scan needs NEXT_PUBLIC_SUPABASE_URL and the service key");
    return false;
  }
  const day = arg("day") ?? lastScanDay(tools.tt);
  const slot = tools.tt.backfillClock(day);
  console.log(`next-scan: the live evening scan for ${day} (due ${slot.toISOString()}, 7 PM ET)`);
  const { data, error } = await tools.db.from("daily_scans").select("updated_at, detail").eq("scan_date", day);
  if (error) {
    fail(`read failed: ${error.message}`);
    return false;
  }
  const v = tools.rc.judgeNextScan(day, slot, new Date(), data ?? []);
  report(v);
  return v.level === "PASS";
}

const SQL = `-- 1. The evening scan's schedule. Expect one row, active = true. If there is
--    none, migration 0144_app_base_url_cloud_run.sql has not been applied
--    (true at 2026-11-09 09:10 UTC), and since vercel.json on main has no
--    crons, no evening scan will run until it is.
select jobname, schedule, active from cron.job
 where jobname in ('gsps-evening-market-scan', 'gsps-trade-journal-digest', 'gsps-usage-check');

-- 2. Do the scheduled calls reach the app again? Expect 200s after the pause
--    lifts; 402 "DEPLOYMENT_DISABLED" means it has not.
select created, status_code, left(content::text, 60) as body
  from net._http_response order by created desc limit 10;

-- 3. The evening scan's last runs (after 0144 is applied).
select d.start_time, d.status, left(d.return_message, 80)
  from cron.job_run_details d join cron.job j using (jobid)
 where j.jobname = 'gsps-evening-market-scan' order by d.start_time desc limit 5;

-- 4. Is anything held at 99%? (A hold stops the scheduled calls.)
select meter, percent, hold, read_at from usage_readings order by meter;`;

async function main() {
  const step = process.argv[2];
  const steps = ["deploy", "dry-run", "write", "meter", "next-scan", "sql", "all"];
  if (!steps.includes(step)) {
    console.log(`usage: node scripts/after-pause-recovery.mjs <${steps.join("|")}> [--from D] [--to D] [--day D] [--since ISO] [--out DIR] [--yes]`);
    process.exit(2);
  }
  if (step === "sql") {
    console.log(SQL);
    return;
  }
  if (step === "deploy") process.exit((await stepDeploy()) ? 0 : 1);

  const out = arg("out") ?? path.join(os.tmpdir(), "after-pause-dry-run");
  const tools = await loadTools();
  let good;
  try {
    if (step === "dry-run") good = (await stepDryRun(tools, out)).good;
    else if (step === "write") good = await stepWrite(tools, out);
    else if (step === "meter") good = await stepMeter(tools);
    else if (step === "next-scan") good = await stepNextScan(tools);
    else {
      good = await stepDeploy();
      if (!good) {
        fail("stopping: the app is not up");
      } else if (!flag("yes")) {
        good = (await stepDryRun(tools, out)).good;
        console.log("stopped after the dry run: add --yes to write, then check the meter and the next scan");
      } else {
        good = await stepWrite(tools, out);
        const meterOk = await stepMeter(tools);
        const scanOk = await stepNextScan(tools);
        if (!meterOk || !scanOk) console.log("the meter and the next scan can take hours to show; rerun those two steps later");
      }
    }
  } finally {
    await tools.server.close();
  }
  process.exit(good ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
