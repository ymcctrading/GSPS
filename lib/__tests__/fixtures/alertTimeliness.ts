import type { AlertTimeliness } from "@/lib/scanner/intraday";

/**
 * The timing a live scan records on an alert, for tests: a delayed equity
 * feed by default, the newest 15-minute candle closed `delayMinutes` before
 * `evaluatedAt` (so it was just usable when evaluated).
 */
export function alertTimeliness(evaluatedAt: Date, over: Partial<AlertTimeliness> = {}): AlertTimeliness {
  const feed = over.feed ?? "delayed";
  const delayMs = over.delayMs ?? (feed === "realtime" ? 0 : 15 * 60_000);
  const asOf = new Date(evaluatedAt.getTime() - Math.max(delayMs, 60_000));
  const actionable = over.actionable ?? false;
  return {
    feed,
    delayMs,
    dataAsOf: asOf.toISOString(),
    usableAt: new Date(asOf.getTime() + delayMs).toISOString(),
    receivedAt: null,
    evaluatedAt: evaluatedAt.toISOString(),
    dataAgeSeconds: Math.round((evaluatedAt.getTime() - asOf.getTime()) / 1000),
    heldForDelay: feed !== "realtime",
    actionable,
    authorizationId: actionable ? "test-authorization" : null,
    planKey: null,
    barMinutes: 15,
    ...over,
  };
}
