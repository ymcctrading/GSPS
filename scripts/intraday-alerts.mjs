/**
 * Replays the live intraday alerts (lib/backtest/replayIntradayAlerts.ts) over
 * the scan universe and prints its cells as JSON between BEGIN/END markers:
 *
 * - `planLevelHeld`: every `plan_level_held` alert, on every symbol and
 *   session, read against the daily plan the daily scan priced for that
 *   session (rebuilt by `replay(..., { sessionPlans, plansOnly })`).
 * - `focus` / `fixed` / `focusOnly`: every alert the scan shows, on the
 *   evening focus list's top names for the session (rebuilt each evening
 *   from the completed sessions and the day's plan, as
 *   app/api/intraday-focus/route.ts builds it), on the fixed list's single
 *   stocks (`WATCHLIST`, kind equity), and on focus names not on the fixed
 *   list, over the same sessions.
 *
 * Research only: nothing here feeds a verdict.
 *
 *   node scripts/intraday-alerts.mjs --days 60 --limit 20
 *
 * In CI it rides the universe-backtest workflow with `universe:
 * intraday-alerts` (a workflow must be on the default branch to be
 * dispatched). Run it outside US market hours: the backtest key shares the
 * production scans' rate limit.
 */

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Calendar days of daily history the evening focus job reads (its HISTORY_DAYS). */
const FOCUS_HISTORY_DAYS = 150;
/** No single vendor request may hold the run longer than this. */
const REQUEST_TIMEOUT_MS = 120_000;
/** Five-minute bars a vendor page returns at most. */
const BARS_PER_PAGE = 10_000;

