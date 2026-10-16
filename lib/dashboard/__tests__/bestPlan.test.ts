import { describe, expect, it } from "vitest";
import { bestQualifiedSetup } from "@/lib/dashboard/bestPlan";

const row = (symbol: string, outputState: string, score: number) => ({ symbol, outputState, score });

describe("bestQualifiedSetup", () => {
  it("never picks a Reject, however high it scored", () => {
    // The 2026-10-16 case: NEE scored 6 but read Reject (its stop had broken).
    expect(bestQualifiedSetup([row("NEE", "Reject", 6), row("MSFT", "Reject", 4)])).toBeNull();
    expect(bestQualifiedSetup([row("NEE", "Reject", 7), row("QQQ", "Watch", 5)])?.symbol).toBe("QQQ");
  });

  it("puts Execute ahead of Watch, then the higher score", () => {
    const rows = [row("A", "Watch", 6), row("B", "Execute", 6), row("C", "Execute", 7)];
    expect(bestQualifiedSetup(rows)?.symbol).toBe("C");
    expect(bestQualifiedSetup([row("A", "Watch", 6), row("B", "Execute", 6)])?.symbol).toBe("B");
  });
});
