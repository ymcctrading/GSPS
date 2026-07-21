/**
 * Brokerage factory. Phase 0 hard-locks to paper mode. Any attempt to select
 * live mode throws — live execution is intentionally not implemented until a
 * licensed partner + compliance sign-off exist (Objection O-1 / Q-7).
 */
import type { BrokerageProvider } from "./types";
import { PaperBroker } from "./paperBroker";

let cached: BrokerageProvider | null = null;

export function getBrokerage(): BrokerageProvider {
  if (cached) return cached;
  const mode = process.env.GSPS_BROKERAGE_MODE ?? "paper";
  if (mode !== "paper") {
    throw new Error(
      `GSPS_BROKERAGE_MODE="${mode}" is not available. Live execution is disabled ` +
        `in Phase 0 pending a licensed brokerage partner and compliance sign-off.`
    );
  }
  cached = new PaperBroker();
  return cached;
}

export * from "./types";