function withTimeout(promise, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)), REQUEST_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** `requestsPerMinute` 0 runs unpaced. */
export async function runIntradayAlerts({ days = 60, limit = null, requestsPerMinute = 60 } = {}) {
  const server = await createServer({
    configFile: false,
    root,
    resolve: { alias: { "@": root } },
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });
  try {
    const run = await server.ssrLoadModule("/lib/backtest/run.ts");
    const { replay } = await server.ssrLoadModule("/lib/backtest/replay.ts");
    const { replayIntradayAlerts, asDailyPlanLevels } = await server.ssrLoadModule("/lib/backtest/replayIntradayAlerts.ts");
    const { summariseAlertTrades } = await server.ssrLoadModule("/lib/backtest/alertSummary.ts");
    const { readFocus, rankFocus, FOCUS_SIZE } = await server.ssrLoadModule("/lib/scanner/focusList.ts");
    const { WATCHLIST } = await server.ssrLoadModule("/lib/scanner/intraday.ts");
    const { LARGE_CAP_UNIVERSE } = await server.ssrLoadModule("/lib/scan/large-cap-universe.ts");
    const { getMarketDataProvider } = await server.ssrLoadModule("/lib/data/provider.ts");
    const { loadInstrumentReferenceHistory, splitAdjustedSharesAsOf } = await server.ssrLoadModule("/lib/data/instrumentReference.ts");
    const { STRATEGY_VERSION } = await server.ssrLoadModule("/lib/backtest/strategyVersion.ts");
    const provider = getMarketDataProvider();
    if (!provider.isLive) throw new Error(`Market data provider "${provider.name}" is not live; refusing to replay synthetic bars.`);

    const fixed = new Set(WATCHLIST.filter((w) => w.kind === "equity").map((w) => w.symbol));
    let universe = [...new Set([...LARGE_CAP_UNIVERSE.map((s) => s.toUpperCase()), ...fixed])];
    if (limit) universe = [...universe.slice(0, limit), ...[...fixed].filter((s) => !universe.slice(0, limit).includes(s))];
    const windowStart = new Date(Date.now() - days * 86_400_000);
    const pause = async (began, requests) => {
      if (!(requestsPerMinute > 0)) return;
      const wait = (requests * 60_000) / requestsPerMinute - (Date.now() - began);
      if (wait > 0) await sleep(wait);
    };
    const skipped = [];
    const references = await loadInstrumentReferenceHistory(universe).catch((err) => {
      skipped.push({ symbol: "(instrument reference)", reason: err instanceof Error ? err.message : String(err) });
      return new Map();
    });
    // Without share counts the D2 distribution-week exit is unread on every symbol.
    const referenceNote = references.size === 0 ? "No instrument reference was read, so the D2 distribution-week exit (shares outstanding) was not walked." : null;

    // Pass 1: each symbol's daily plan per session and its evening focus reading.
    const market = await withTimeout(run.fetchSeries("SPY", "15Min", true), "SPY").catch(() => undefined);
    // Without the universe read P3(c) stays unread, as it does live when that read fails.
    const universeStrength = await withTimeout(run.fetchReplayUniverseStrength(), "universe strength").catch((err) => {
      skipped.push({ symbol: "(universe strength)", reason: err instanceof Error ? err.message : String(err) });
      return null;
    });
    const perSymbol = new Map();
    for (const symbol of universe) {
      const began = Date.now();
      try {
        const series = await withTimeout(run.fetchSeries(symbol, "15Min", true), symbol);
        const reference = references.get(symbol);
        const instrument = reference ? { sharesHistory: reference.history, inception: reference.reference.inception } : undefined;
        const plans = new Map();
        replay(symbol, series.bars, { targetR: 2, ...run.replaySeriesOptions(series, market, universeStrength), instrument, sessionPlans: plans, plansOnly: true });
        // The sessions are the daily bars' (Eastern) dates; the 15-minute
        // bars' UTC dates would add a Saturday for Friday's after-hours bars in winter.
        const sessionDates = series.daily.map((b) => b.t.slice(0, 10)).filter((d) => plans.has(d));
        // The evening's reading reads the plan the next session stands on: the
        // focus job runs after the close, when the daily scan has priced the
        // session just ended (that plan reads sessions through this evening, no later).
        const readings = new Map();
        for (let i = 0; i + 1 < sessionDates.length; i++) {
          const evening = sessionDates[i];
          const cutoff = new Date(Date.parse(`${evening}T00:00:00Z`) - FOCUS_HISTORY_DAYS * 86_400_000).toISOString();
          const sessions = series.daily.filter((b) => b.t.slice(0, 10) <= evening && b.t >= cutoff);
          if (sessions.length === 0 || sessions[sessions.length - 1].t.slice(0, 10) !== evening) continue;
          const reading = readFocus(symbol, sessions, asDailyPlanLevels(plans.get(sessionDates[i + 1])));
          if (reading) readings.set(evening, reading);
        }
        const sharesOn = instrument ? (date) => splitAdjustedSharesAsOf(instrument.sharesHistory, date) : undefined;
        perSymbol.set(symbol, { daily: series.daily, monthly: series.monthly ?? [], sharesOn, plans, sessionDates, readings });
      } catch (err) {
        skipped.push({ symbol, reason: `pass 1: ${err instanceof Error ? err.message : String(err)}` });
      }
      await pause(began, 4);
      if (perSymbol.size % 50 === 0) console.log(`[pass 1] ${perSymbol.size}/${universe.length} symbols, ${skipped.length} skipped`);
    }

    // The sessions, in order, and each one's focus list from the evening before.
    const dates = [...new Set([...perSymbol.values()].flatMap((s) => s.sessionDates))].sort();
    const focusFor = new Map();
    for (let i = 1; i < dates.length; i++) {
      const evening = dates[i - 1];
      const readings = [];
      for (const s of perSymbol.values()) {
        const r = s.readings.get(evening);
        if (r) readings.push(r);
      }
      focusFor.set(dates[i], new Set(rankFocus(readings, FOCUS_SIZE).map((r) => r.symbol)));
    }
    const walked = new Set([...focusFor.keys()].filter((d) => d >= windowStart.toISOString().slice(0, 10)));

    // Pass 2: the session's alerts on five-minute bars.
    const planHeld = [];
    const alerts = [];
    const refused = { planLevelHeld: {}, listed: {} };
    const addRefused = (into, from) => {
      for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n;
    };
    const baselineFrom = new Date(windowStart.getTime() - 14 * 86_400_000);
    let done = 0;
    for (const [symbol, s] of perSymbol) {
      const began = Date.now();
      let pages = 1;
      try {
        const bars = await withTimeout(provider.fetchBars(symbol, "5Min", baselineFrom, null, "us_equity", 20000), `${symbol} 5Min`);
        pages = Math.max(1, Math.ceil(bars.length / BARS_PER_PAGE));
        const listed = new Set([...walked].filter((d) => fixed.has(symbol) || focusFor.get(d)?.has(symbol)));
        const common = { symbol, kind: "equity", bars, dailyBars: s.daily, monthlyBars: s.monthly, sharesOn: s.sharesOn, plans: s.plans };
        const held = replayIntradayAlerts({ ...common, sessions: walked, signals: new Set(["plan_level_held"]) });
        planHeld.push(...held.trades);
        addRefused(refused.planLevelHeld, held.refused);
        if (listed.size > 0) {
          const all = replayIntradayAlerts({ ...common, sessions: listed });
          addRefused(refused.listed, all.refused);
          for (const t of all.trades) {
            alerts.push({ ...t, inFocus: focusFor.get(t.session)?.has(symbol) ?? false, inFixed: fixed.has(symbol) });
          }
        }
      } catch (err) {
        skipped.push({ symbol, reason: `pass 2: ${err instanceof Error ? err.message : String(err)}` });
      }
      await pause(began, pages);
      done += 1;
      if (done % 50 === 0) console.log(`[pass 2] ${done}/${perSymbol.size} symbols, ${planHeld.length} plan_level_held trades`);
    }

    const out = {
      generatedAt: new Date().toISOString(),
      strategyVersion: STRATEGY_VERSION,
      symbols: perSymbol.size,
      sessions: { from: [...walked][0] ?? null, to: [...walked].pop() ?? null, count: walked.size },
      focusSize: FOCUS_SIZE,
      fixed: [...fixed],
      skipped,
      refused,
      notes: [
        "Universe differences from live, by design: the live system scan times at most 50 symbols, members' watched symbols first, so its focus list can be cut short; this replay times the whole focus list.",
        "planLevelHeld walks every symbol in the universe; live shows that alert only on the symbols it scans.",
        limit ? `--limit ${limit}: the focus list was ranked among ${universe.length} symbols only, so it is not comparable with live.` : null,
        "Fills are the open three five-minute bars after the next one (the feed delay); the daily plan carries no data-lag hold.",
        referenceNote,
      ].filter(Boolean),
      cells: {
        planLevelHeld: summariseAlertTrades(planHeld),
        planLevelHeldExecute: summariseAlertTrades(planHeld.filter((t) => t.planVerdict === "Execute")),
        planLevelHeldWatch: summariseAlertTrades(planHeld.filter((t) => t.planVerdict === "Watch")),
        focus: summariseAlertTrades(alerts.filter((t) => t.inFocus)),
        fixed: summariseAlertTrades(alerts.filter((t) => t.inFixed)),
        focusOnly: summariseAlertTrades(alerts.filter((t) => t.inFocus && !t.inFixed)),
      },
      // Each plan_level_held trade, for diagnosis: few enough to list.
      planLevelHeldTrades: planHeld.map((t) => ({
        symbol: t.symbol,
        session: t.session,
        verdict: t.planVerdict,
        entryKind: t.entryKind ?? null,
        direction: t.direction,
        entry: t.entry,
        stop: t.stop,
        target: t.target,
        exit: t.exitPrice,
        r: t.rMultiple,
        bestR: t.bestR,
        exitReason: t.exitReason,
        barsHeld: t.barsHeld,
      })),
    };
    console.log("=== BEGIN intraday-alerts.json ===");
    console.log(JSON.stringify(out, null, 2));
    console.log("=== END intraday-alerts.json ===");
    return out;
  } finally {
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const limit = arg("limit", null);
  runIntradayAlerts({ days: Number(arg("days", "60")), limit: limit ? Number(limit) : null }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
