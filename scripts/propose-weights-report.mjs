/**
 * Runs `proposeWeights()` (lib/backtest/propose-weights.ts) against a real,
 * chronologically-split replay, and reports its proposal against the current
 * hand-set stopgap weights in lib/scoring/weights.ts.
 *
 * This exists because `/api/backtest` deliberately does not expose per-trade
 * criteria data (see its `?trades=1` doc comment — the trimmed list it returns
 * has no `criteriaPassed`), so a real weight study has to run in this checkout
 * against live Alpaca bars, the same way `replay-report.mjs` does.
 *
 * Usage:
 *   node scripts/propose-weights-report.mjs --symbols SPY,AAPL,AMD,TSLA,MSFT,NVDA --timeframe 15Min --targetR 2
 *   node scripts/propose-weights-report.mjs --since 2026-06-15   # hold the period still
 *
 * Requires ALPACA_API_KEY / ALPACA_API_SECRET (see .env.example) — refuses to
 * propose from synthetic bars, same as replay-report.mjs.
 */

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    symbols: ["SPY", "AAPL", "AMD", "TSLA", "MSFT", "NVDA"],
    timeframe: "15Min",
    targetR: 2,
    since: null,
    out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split("=");
    const value = inline ?? argv[++i];
    switch (flag) {
      case "--symbols":
        args.symbols = value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
        break;
      case "--timeframe": args.timeframe = value; break;
      case "--targetR": args.targetR = Number(value); break;
      case "--since": args.since = value; break;
      case "--out": args.out = value; break;
      default:
        throw new Error(`Unknown argument '${flag}'.`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const server = await createServer({
    configFile: false,
    root,
    resolve: { alias: { "@": root } },
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });

  let payload;
  try {
    const { collectRun } = await server.ssrLoadModule("/lib/backtest/run.ts");
    const { proposeWeights, MIN_TRADES_PER_HALF } = await server.ssrLoadModule(
      "/lib/backtest/propose-weights.ts",
    );
    const { DEFAULT_CRITERION_WEIGHTS, CRITERION_KEYS, EXECUTE_SCORE_THRESHOLD, WATCH_SCORE_THRESHOLD } =
      await server.ssrLoadModule("/lib/scoring/weights.ts");

    process.stderr.write(
      `Replaying ${args.symbols.join(", ")} on ${args.timeframe} at ${args.targetR}R for a weight study…\n`,
    );
    const run = await collectRun({
      symbols: args.symbols,
      timeframe: args.timeframe,
      targetR: args.targetR,
      ...(args.since ? { since: args.since } : {}),
    });

    if (!run.live) {
      process.stderr.write(
        `\nRefusing to propose from synthetic bars (source '${run.source}'). Configure ALPACA_API_KEY ` +
          `and ALPACA_API_SECRET and run this again.\n`,
      );
      process.exitCode = 1;
      return;
    }

    const trades = run.overall.trades;
    const proposal = proposeWeights(trades, { current: DEFAULT_CRITERION_WEIGHTS });

    payload = {
      source: run.source,
      live: run.live,
      timeframe: run.timeframe,
      targetR: run.targetR,
      symbols: run.symbols,
      window: run.window,
      totalTrades: trades.length,
      minTradesPerHalf: MIN_TRADES_PER_HALF,
      currentWeights: DEFAULT_CRITERION_WEIGHTS,
      currentThresholds: { EXECUTE_SCORE_THRESHOLD, WATCH_SCORE_THRESHOLD },
      proposal,
    };
  } finally {
    await server.close();
  }

  const out = JSON.stringify(payload, null, 2);
  if (args.out) {
    await writeFile(path.resolve(root, args.out), out, "utf8");
    process.stderr.write(`\nWrote ${args.out}\n`);
  } else {
    process.stdout.write(out + "\n");
  }

  if (payload.proposal.refusal) {
    process.stderr.write(`\nNo proposal: ${payload.proposal.refusal}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exitCode = 1;
});
