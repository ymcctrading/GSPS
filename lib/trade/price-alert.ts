/**
 * Pure crossing check for a durable custom price alert (migration 0077),
 * kept separate from app/api/price-alerts/sweep/route.ts so it has a real
 * home for unit coverage — this repo's test config only picks up `.test.ts`
 * under `lib/`, not under `app/api/`.
 */
export function isPriceAlertFired(
  direction: "above" | "below",
  targetPrice: number,
  currentPrice: number,
): boolean {
  return direction === "above" ? currentPrice >= targetPrice : currentPrice <= targetPrice;
}
