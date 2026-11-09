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
 *   deploy      GET <APP_URL>/api/health. Passes on 200 with status "ok"
 *               and the build commit it reports equal to --expect-sha (default:
 *               this checkout's origin/main). A 402 means the pause is still
 *               on; no commit means the Oct 30 build still serves, since the
 *               latest code goes live only with the first push to main.
 *   dry-run     the backfill in dry-run mode (scripts/backfill-daily-scans.mjs)
 *               for --from (default 2026-10-30) to --to (default: the last
 *               trading day whose 7 PM ET scan time has passed), then checks
 *               every day's row count: a failed day or a day with no rows
 *               fails the step; a count outside half the smallest to twice the
 *               largest of the last 15 live days before the pause is listed
 *               as a warning to look at.
 *               Before checking, it clears the day files an earlier run left
 *               in --out, and after it prints every database table the scan
 *               read and every read, write and host it was refused, to review
 *               before writing.
 *   write       the same range for real. Needs --yes and --reviewed DIR: the
 *               --out directory of an earlier, separate dry run that someone
 *               has read. Every day in the range must already have rows or a
 *               passing dry-run file there written within 24 hours; otherwise
 *               nothing is written. Then it writes and reads each day back.
 *   meter       has the usage meter recorded since --since (default: 2 hours
 *               ago)? Reads usage_readings.read_at and usage_events.
 *   next-scan   did the evening scan write today's rows on time? Looks at the
 *               latest trading day whose 7 PM ET has passed (or --day): its
 *               rows must exist, be stamped within 90 minutes of 7 PM ET and
 *               carry no `backfilledAt` (so they are the live scan's).
 *   sql         prints the checks the script cannot make itself (the
 *               schedule and the migrations live in schemas the app's API
 *               cannot read), to paste into the Supabase SQL editor.
 *   all         deploy, then dry-run. It never writes: the write is always its
 *               own command, after the dry run has been read.
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
import { readFile, readdir, rm, stat } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKFILL = path.join(root, "scripts", "backfill-daily-scans.mjs");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(`--${name}`);
const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

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

/** The commit the site should run: --expect-sha, else this checkout's origin/main. */
function expectedSha() {
  const given = arg("expect-sha");
  if (given) return given;
  const r = spawnSync("git", ["rev-parse", "origin/main"], { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

async function stepDeploy(rc) {
  const base = (process.env.APP_URL ?? "https://gsps.vercel.app").replace(/\/$/, "");
  const expect = expectedSha();
  console.log(`deploy: ${base}/api/health, expecting ${expect ? expect.slice(0, 7) : "no particular"} build (run git fetch first)`);
  let res;
  try {
    res = await fetch(`${base}/api/health`, { headers: { "cache-control": "no-cache" } });
  } catch (err) {
    fail(`no answer: ${String(err)}`);
    return false;
  }
  const verdicts = rc.judgeDeploy(res.status, await res.text(), expect);
  verdicts.forEach(report);
  return verdicts.every((v) => v.level === "PASS");
}

/**
 * Every `scan_date` in daily_scans between two days, paged past the API's
 * 1,000-row default (a month of scans runs to about 1,000 rows).
 */
async function scanDates(db, from, to) {
  const out = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db
      .from("daily_scans")
      .select("scan_date")
      .gte("scan_date", from)
      .lte("scan_date", to)
      .order("scan_date")
      .order("direction")
      .order("rank")
      .range(start, start + 999);
    if (error) throw new Error(`daily_scans read failed: ${error.message}`);
    out.push(...(data ?? []).map((r) => r.scan_date));
    if (!data || data.length < 1000) return out;
  }
}

/** The last 15 live days' row counts before the pause: the reference band. */
async function liveBand(tools) {
  if (!tools.db) return null;
  try {
    return tools.rc.liveBand(await scanDates(tools.db, "2026-10-01", tools.rc.LAST_LIVE_DAY));
  } catch {
    return null;
  }
}

/** Reads every day file in a dry-run directory, with when it was written. */
async function readDayFiles(dir) {
  const files = new Map();
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return files;
  }
  for (const name of names.filter((n) => DAY_FILE.test(n))) {
    const full = path.join(dir, name);
    let file = null;
    try {
      file = JSON.parse(await readFile(full, "utf8"));
    } catch {
      file = null;
    }
    files.set(name.slice(0, 10), { file, writtenAt: (await stat(full)).mtimeMs });
  }
  return files;
}

function printAccess(rc, files) {
  const a = rc.summarizeAccess(files);
  console.log("  what the scan touched (review before writing):");
  console.log(`    database tables read: ${a.dbReads.join(", ") || "none"}`);
  console.log(`    reads refused:        ${a.refusedReads.join(", ") || "none"}`);
  console.log(`    writes refused:       ${a.refusedWrites.join(", ") || "none"}`);
  console.log(`    hosts refused:        ${a.refusedHosts.join(", ") || "none"}`);
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
  const seen = [];
  for (const d of days) {
    let file = null;
    try {
      file = JSON.parse(await readFile(path.join(out, `${d}.json`), "utf8"));
    } catch {
      file = null;
    }
    seen.push(file);
    const v = rc.judgeDryRunDay(d, file, band);
    report(v);
    if (v.level === "FAIL") good = false;
  }
  printAccess(rc, seen);
  return good;
}

async function stepDryRun(tools, out) {
  const from = arg("from") ?? tools.rc.LAST_LIVE_DAY;
  const to = arg("to") ?? lastScanDay(tools.tt);
  if (!DAY.test(from) || !DAY.test(to)) throw new Error(`bad range ${from}..${to}`);
  const days = tools.tt.tradingDaysBetween(from, to);
  console.log(`dry-run: ${from}..${to}, ${days.length} trading days, files in ${out}`);
  // Day files an earlier run left here would pass for this run's: clear them.
  for (const name of (await readdir(out).catch(() => [])).filter((n) => DAY_FILE.test(n))) {
    await rm(path.join(out, name));
  }
  const status = runBackfill(from, to, ["--dry-run", "--out", out]);
  const band = await liveBand(tools);
  if (!band) warn("no database credentials: row counts are not compared with the live days");
  const good = (await checkDryRun(tools.rc, days, out, band)) && status === 0;
  (good ? ok : fail)(`dry run ${good ? "passed" : "did not pass"} (backfill exit ${status})`);
  return { good, from, to, days };
}

async function stepWrite(tools) {
  const reviewed = arg("reviewed");
  if (!flag("yes") || !reviewed) {
    fail("write needs --reviewed <the --out directory of a dry run you have read> and --yes (it writes daily_scans in the database the credentials point at)");
    return false;
  }
  if (!tools.db) {
    fail("write needs NEXT_PUBLIC_SUPABASE_URL and the service key");
    return false;
  }
  const from = arg("from") ?? tools.rc.LAST_LIVE_DAY;
  const to = arg("to") ?? lastScanDay(tools.tt);
  if (!DAY.test(from) || !DAY.test(to)) throw new Error(`bad range ${from}..${to}`);
  const days = tools.tt.tradingDaysBetween(from, to);
  console.log(`write: ${from}..${to}, ${days.length} trading days, on the dry run in ${reviewed}`);
  const files = await readDayFiles(reviewed);
  const before = new Set(await scanDates(tools.db, from, to));
  const check = tools.rc.judgeReviewedDryRun(days, files, before, Date.now(), await liveBand(tools));
  check.verdicts.forEach(report);
  printAccess(tools.rc, days.map((d) => files.get(d)?.file ?? null));
  if (!check.good) {
    fail("the reviewed dry run does not cover the range, so nothing was written");
    return false;
  }
  const status = runBackfill(from, to, []);
  const counts = new Map();
  for (const d of await scanDates(tools.db, from, to)) counts.set(d, (counts.get(d) ?? 0) + 1);
  let good = status === 0;
  for (const d of days) {
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
    console.log(`usage: node scripts/after-pause-recovery.mjs <${steps.join("|")}> [--from D] [--to D] [--day D] [--since ISO] [--out DIR] [--reviewed DIR] [--expect-sha SHA] [--yes]`);
    process.exit(2);
  }
  if (step === "sql") {
    console.log(SQL);
    return;
  }
  const out = arg("out") ?? path.join(os.tmpdir(), "after-pause-dry-run");
  const tools = await loadTools();
  let good;
  try {
    if (step === "deploy") good = await stepDeploy(tools.rc);
    else if (step === "dry-run") good = (await stepDryRun(tools, out)).good;
    else if (step === "write") good = await stepWrite(tools);
    else if (step === "meter") good = await stepMeter(tools);
    else if (step === "next-scan") good = await stepNextScan(tools);
    else {
      good = await stepDeploy(tools.rc);
      if (!good) {
        fail("stopping: the app is not up");
      } else {
        good = (await stepDryRun(tools, out)).good;
        console.log(`stopped after the dry run. Read it, then: node scripts/after-pause-recovery.mjs write --reviewed ${out} --yes`);
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
