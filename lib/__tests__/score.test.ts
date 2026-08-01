import { describe, expect, it } from "vitest";
import type { ScanDecision, StratPattern } from "@/lib/types";
import { applyReversionConfirmation } from "@/lib/scoring/score";

function pattern(name: StratPattern["name"]): StratPattern {
  return {
    name,
    direction: "bullish",
    triggerPrice: 100,
    stopPrice: 95,
    description: "",
  };
}

function executeDecision(): ScanDecision {
  return { score: 8, outputState: "Execute", breakdown: [] };
}

describe("applyReversionConfirmation", () => {
  it("downgrades a bare 2-2 Execute to Watch when unconfirmed", () => {
    const result = applyReversionConfirmation(executeDecision(), pattern("2-2"), false, false);
    expect(result.outputState).toBe("Watch");
    expect(result.breakdown.at(-1)?.criterion).toMatch(/Reversion confirmation/);
  });

  it("downgrades a bare 2-2 when only one of momentum/S-R confirms", () => {
    expect(applyReversionConfirmation(executeDecision(), pattern("2-2"), true, false).outputState).toBe("Watch");
    expect(applyReversionConfirmation(executeDecision(), pattern("2-2"), false, true).outputState).toBe("Watch");
  });

  it("leaves a bare 2-2 as Execute when both momentum and S/R confirm", () => {
    const result = applyReversionConfirmation(executeDecision(), pattern("2-2"), true, true);
    expect(result.outputState).toBe("Execute");
    expect(result.breakdown).toHaveLength(0);
  });

  it("does not touch a compound pattern (1-2-2) even when unconfirmed", () => {
    const result = applyReversionConfirmation(executeDecision(), pattern("1-2-2"), false, false);
    expect(result.outputState).toBe("Execute");
  });

  it("does not upgrade a 2-2 that is already Watch/Reject", () => {
    const watch: ScanDecision = { score: 5, outputState: "Watch", breakdown: [] };
    expect(applyReversionConfirmation(watch, pattern("2-2"), false, false).outputState).toBe("Watch");
  });

  it("passes through a null pattern unchanged", () => {
    const result = applyReversionConfirmation(executeDecision(), null, false, false);
    expect(result.outputState).toBe("Execute");
  });
});
