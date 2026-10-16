/**
 * Q30 (owner, 2026-10-16) and NONGANN #8: the demo account trades Guided
 * Mode's plans as they are. No A/B "arms" that move its caps, no favourite
 * symbol picked by win rate, and no quiet-day buys into open positions (Gann
 * adds only to a winner, on a crossing; `lib/gann/pyramid.ts` says automated
 * adds are not placed yet).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as demo from "@/lib/demo/auto-trade";

const src = readFileSync("lib/demo/auto-trade.ts", "utf8");

describe("the demo auto-trader follows Guided Mode only", () => {
  it("has no strategy arms and no favourite symbol", () => {
    expect("pickArm" in demo).toBe(false);
    expect(src).not.toMatch(/armAdjustedCaps|computeFavoriteSymbol|favoriteFirst|trade_logs/);
  });

  it("places no quiet-day adds into open positions", () => {
    expect(src).not.toMatch(/runQuietDayDca|DCA_BUDGET_FRACTION/);
  });
});
