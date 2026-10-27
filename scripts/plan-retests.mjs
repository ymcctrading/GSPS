/**
 * For one symbol: the daily plan the scan showed each session over the last
 * `days` calendar days (rebuilt by `replay(..., { sessionPlans, plansOnly })`),
 * grouped into setups (consecutive sessions with the same side and entry), and
 * for each setup whether price came back to the entry while the plan stood,
 * reached TP1 first without coming back, or did neither. Research only.
 *
 * In CI it rides the universe-backtest workflow with `universe: plan-retests:SYM`.
 */

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function runPlanRetests({ symbol = "SPY", days = 90 } = {}) {
  const server = await createServer({
    configFile: false, root, resolve: { alias: { "@": root } },
    server: { middlewareMode: true }, appType: "custom", logLevel: "warn",
  });
  try {
    const run = await server.ssrLoadModule("/lib/backtest/run.ts");
    const { replay } = await server.ssrLoadModule("/lib/backtest/replay.ts");
    const { getMarketDataProvider } = await server.ssrLoadModule("/lib/data/provider.ts");
    if (!getMarketDataProvider().isLive && !process.env.PLAN_RETESTS_SYNTHETIC) throw new Error("provider not live; refusing synthetic bars");
    const series = await run.fetchSeries(symbol, "15Min", true);
    const market = symbol === "SPY" ? series : await run.fetchSeries("SPY", "15Min", true);
    const universeStrength = await run.fetchReplayUniverseStrength().catch(() => null);
    const plans = new Map();
    replay(symbol, series.bars, { targetR: 2, ...run.replaySeriesOptions(series, market, universeStrength), sessionPlans: plans, plansOnly: true });

    const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const daily = series.daily;
    const idx = new Map(daily.map((b, i) => [b.t.slice(0, 10), i]));
    const sessions = daily.map((b) => b.t.slice(0, 10)).filter((d) => d >= start);
    const rows = [];
    for (const d of sessions) {
      const i = idx.get(d);
      const p = plans.get(d) ?? null;
      const prevClose = i > 0 ? daily[i - 1].c : null;
      rows.push({ date: d, o: daily[i].o, h: daily[i].h, l: daily[i].l, c: daily[i].c, prevClose, plan: p });
    }
    // Setups: consecutive sessions with the same side and entry.
    const setups = [];
    for (const r of rows) {
      if (!r.plan) continue;
      const key = `${r.plan.direction}:${r.plan.entry.toFixed(2)}`;
      const last = setups[setups.length - 1];
      if (last && last.key === key && last.lastDate === rows[rows.indexOf(r) - 1]?.date) {
        last.lastDate = r.date; last.sessions++; last.verdicts.add(r.plan.verdict);
      } else {
        setups.push({ key, firstDate: r.date, lastDate: r.date, sessions: 1, verdicts: new Set([r.plan.verdict]), plan: r.plan, shownAtPrice: r.prevClose });
      }
    }
    const out = setups.map((s) => {
      const long = s.plan.direction === "up";
      const from = idx.get(s.firstDate), to = idx.get(s.lastDate);
      // Reached: the session's range (with the gap from the prior close) holds the entry.
      const reaches = (i) => {
        const b = daily[i], pc = i > 0 ? daily[i - 1].c : b.o;
        return Math.min(b.l, pc) <= s.plan.entry && s.plan.entry <= Math.max(b.h, pc);
      };
      // Past the entry already (the reaction buy waiting for a pullback) or short of it (a crossing still to be made).
      const shownPast = s.shownAtPrice === null ? null : long ? s.shownAtPrice > s.plan.entry : s.shownAtPrice < s.plan.entry;
      let touched = null, tp1First = null, stopFirst = null;
      for (let i = from; i <= to; i++) {
        const b = daily[i];
        if (reaches(i)) { touched = b.t.slice(0, 10); break; }
        if (!tp1First && (long ? b.h >= s.plan.tp1 : b.l <= s.plan.tp1)) tp1First = b.t.slice(0, 10);
        if (!stopFirst && (long ? b.l <= s.plan.stop : b.h >= s.plan.stop)) stopFirst = b.t.slice(0, 10);
      }
      let laterTouch = null;
      if (!touched) for (let i = to + 1; i < Math.min(daily.length, to + 21); i++) {
        if (reaches(i)) { laterTouch = daily[i].t.slice(0, 10); break; }
      }
      const shown = s.shownAtPrice;
      return {
        firstDate: s.firstDate, lastDate: s.lastDate, sessions: s.sessions, verdicts: [...s.verdicts],
        side: long ? "long" : "short", entryKind: s.plan.entryKind ?? null, awaitsCrossing: s.plan.awaitsCrossing,
        entry: s.plan.entry, stop: s.plan.stop, tp1: s.plan.tp1, mtp: s.plan.mtp,
        priceWhenShown: shown, distancePct: shown ? +(((shown - s.plan.entry) / s.plan.entry) * 100).toFixed(2) : null,
        shownPastEntry: shownPast, reachedEntry: touched, tp1BeforeTouch: tp1First, stopBeforeTouch: stopFirst, touchAfterPlanGone: laterTouch,
      };
    });
    console.log("=== BEGIN plan-retests.json ===");
    console.log(JSON.stringify({ symbol, start, sessions: sessions.length, sessionsWithPlan: rows.filter((r) => r.plan).length, setups: out, daily: rows.map(({ plan, ...r }) => ({ ...r, verdict: plan?.verdict ?? null, side: plan?.direction ?? null, entry: plan?.entry ?? null, stop: plan?.stop ?? null, tp1: plan?.tp1 ?? null })) }));
    console.log("=== END plan-retests.json ===");
  } finally {
    await server.close();
  }
}
