/**
 * The PRD's decision states, derived from the verdict and direction (D-06).
 * Conflict/Wait is Gann's to answer: with the trend when both sides arm (rule
 * 5), Stand Down when in doubt (rule 6), so it never reads as a state of its own.
 */
import { describe, expect, it } from "vitest";
import { decisionStateOf, withDecisionState } from "@/lib/scoring/decisionState";

describe("decision state", () => {
  it("reads an Execute as qualified on its side", () => {
    expect(decisionStateOf("Execute", "bullish")).toBe("qualifiedLong");
    expect(decisionStateOf("Execute", "bearish")).toBe("qualifiedShort");
  });

  it("never qualifies an Execute with no side to take", () => {
    expect(decisionStateOf("Execute", "none")).toBe("standDown");
  });

  it("reads Watch as watch on either side, and Reject as stand down", () => {
    expect(decisionStateOf("Watch", "bearish")).toBe("watch");
    expect(decisionStateOf("Reject", "bullish")).toBe("standDown");
    expect(decisionStateOf("Reject", "none")).toBe("standDown");
  });

  it("attaches the state without moving the verdict or the score", () => {
    const decision = { score: 7, outputState: "Execute" as const, breakdown: [] };
    expect(withDecisionState(decision, "bearish")).toEqual({ ...decision, decisionState: "qualifiedShort" });
  });
});
