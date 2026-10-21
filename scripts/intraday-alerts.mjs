/**
 * Replays the live intraday alerts (lib/backtest/replayIntradayAlerts.ts) over
 * the scan universe and prints three cells as JSON between BEGIN/END markers:
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
    const { STRATEGY_VERSION } = await server.ssrLoadModule("/lib/backtest/strategyVersion.ts");
    const provider = getMarketDataProvider();
    if (!provider.isLive) throw new Error(`Market data provider "${provider.name}" is not live; refusing to replay synthetic bars.`);

    const fixed = new Set(WATCHLIST.filter((w) => w.kind === "equity").map((w) => w.symbol));
    let universe = [...new Set([...LARGE_CAP_UNIVERSE.map((s) => s.toUpperCase()), ...fixed])];
    if (limit) universe = [...universe.slice(0, limit), ...[...fixed].filter((s) => !universe.slice(0, limit).includes(s))];
    const windowStart = new Date(Date.now() - days * 86_400_000);
    const pause = async (began, requests) => {
      const wait = (requests * 60_000) / requestsPerMinute - (Date.now() - began);
      if (wait > 0) await sleep(wait);
    };
    const skipped = [];

    // Pass 1: each symbol's daily plan per session and its evening focus reading.
    const market = await run.fetchSeries("SPY", "15Min", true).catch(() => undefined);
    const universeStrength = await run.fetchReplayUniverseStrength();
    const perSymbol = new Map();
    for (const symbol of universe) {
      const began = Date.now();
      try {
        const series = await run.fetchSeries(symbol, "15Min", true);
        const plans = new Map();
        replay(symbol, series.bars, { targetR: 2, ...run.replaySeriesOptions(series, market, universeStrength), sessionPlans: plans, plansOnly: true });
        const readings = new Map();
        for (const date of plans.keys()) {
          const cutoff = new Date(Date.parse(`${date}T00:00:00Z`) - FOCUS_HISTORY_DAYS * 86_400_000).toISOString();
          const sessions = series.daily.filter((b) => b.t.slice(0, 10) <= date && b.t >= cutoff);
          if (sessions.length === 0 || sessions[sessions.length - 1].t.slice(0, 10) !== date) continue;
          const reading = readFocus(symbol, sessions, asDailyPlanLevels(plans.get(date)));
          if (reading) readings.set(date, reading);
        }
        perSymbol.set(symbol, { daily: series.daily, plans, readings });
      } catch (err) {
        skipped.push({ symbol, reason: `pass 1: ${err instanceof Error ? err.message : String(err)}` });
      }
      await pause(began, 4);
    }

    // The sessions, in order, and each one's focus list from the evening before.
    const dates = [...new Set([...perSymbol.values()].flatMap((s) => [...s.plans.keys()]))].sort();
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
    const baselineFrom = new Date(windowStart.getTime() - 14 * 86_400_000);
    for (const [symbol, s] of perSymbol) {
      const began = Date.now();
      try {
        const bars = await provider.fetchBars(symbol, "5Min", baselineFrom, null, "us_equity", 20000);
        const listed = new Set([...walked].filter((d) => fixed.has(symbol) || focusFor.get(d)?.has(symbol)));
        planHeld.push(
          ...replayIntradayAlerts({ symbol, kind: "equity", bars, dailyBars: s.daily, plans: s.plans, sessions: walked, signals: new Set(["plan_level_held"]) }),
        );
        if (listed.size > 0) {
          for (const t of replayIntradayAlerts({ symbol, kind: "equity", bars, dailyBars: s.daily, plans: s.plans, sessions: listed })) {
            alerts.push({ ...t, inFocus: focusFor.get(t.session)?.has(symbol) ?? false, inFixed: fixed.has(symbol) });
          }
        }
      } catch (err) {
        skipped.push({ symbol, reason: `pass 2: ${err instanceof Error ? err.message : String(err)}` });
      }
      await pause(began, 1);
    }

    const out = {
      generatedAt: new Date().toISOString(),
      strategyVersion: STRATEGY_VERSION,
      symbols: perSymbol.size,
      sessions: { from: [...walked][0] ?? null, to: [...walked].pop() ?? null, count: walked.size },
      focusSize: FOCUS_SIZE,
      fixed: [...fixed],
      skipped,
      cells: {
        planLevelHeld: summariseAlertTrades(planHeld),
        planLevelHeldExecute: summariseAlertTrades(planHeld.filter((t) => t.planVerdict === "Execute")),
        planLevelHeldWatch: summariseAlertTrades(planHeld.filter((t) => t.planVerdict === "Watch")),
        focus: summariseAlertTrades(alerts.filter((t) => t.inFocus)),
        fixed: summariseAlertTrades(alerts.filter((t) => t.inFixed)),
        focusOnly: summariseAlertTrades(alerts.filter((t) => t.inFocus && !t.inFixed)),
      },
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
