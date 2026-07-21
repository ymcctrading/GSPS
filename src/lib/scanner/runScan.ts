/**
 * Orchestrates a scan run and updates the shared cache/status so the dashboard
 * always reflects live state (RUNNING -> FRESH / ERROR).
 */
import { runMeanReversionScan } from "./meanReversion";
import { markRunning, markComplete, markError } from "./cache";
import { DEFAULT_WATCHLIST } from "@/config/watchlist";

export async function runScanAndCache(universe: string[] = DEFAULT_WATCHLIST) {
  markRunning();
  try {
    const payload = await runMeanReversionScan(universe);
    markComplete(payload);
    return payload;
  } catch (err) {
    markError(err);
    throw err;
  }
}
