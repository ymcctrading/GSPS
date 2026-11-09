/**
 * The "accept and label" answer for the paper positions left unmanaged by the
 * Oct 31 to Nov 30, 2026 pause (owner/after-the-pause-runbook.md): mark each
 * trade the live manager settled in one pass after the lift as
 * "Settled after pause, month read in one pass" (`lib/recovery/pauseSettlementLabel.ts`).
 *
 * Run only on the owner's yes to that answer. Three steps, each a separate run:
 *
 *   1. capture (read only), before the hold is released (runbook 0d): saves
 *      the ids of the paper exits still `working` and last managed before the
 *      cutoff, so the label later reaches exactly those positions.
 *        node scripts/label-paused-paper-settlements.mjs capture --out ids.json [--before 2026-10-31T00:00:00Z]
 *   2. dry run (read only), after the manager's pass has settled them: lists
 *      the trade logs it would label, and the captured exits with no close yet.
 *        node scripts/label-paused-paper-settlements.mjs --dry-run --ids ids.json --since <the lift, ISO>
 *   3. write, after a person has read step 2: the same selection, labelled.
 *      Each update matches the reasoning text it read, so a row changed in
 *      between is skipped and named.
 *        node scripts/label-paused-paper-settlements.mjs --write --ids ids.json --since <ISO> --yes
 *
 * `--since` keeps a close from before the pause from ever being relabelled.
 * Only `trade_logs.signal_called` changes, and `updated_at`. Nothing is
 * emailed. A label written after 5 PM ET does not reach that day's email,
 * which runs at 5 PM; the runbook has it written before then.
 *
 * Usage needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (read through
 * `serviceRoleKey()`).
 */
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name) => process.argv.includes(`--${name}`);
const fail = (msg) => {
  console.error(`label-paused-paper-settlements: ${msg}`);
  process.exit(2);
};

const capture = process.argv[2] === "capture";
const write = flag("write");
if (!capture && flag("dry-run") === write) fail("pass capture, --dry-run or --write.");
if (write && !flag("yes")) fail("--write needs --yes.");
if (capture && !arg("out")) fail("capture needs --out FILE.");
if (!capture && !arg("ids")) fail("--ids FILE (from capture) is required.");
const since = arg("since") ? new Date(arg("since")) : null;
if (!capture && (since == null || !Number.isFinite(since.getTime()))) fail("--since <ISO time of the lift> is required.");
const before = new Date(arg("before") ?? "2026-10-31T00:00:00Z");
if (!Number.isFinite(before.getTime())) fail(`--before is not a date: ${arg("before")}`);

const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "warn",
});

let exitCode = 0;
try {
  const { serviceRoleKey } = await server.ssrLoadModule("/lib/supabase/service-key.ts");
  const { createClient } = await server.ssrLoadModule("@supabase/supabase-js");
  const { rowsToLabel, withPauseLabel } = await server.ssrLoadModule("/lib/recovery/pauseSettlementLabel.ts");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  const db = createClient(url, serviceRoleKey(), { auth: { persistSession: false } });

  if (capture) {
    const { data, error } = await db
      .from("protocol_exits")
      .select("id, symbol, last_managed_at, created_at")
      .eq("mode", "paper")
      .eq("status", "working");
    if (error) throw new Error(`could not read protocol_exits: ${error.message}`);
    const paused = data.filter((r) => Date.parse(r.last_managed_at ?? r.created_at) < before.getTime());
    await writeFile(arg("out"), JSON.stringify({ capturedAt: new Date().toISOString(), before: before.toISOString(), ids: paused.map((r) => r.id) }, null, 2));
    console.log(`captured ${paused.length} paused paper exits (of ${data.length} working) last managed before ${before.toISOString()}: ${arg("out")}`);
  } else {
    const file = JSON.parse(await readFile(arg("ids"), "utf8"));
    const ids = Array.isArray(file) ? file : file.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((x) => typeof x !== "string")) throw new Error("--ids must hold the ids written by capture");
    const { data, error } = await db
      .from("trade_logs")
      .select("id, user_id, symbol, exit_plan_id, mode, exit_timestamp, exit_condition, signal_called")
      .in("exit_plan_id", ids);
    if (error) throw new Error(`could not read trade_logs: ${error.message}`);
    const chosen = rowsToLabel(data, new Set(ids), since);
    const logged = new Set(data.map((r) => r.exit_plan_id));
    console.log(`label-paused-paper-settlements (${write ? "WRITE" : "dry run"}): ${ids.length} captured exits, ${data.length} trade logs found, ${chosen.length} to label`);
    for (const r of chosen) console.log(`  ${String(r.id).slice(0, 8)} ${r.symbol} ${r.exit_condition} closed ${r.exit_timestamp}`);
    const open = ids.filter((id) => !logged.has(id));
    if (open.length > 0) console.log(`  no close logged yet for ${open.length}: ${open.map((x) => x.slice(0, 8)).join(", ")}`);
    if (write) {
      let done = 0;
      for (const r of chosen) {
        const { data: hit, error: e } = await db
          .from("trade_logs")
          .update({ signal_called: withPauseLabel(r.signal_called), updated_at: new Date().toISOString() })
          .eq("id", r.id)
          .eq("user_id", r.user_id)
          .eq("signal_called", r.signal_called)
          .select("id")
          .maybeSingle();
        if (e) {
          exitCode = 1;
          console.log(`  ${String(r.id).slice(0, 8)}: ERROR ${e.message}`);
        } else if (!hit) {
          console.log(`  ${String(r.id).slice(0, 8)}: SKIPPED (changed since it was read)`);
        } else done++;
      }
      console.log(`labelled ${done} of ${chosen.length}`);
    }
  }
} catch (err) {
  console.error(`label-paused-paper-settlements: ${err instanceof Error ? err.message : String(err)}`);
  exitCode = 1;
} finally {
  await server.close();
}
process.exit(exitCode);
