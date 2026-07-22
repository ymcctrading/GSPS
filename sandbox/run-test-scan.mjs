/**
 * sandbox/run-test-scan.mjs — SIMULATION ONLY
 * Runs a full test scan against the MOCK engine and prints a report.
 *   node sandbox/run-test-scan.mjs
 */
import { writeFileSync } from "node:fs";
import { scanTicker, selectReversions } from "./scanEngine.mjs";

// Canonical default scan universe (matches batch-route.ts after Correction 03).
const DEFAULT_WATCHLIST = [
  "SPY", "BTC",
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
];

// A larger synthetic universe, only to exercise the top-15 truncation / Tier-2
// fallback in the waterfall.
const STRESS_UNIVERSE = [
  ...DEFAULT_WATCHLIST,
  "AMD", "TTWO", "NFLX", "INTC", "CRM", "ORCL", "ADBE", "QCOM", "AVGO", "MU",
  "PYPL", "SHOP", "UBER", "COIN", "SNOW", "PLTR", "ETH", "SOL", "DIS", "BA",
];

const bar = (n) => "=".repeat(n);
function line(len = 78) { console.log(bar(len)); }

function runScan(label, tickers) {
  console.log("\n" + bar(78));
  console.log(label);
  line();
  const results = tickers.map((t) => scanTicker(t));

  // Raw per-ticker table.
  console.log(
    "TICKER".padEnd(8) + "CLASS".padEnd(8) + "SCORE".padEnd(7) +
    "GATE".padEnd(6) + "DIR".padEnd(9) + "RVOL".padEnd(7) +
    "STATE".padEnd(9) + "ENTRY".padEnd(11) + "SL".padEnd(11) +
    "TP1".padEnd(11) + "MASTER",
  );
  console.log("-".repeat(110));
  for (const r of results) {
    console.log(
      r.ticker.padEnd(8) +
      r.assetClass.padEnd(8) +
      `${r.score}/9`.padEnd(7) +
      (r.passedSniperGate ? "PASS" : "FAIL").padEnd(6) +
      r.direction.padEnd(9) +
      String(r.rvol).padEnd(7) +
      r.decision.outputState.padEnd(9) +
      String(r.entry).padEnd(11) +
      String(r.sl).padEnd(11) +
      String(r.tp1).padEnd(11) +
      String(r.master),
    );
  }

  // Waterfall selection.
  const { bullishReversions, bearishReversions } = selectReversions(results);

  const execute = results.filter((r) => r.decision.outputState === "Execute");
  const watch = results.filter((r) => r.decision.outputState === "Watch");
  const reject = results.filter((r) => r.decision.outputState === "Reject");
  const gateFails = results.filter((r) => !r.passedSniperGate);

  console.log("\n  Summary");
  console.log(`    scanned .............. ${results.length}`);
  console.log(`    sniper-gate failures . ${gateFails.length}`);
  console.log(`    Execute / Watch / Reject . ${execute.length} / ${watch.length} / ${reject.length}`);
  console.log(`    bullishReversions (top 15) . ${bullishReversions.length}` +
    `  -> ${bullishReversions.map((r) => `${r.ticker}(${r.score})`).join(", ") || "none"}`);
  console.log(`    bearishReversions (top 15) . ${bearishReversions.length}` +
    `  -> ${bearishReversions.map((r) => `${r.ticker}(${r.score})`).join(", ") || "none"}`);

  return { label, requestedAt: new Date().toISOString(), tickers, results,
    summary: { execute: execute.length, watch: watch.length, reject: reject.length,
      gateFails: gateFails.length }, bullishReversions, bearishReversions };
}

console.log(bar(78));
console.log("GSPS FULL TEST SCAN  —  ⚠️ SIMULATION (mock engine, synthetic data)");
console.log("Real engine is missing; see review/insights/06. Numbers are illustrative.");
console.log(bar(78));

const out = [];
out.push(runScan("SCAN 1 — Canonical default watchlist (9 assets)", DEFAULT_WATCHLIST));
out.push(runScan("SCAN 2 — Stress universe (29 assets, exercises top-15 waterfall)", STRESS_UNIVERSE));

const outPath = new URL("./last-scan.json", import.meta.url);
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("\n" + bar(78));
console.log("Wrote full JSON payload -> sandbox/last-scan.json");
console.log("⚠️ Reminder: simulated data. Replace the mock engine with real scanTicker.");
console.log(bar(78));
