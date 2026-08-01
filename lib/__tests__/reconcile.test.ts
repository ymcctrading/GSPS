import { describe, expect, it } from "vitest";
import { classifyExit, computeRealizedPl } from "@/lib/portfolio/reconcile";

describe("classifyExit", () => {
  it("classifies a filled bracket stop leg as stop_loss", () => {
    expect(classifyExit({ type: "stop", order_class: "bracket" })).toBe("stop_loss");
  });

  it("classifies a filled bracket stop_limit leg as stop_loss", () => {
    expect(classifyExit({ type: "stop_limit", order_class: "bracket" })).toBe("stop_loss");
  });

  it("classifies a filled bracket limit leg as tp1", () => {
    expect(classifyExit({ type: "limit", order_class: "bracket" })).toBe("tp1");
  });

  it("classifies a non-bracket order as manual", () => {
    expect(classifyExit({ type: "market", order_class: undefined })).toBe("manual");
    expect(classifyExit({ type: "limit", order_class: undefined })).toBe("manual");
  });
});

describe("computeRealizedPl", () => {
  it("computes long P/L as (exit - entry) * qty", () => {
    expect(computeRealizedPl(100, 115, 10, "long")).toBeCloseTo(150);
    expect(computeRealizedPl(100, 85, 10, "long")).toBeCloseTo(-150);
  });

  it("computes short P/L as (entry - exit) * qty", () => {
    expect(computeRealizedPl(100, 85, 10, "short")).toBeCloseTo(150);
    expect(computeRealizedPl(100, 115, 10, "short")).toBeCloseTo(-150);
  });
});
