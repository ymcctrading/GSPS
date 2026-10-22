/**
 * The committed replay runs that measure production's own rules, for showing
 * beside the forward test (Q2 item 5).
 *
 * Only a production-faithful cell belongs here: `usePlanLevels`, the
 * reaction entry and Gann's exits (`{"usePlanLevels":true,"entryRule":
 * "reaction","exitRule":"gann"}`, AGENTS.md "Replay accounting"). A cell on
 * other rules measured something no account trades. Hand-transcribed from
 * the run's JSON in `docs/replay-runs/`, the same manual discipline as
 * `lib/shadow/compare.ts`'s baseline: a person adds a row when a run is
 * committed. Read on the server (`/api/past-scans` returns it), since a client
 * file must not import from lib/backtest (client-bundle-boundary test).
 */

export interface ReplayScope {
  trades: number;
  expectancyR: number;
  ci95: [number, number];
  winRate: number;
}

export interface ReplayReference {
  /** The run's file under `docs/replay-runs/`. */
  file: string;
  strategyVersion: string;
  timeframe: string;
  symbols: number;
  window: { from: string; to: string };
  execute: ReplayScope;
  watch: ReplayScope;
  all: ReplayScope;
}

export const PRODUCTION_REPLAY_RUNS: readonly ReplayReference[] = [
  {
    file: "2026-10-21-766sym-15Min-production-cell.json",
    strategyVersion: "2026-10-21-gann-decade-month-et",
    timeframe: "15Min",
    symbols: 832,
    window: { from: "2026-08-24", to: "2026-10-21" },
    execute: { trades: 271, expectancyR: -0.037, ci95: [-0.146, 0.086], winRate: 0.162 },
    watch: { trades: 1223, expectancyR: 0.005, ci95: [-0.039, 0.051], winRate: 0.139 },
    all: { trades: 3482, expectancyR: 0.048, ci95: [0.018, 0.078], winRate: 0.128 },
  },
];
