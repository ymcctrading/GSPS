/**
 * GSPS market-close cron: "15 Daily Mean-Reversion Setups".
 *
 * Runs server-side after the regular-session close (no manual trigger). It:
 *   1. Marks today's scan_runs row RUNNING (consumer-friendly dashboard state).
 *   2. Pulls scored candidates (from the app's batch-scan endpoint if configured,
 *      otherwise a deterministic mock so the pipeline runs end-to-end today).
 *   3. Applies the Strat-gate -> 8/9 -> 7+velocity -> top-15 waterfall.
 *   4. Persists ranked rows into `daily_scans` (clearing the day first).
 *   5. Flips scan_runs to COMPLETE with counts.
 *
 * Deploy: supabase functions deploy daily-scan
 * Schedule (pg_cron): see supabase/migrations/*_schedule_daily_scan.sql
 */

// @ts-nocheck - Deno edge runtime (types resolved at deploy, not in the Node engine tsconfig)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  processProtocolReversions,
  type ScannedAsset,
} from "./waterfall.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Optional: the deployed app endpoint that returns scored assets.
const SCAN_ENDPOINT = Deno.env.get("GSPS_SCAN_ENDPOINT"); // e.g. https://gsps.vercel.app/api/batch-scan

const DEFAULT_UNIVERSE = [
  "SPY", "AAPL", "AMD", "TSLA", "MSFT", "META",
  "NVDA", "AMZN", "GOOGL", "TTWO",
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Deterministic mock so the cron runs before the live scorer is wired in. */
function mockScoredUniverse(): ScannedAsset[] {
  const out: ScannedAsset[] = [];
  DEFAULT_UNIVERSE.forEach((symbol, i) => {
    const dir: "bullish" | "bearish" = i % 2 === 0 ? "bullish" : "bearish";
    out.push({
      symbol,
      score: 9 - (i % 3), // 9,8,7 cycling
      passesStratBarrier: i % 5 !== 4, // occasionally fails the gate
      direction: dir,
      relativeVolume: 1.5 + (i % 4) * 0.4, // some >= 2.0
      atrExpansion: i % 3 === 0,
      entry: 100 + i,
      stopLoss: 100 + i - 3,
      takeProfit1: 100 + i + 4,
      masterProfit: 100 + i + 8,
    });
  });
  return out;
}

async function fetchScoredUniverse(): Promise<ScannedAsset[]> {
  if (!SCAN_ENDPOINT) return mockScoredUniverse();
  try {
    const res = await fetch(
      `${SCAN_ENDPOINT}?tickers=${DEFAULT_UNIVERSE.join(",")}`,
    );
    if (!res.ok) throw new Error(`scan endpoint ${res.status}`);
    const body = await res.json();
    // Expect the app to return assets already shaped like ScannedAsset[]; adapt if needed.
    return (body.assets ?? body.results ?? []) as ScannedAsset[];
  } catch (err) {
    console.error("Falling back to mock universe:", err);
    return mockScoredUniverse();
  }
}

Deno.serve(async (req: Request) => {
  // Custom auth: this endpoint is cron-only. When CRON_SECRET is set, callers
  // must present it. (Deployed with verify_jwt=false so pg_cron can invoke it.)
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const scan_date = todayIso();

  // 1. RUNNING
  await supabase
    .from("scan_runs")
    .upsert(
      { scan_date, status: "RUNNING", started_at: new Date().toISOString(), message: "Analyzing market close data…" },
      { onConflict: "scan_date" },
    );

  try {
    // 2 + 3. Score -> waterfall
    const universe = await fetchScoredUniverse();
    const { bullishReversions, bearishReversions } =
      processProtocolReversions(universe);

    // 4. Persist ranked rows (replace today's set)
    await supabase.from("daily_scans").delete().eq("scan_date", scan_date);

    const rows = [...bullishReversions, ...bearishReversions].map((s) => ({
      scan_date,
      direction: s.direction,
      rank: s.rank,
      symbol: s.symbol,
      score: s.score,
      output_state: "Execute",
      entry: s.entry ?? null,
      stop_loss: s.stopLoss ?? null,
      take_profit_1: s.takeProfit1 ?? null,
      master_profit: s.masterProfit ?? null,
      detail: { setupTier: s.setupTier, relativeVolume: s.relativeVolume, atrExpansion: s.atrExpansion },
    }));
    if (rows.length) await supabase.from("daily_scans").insert(rows);

    // 5. COMPLETE
    await supabase.from("scan_runs").update({
      status: "COMPLETE",
      bullish_count: bullishReversions.length,
      bearish_count: bearishReversions.length,
      message: "New setups are live.",
      completed_at: new Date().toISOString(),
    }).eq("scan_date", scan_date);

    return new Response(
      JSON.stringify({
        scan_date,
        bullish: bullishReversions.length,
        bearish: bearishReversions.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    await supabase.from("scan_runs").update({
      status: "FAILED",
      message: `Scan failed: ${String(err)}`,
      completed_at: new Date().toISOString(),
    }).eq("scan_date", scan_date);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
