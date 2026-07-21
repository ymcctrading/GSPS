import { describe, it, expect } from "vitest";
import { scanTicker } from "@/lib/scanTicker";
import { runMeanReversionScan, MAX_SLOTS } from "./meanReversion";
import { can, Tier } from "@/lib/tiers";

describe("scanTicker", () => {
  it("returns a decision with a valid outputState for a known symbol", async () => {
    const res = await scanTicker("AAPL");
    expect(res.symbol).toBe("AAPL");
    expect(["Execute", "Watch", "Reject"]).toContain(res.decision.outputState);
    // A rejected setup must never carry a tactical layer.
    if (res.decision.outputState === "Reject") {
      expect(res.tactical).toBeUndefined();
    }
  });

  it("is deterministic for the same symbol (mock provider)", async () => {
    const a = await scanTicker("SPY");
    const b = await scanTicker("SPY");
    expect(a.decision.outputState).toBe(b.decision.outputState);
    expect(a.decision.score).toBe(b.decision.score);
  });

  it("only produces Execute when the Strat gate passed and score >= 8", async () => {
    const res = await scanTicker("NVDA");
    if (res.decision.outputState === "Execute") {
      expect(res.decision.stratGatePassed).toBe(true);
      expect(res.decision.score).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("runMeanReversionScan", () => {
  it("never returns more than 15 slots per side", async () => {
    const payload = await runMeanReversionScan();
    expect(payload.bullishReversions.length).toBeLessThanOrEqual(MAX_SLOTS);
    expect(payload.bearishReversions.length).toBeLessThanOrEqual(MAX_SLOTS);
  });

  it("sorts each block by score descending", async () => {
    const payload = await runMeanReversionScan();
    for (const block of [payload.bullishReversions, payload.bearishReversions]) {
      for (let i = 1; i < block.length; i++) {
        expect(block[i - 1].decision.score).toBeGreaterThanOrEqual(
          block[i].decision.score
        );
      }
    }
  });
});

describe("tier entitlements", () => {
  it("gates automated execution to System Mastery only", () => {
    expect(can(Tier.PRACTICE, "automated_execution")).toBe(false);
    expect(can(Tier.INVESTOR_MODE, "automated_execution")).toBe(false);
    expect(can(Tier.SYSTEM_MASTERY, "automated_execution")).toBe(true);
  });

  it("gives all tiers core charts", () => {
    expect(can(Tier.PRACTICE, "core_charts")).toBe(true);
  });

  it("gates the 15 setups to Investor Mode and above", () => {
    expect(can(Tier.STANDARD, "mean_reversion_setups")).toBe(false);
    expect(can(Tier.INVESTOR_MODE, "mean_reversion_setups")).toBe(true);
  });
});
