/**
 * GSPS — reports the busiest minute of Alpaca data requests a scan saw to the
 * usage meter (`alpaca_rate`, lib/ops/usageLimits.ts). The readings come from
 * Alpaca's own rate-limit headers (`takeRateUse`, lib/data/http.ts), which are
 * per account, so a reading from any instance is the account's.
 *
 * Called after a scan's response (the market and intraday scans, the heaviest
 * callers), never on a user's path. Fails quietly: a meter outage never stops
 * a scan.
 */

import { ALPACA_PROVIDER_LABEL, takeRateUse } from "@/lib/data/http";
import { createServiceClient } from "@/lib/supabase/server";
import { USAGE_METERS } from "@/lib/ops/usageLimits";
import { meterStatus, recordUsage, saveReading, sendDueAlerts } from "@/lib/ops/usageStore";

export async function reportAlpacaRateUse(source: string, now: Date = new Date()): Promise<void> {
  const use = takeRateUse(ALPACA_PROVIDER_LABEL);
  if (!use) return;
  const limit = use.limit ?? USAGE_METERS.alpaca_rate.limit;
  const peak = Math.min(Number.isFinite(use.peak) ? use.peak : limit, limit);
  try {
    const service = createServiceClient();
    const recorded = await recordUsage(service, {
      meter: "alpaca_rate",
      units: peak,
      key: `alpaca-${source}-${now.toISOString()}-${Math.random().toString(36).slice(2, 8)}`,
      detail: { source, limit, throttled: use.throttled },
      occurredAt: now,
    });
    if (recorded.error) throw new Error(recorded.error);
    const status = await meterStatus(service, "alpaca_rate", now);
    await saveReading(service, status, now);
    await sendDueAlerts(service, status, now);
  } catch (err) {
    console.error("[usage] Alpaca rate reading not recorded:", err instanceof Error ? err.message : String(err));
  }
}
