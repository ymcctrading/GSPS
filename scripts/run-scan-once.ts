/**
 * One-shot scan runner for local dev / manual verification:
 *   npm run scan:once
 * Prints the top bullish/bearish reversion setups from the mock provider.
 */
import { runMeanReversionScan } from "@/lib/scanner/meanReversion";

async function main() {
  const payload = await runMeanReversionScan();
  console.log(`Generated at: ${payload.generatedAt}`);
  console.log(`Universe: ${payload.universe.join(", ")}`);
  console.log(`Summary:`, payload.summary);
  console.log(
    `\nBullish (${payload.bullishReversions.length}):`,
    payload.bullishReversions.map((r) => `${r.symbol}(${r.decision.score})`).join(", ") || "—"
  );
  console.log(
    `Bearish (${payload.bearishReversions.length}):`,
    payload.bearishReversions.map((r) => `${r.symbol}(${r.decision.score})`).join(", ") || "—"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
