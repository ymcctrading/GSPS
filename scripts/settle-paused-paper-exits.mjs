/**
 * What the paused paper positions would have done, walked in time order, and
 * (write mode, reviewed and confirmed) that result settled through the normal
 * paper path with each exit dated at its bar.
 *
 * Why: production stopped on Oct 31, 2026 (Vercel paused the account until
 * Nov 30), so the paper exit manager left every working paper exit unmanaged
 * from Oct 30. Its first pass after the lift would read the whole month at
 * once (targets on the month's best price, the stop only at the price of that
 * moment), which is not what the rules would have done. This script walks
 * each position through the 15-minute bars it missed, bar by bar, with
 * `lib/recovery/pausedPaperExits.ts`, and prints, for each one, the walk's
 * outcome beside what that first pass would book.
 *
 * The dry run only reads: `protocol_exits` (mode paper, status working), the
 * market data provider's bars and the instrument reference. It writes no row,
 * places no order and sends nothing.
 *
 * The write mode (`lib/recovery/settlePausedExit.ts`) is a production write,
 * run only on the owner's yes (/mnt/project-files/owner/waiting-on-chuck.md)
 * and only from a dry run's `--out` file that a person has read. It walks the
 * rows again to the reviewed file's `end`, refuses everything if any row or
 * any result differs from the file, and then, row by row: claims the row (only
 * if unchanged since the dry run), books each fill through `executeFill`,
 * writes the trade log with `exit_timestamp` at the last fill's bar and closes
 * the row at that time; an automated plan stopped out is ended at that time
 * with no reversal or re-buy seeded. `last_managed_at` becomes the walk's end,
 * which lifts the after-the-pause hold's policy from that row
 * (owner/after-the-pause-runbook.md, step 0). Nothing is emailed by it.
 *
 * Usage (research environment; the proxy adds the Alpaca key):
 *   NODE_USE_ENV_PROXY=1 MARKET_DATA_PROVIDER=alpaca ALPACA_API_KEY=via-proxy ALPACA_API_SECRET=via-proxy \
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… \
 *   node scripts/settle-paused-paper-exits.mjs --dry-run [--end ISO] [--out FILE]
 *   node scripts/settle-paused-paper-exits.mjs --write --reviewed FILE --yes
 *
 *   --dry-run  read and print only.
 *   --write    settle; needs --reviewed (a dry run's --out file, which sets
 *              the end) and --yes, and reads the rows from the database.
 *   --end      walk up to this time (default now). Only bars closed by it count.
 *   --out      also write the full result as JSON to this file.
 *   --positions read the rows from this JSON file (an array of `protocol_exits`
 *              rows with the columns selected below) instead of the database,
 *              so the walk can run where no database key is set. The rows are
 *              then whatever the file holds; say where they came from.
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

const writeMode = flag("write");
if (flag("dry-run") === writeMode) {
  console.error("settle-paused-paper-exits: pass exactly one of --dry-run or --write.");
  process.exit(2);
}
let reviewed = null;
if (writeMode) {
  if (!arg("reviewed") || !flag("yes")) {
    console.error("settle-paused-paper-exits: --write needs --reviewed <dry run --out file> and --yes.");
    process.exit(2);
  }
  if (arg("positions") || arg("end")) {
    console.error("settle-paused-paper-exits: --write reads the rows from the database and the end from the reviewed file; drop --positions and --end.");
    process.exit(2);
  }
  reviewed = JSON.parse(await readFile(arg("reviewed"), "utf8"));
  if (!reviewed || typeof reviewed.end !== "string" || !Array.isArray(reviewed.results)) {
    console.error("settle-paused-paper-exits: the reviewed file is not a dry run's --out file.");
    process.exit(2);
  }
}
const end = reviewed ? new Date(reviewed.end) : arg("end") ? new Date(arg("end")) : new Date();
if (!Number.isFinite(end.getTime())) {
  console.error(`settle-paused-paper-exits: --end is not a date: ${arg("end")}`);
  process.exit(2);
}

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
  const { walkPausedExit, firstPassAfterPause } = await server.ssrLoadModule("/lib/recovery/pausedPaperExits.ts");
  const { getMarketDataProvider } = await server.ssrLoadModule("/lib/data/provider.ts");
  const { assertLiveMarketData } = await server.ssrLoadModule("/lib/data/feed-mode.ts");
  const { getInstrumentReference } = await server.ssrLoadModule("/lib/data/instrumentReference.ts");
  const { isCryptoSymbol } = await server.ssrLoadModule("/lib/data/alpaca.ts");
  const { monthlyChartFrom } = await server.ssrLoadModule("/lib/scan/entrySelection.ts");
  const { serviceRoleKey } = await server.ssrLoadModule("/lib/supabase/service-key.ts");
  const { createClient } = await server.ssrLoadModule("@supabase/supabase-js");

  const provider = getMarketDataProvider();
  assertLiveMarketData("walk paused paper positions", provider);

  let rows;
  let source;
  if (arg("positions")) {
    rows = JSON.parse(await readFile(arg("positions"), "utf8"));
    if (!Array.isArray(rows)) throw new Error("--positions must hold a JSON array of protocol_exits rows");
    source = `rows from ${arg("positions")}`;
  } else {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set (or pass --positions FILE)");
    const db = createClient(url, serviceRoleKey(), { auth: { persistSession: false } });
    const { data, error } = await db
      .from("protocol_exits")
      .select(
        "id, user_id, symbol, side, qty, entry_price, stop_loss, take_profit_1, master_profit, scale_out_qty, master_qty, runner_qty, scale_out_order_id, master_order_id, runner_order_id, scale_out_fill_price, master_fill_price, runner_fill_price, high_water, applied_stop, applied_stop_reason, entry_order_id, lots, created_at, last_managed_at",
      )
      .eq("mode", "paper")
      .eq("status", "working")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`could not read protocol_exits: ${error.message}`);
    rows = data;
    source = "working paper exits read from the database";
  }
  console.log(`settle-paused-paper-exits (${writeMode ? "WRITE" : "dry run"}): ${rows.length} ${source}, walked to ${end.toISOString()}`);

  const n = (v) => (v == null ? null : Number(v));
  const bySymbol = new Map();
  async function barsFor(symbol, from) {
    const key = symbol.toUpperCase();
    const hit = bySymbol.get(key);
    if (hit && hit.from <= from.getTime()) return hit;
    const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
    const dailyFrom = new Date(end.getTime() - 730 * 86_400_000);
    const [bars, daily, monthly, ref] = await Promise.all([
      provider.fetchBars(symbol, "15Min", from, end, assetClass),
      provider.fetchBars(symbol, "1Day", dailyFrom, end, assetClass),
      provider.fetchBars(symbol, "1Month", monthlyChartFrom(dailyFrom), end, assetClass),
      assetClass === "crypto"
        ? Promise.resolve(null)
        : getInstrumentReference(symbol).catch((err) => {
            console.warn(`  ${key}: no instrument reference (${err instanceof Error ? err.message : String(err)}); share count unknown`);
            return null;
          }),
    ]);
    const entry = { from: from.getTime(), bars, daily, monthly, shares: ref?.sharesOutstanding ?? null, crypto: assetClass === "crypto" };
    bySymbol.set(key, entry);
    return entry;
  }

  const results = [];
  for (const r of rows) {
    const notes = [];
    if (r.lots != null) notes.push("has pyramid lots (not modelled: the walk reads the first entry only)");
    const position = {
      side: r.side,
      entryPrice: n(r.entry_price),
      initialStop: n(r.stop_loss),
      appliedStop: n(r.applied_stop),
      highWater: n(r.high_water),
      openedAt: r.created_at,
      lastManagedAt: r.last_managed_at ?? r.created_at,
      tranches: [
        { key: "scale_out", qty: n(r.scale_out_qty) ?? 0, target: n(r.take_profit_1), done: r.scale_out_order_id != null },
        { key: "master", qty: n(r.master_qty) ?? 0, target: n(r.master_profit), done: r.master_order_id != null },
        { key: "runner", qty: n(r.runner_qty) ?? 0, target: null, done: r.runner_order_id != null },
      ],
    };
    const priorFills = [
      r.scale_out_order_id != null && r.scale_out_fill_price != null ? { key: "scale_out", qty: n(r.scale_out_qty), price: n(r.scale_out_fill_price) } : null,
      r.master_order_id != null && r.master_fill_price != null ? { key: "master", qty: n(r.master_qty), price: n(r.master_fill_price) } : null,
    ].filter(Boolean);
    if ((r.scale_out_order_id != null && r.scale_out_fill_price == null) || (r.master_order_id != null && r.master_fill_price == null)) {
      notes.push("a tranche filled before the pause has no stored fill price, so its R leaves it out");
    }
    try {
      const data = await barsFor(r.symbol, new Date(r.created_at));
      // A --positions file may carry the share count (read from `instrument`) where no database key is set.
      const shares = r.shares_outstanding != null ? Number(r.shares_outstanding) : data.shares;
      if (shares == null && !data.crypto) notes.push("share count unknown: Gann's capital-stock rules read nothing");
      const walk = walkPausedExit({ position, bars: data.bars, daily: data.daily, monthly: data.monthly, sharesOutstanding: shares, end, crypto: data.crypto, priorFills });
      const lastBar = data.bars.filter((b) => Date.parse(b.t) + 15 * 60_000 <= end.getTime()).at(-1);
      const first = lastBar
        ? firstPassAfterPause({ position, bars: data.bars, daily: data.daily, monthly: data.monthly, sharesOutstanding: shares, end, lastPrice: lastBar.c, crypto: data.crypto })
        : null;
      results.push({ rowId: String(r.id), row: r, id: String(r.id).slice(0, 8), symbol: r.symbol, side: r.side, qty: n(r.qty), entry: position.entryPrice, initialStop: position.initialStop, appliedStop: position.appliedStop, lastManagedAt: position.lastManagedAt, walk, firstPass: first, lastPrice: lastBar?.c ?? null, notes });
    } catch (err) {
      exitCode = 1;
      results.push({ rowId: String(r.id), id: String(r.id).slice(0, 8), symbol: r.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const money = (x) => (x == null ? "-" : Number(x).toFixed(2));
  const fillLine = (f) => `${f.qty} ${f.key} at ${money(f.price)}${f.at ? ` on ${f.at.slice(0, 16).replace("T", " ")} UTC` : ""} (${f.reason})`;
  for (const x of results) {
    console.log(`\n${x.id} ${x.symbol} ${x.side ?? ""} ${x.qty ?? ""} @ ${money(x.entry)}, initial stop ${money(x.initialStop)}, stop in force ${money(x.appliedStop)}, last managed ${x.lastManagedAt ?? "?"}`);
    if (x.error) {
      console.log(`  ERROR ${x.error}`);
      continue;
    }
    const w = x.walk;
    console.log(`  walk, in bar order: ${w.state.toUpperCase()} after ${w.barsWalked} bars${w.ambiguousBars ? `, ${w.ambiguousBars} bar(s) with stop and target both reached (counted as the stop)` : ""}`);
    for (const f of w.fills) console.log(`    ${fillLine(f)}`);
    if (w.state === "open") console.log(`    still open: stop ${money(w.stop)} (${w.stopReason}), best ${money(w.best)}, last price ${money(x.lastPrice)}`);
    else console.log(`    R on the whole position: ${w.rMultiple == null ? "-" : w.rMultiple.toFixed(2)}`);
    if (x.firstPass) {
      const fp = x.firstPass;
      console.log(`  first live pass after the lift, as it stands: ${fp.fills.length === 0 ? "no fill" : fp.fills.map(fillLine).join("; ")}; stop ${money(fp.stop)}, best ${money(fp.best)}`);
    }
    for (const note of x.notes) console.log(`  note: ${note}`);
  }
  const closed = results.filter((x) => x.walk?.state === "closed").length;
  const differ = results.filter((x) => x.walk && x.firstPass && JSON.stringify(x.walk.fills.map((f) => [f.key, f.price])) !== JSON.stringify(x.firstPass.fills.map((f) => [f.key, f.price]))).length;
  console.log(`\nsummary: ${results.length} positions; walk closes ${closed}, leaves ${results.length - closed - results.filter((x) => x.error).length} open; ${differ} differ from the first live pass; ${results.filter((x) => x.error).length} errors`);
  console.log("not modelled: pyramid adds, an automated re-buy cover, bad-news offers, a member's style change to Intraday after the fill");
  if (arg("out")) {
    await writeFile(arg("out"), JSON.stringify({ end: end.toISOString(), results: results.map((x) => ({ ...x, row: undefined })) }, null, 2));
    console.log(`written: ${arg("out")}`);
  }

  if (writeMode) {
    // The reviewed file and this walk must agree on every row, or nothing is written.
    const key = (x) => JSON.stringify(x.walk ? [x.walk.state, x.walk.stop, x.walk.fills.map((f) => [f.key, f.qty, f.price, f.at])] : ["error", x.error]);
    const before = new Map(reviewed.results.map((x) => [x.rowId, key(x)]));
    const problems = [];
    if (reviewed.results.some((x) => !x.rowId)) problems.push("the reviewed file has no full row ids (made before write mode existed); run the dry run again");
    if (before.size !== results.length) problems.push(`the reviewed file has ${before.size} rows, the database ${results.length}`);
    for (const x of results) {
      if (x.error) problems.push(`${x.id}: ${x.error}`);
      else if (!before.has(x.rowId)) problems.push(`${x.id}: not in the reviewed file`);
      else if (before.get(x.rowId) !== key(x)) problems.push(`${x.id}: the walk differs from the reviewed file`);
    }
    if (problems.length > 0) {
      for (const p of problems) console.error(`  REFUSED ${p}`);
      throw new Error("write refused: the reviewed file does not match; nothing was written");
    }
    const { planSettlement, applySettlement } = await server.ssrLoadModule("/lib/recovery/settlePausedExit.ts");
    const { executeFill } = await server.ssrLoadModule("/lib/brokers/simulator.ts");
    const { insertTradeLog } = await server.ssrLoadModule("/lib/portfolio/trade-log-insert.ts");
    const { handleAutomatedStopOut } = await server.ssrLoadModule("/lib/automation/stop-out.ts");
    const { describeSimSignal } = await server.ssrLoadModule("/lib/trade/exit-manager-sim.ts");
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey(), { auth: { persistSession: false } });
    const toRow = (r) => ({ ...r, qty: n(r.qty), entry_price: n(r.entry_price), stop_loss: n(r.stop_loss), take_profit_1: n(r.take_profit_1), master_profit: n(r.master_profit), scale_out_qty: n(r.scale_out_qty) ?? 0, master_qty: n(r.master_qty) ?? 0, runner_qty: n(r.runner_qty) ?? 0, scale_out_fill_price: n(r.scale_out_fill_price), master_fill_price: n(r.master_fill_price), runner_fill_price: n(r.runner_fill_price), applied_stop: n(r.applied_stop), high_water: n(r.high_water) });
    const deps = {
      db,
      executeFill: (userId, f) => executeFill(db, userId, { ...f, assetClass: "us_equity" }),
      insertTradeLog: (row) => insertTradeLog(db, "paper", row),
      stopOut: (userId, a) => handleAutomatedStopOut(db, userId, { ...a, seedFollowOns: false }),
      signalCalled: (row) => describeSimSignal(row),
      now: () => new Date(),
    };
    console.log("\nwrite:");
    for (const x of results) {
      if (x.row.lots != null) {
        console.log(`  ${x.id} ${x.symbol}: SKIPPED (has pyramid lots, which the walk does not model)`);
        continue;
      }
      const row = toRow(x.row);
      try {
        const plan = planSettlement(row, x.walk, end);
        const res = await applySettlement(row, plan, deps);
        console.log(`  ${x.id} ${x.symbol}: ${res.outcome.toUpperCase()} ${res.detail}`);
      } catch (err) {
        exitCode = 1;
        console.log(`  ${x.id} ${x.symbol}: ERROR ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
} catch (err) {
  console.error(`settle-paused-paper-exits: ${err instanceof Error ? err.message : String(err)}`);
  exitCode = 1;
} finally {
  await server.close();
}
process.exit(exitCode);
