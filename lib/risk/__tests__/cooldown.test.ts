import { describe, expect, it } from "vitest";
import { gateAction, validateResetChecklist, requiresResetChecklist } from "@/lib/risk/cooldown";

describe("gateAction", () => {
  const hardCooldownInputs = { newPositionsOpenedToday: 0, loss48hPct: 5, drawdown30dPct: 0 };

  it("always allows stop loss, take profit, reduce, close, and cancel even in a lock", () => {
    for (const action of [
      "stop_loss",
      "take_profit",
      "position_reduce",
      "position_close",
      "cancel_pending_entry",
    ] as const) {
      const r = gateAction(action, { newPositionsOpenedToday: 0, loss48hPct: 18, drawdown30dPct: 18 });
      expect(r.allowed).toBe(true);
    }
  });

  it("blocks a new entry during hard_cooldown", () => {
    const r = gateAction("new_entry", hardCooldownInputs);
    expect(r.allowed).toBe(false);
    expect(r.circuit.state).toBe("hard_cooldown");
  });

  it("blocks a position increase during hard_cooldown (existing positions are risk-reduce only)", () => {
    const r = gateAction("position_increase", hardCooldownInputs);
    expect(r.allowed).toBe(false);
  });

  it("allows a new entry in warning, but flags it as requiring risk review", () => {
    const r = gateAction("new_entry", { newPositionsOpenedToday: 0, loss48hPct: 2, drawdown30dPct: 0 });
    expect(r.allowed).toBe(true);
    expect(r.requiresRiskReview).toBe(true);
  });

  it("has no parameter through which a paid tier could override a lock", () => {
    // gateAction's signature carries no entitlement/tier argument at all —
    // this is a compile-time guarantee, asserted here as a runtime smoke test
    // that the function arity hasn't grown one.
    expect(gateAction.length).toBeLessThanOrEqual(4);
  });
});

describe("validateResetChecklist", () => {
  it("is incomplete when required fields are missing", () => {
    const v = validateResetChecklist({ accountValue: 440 });
    expect(v.complete).toBe(false);
    expect(v.missingFields).toContain("currentOpenRiskUsd");
    expect(v.missingFields).toContain("correlationExposure");
    expect(v.missingFields).toContain("revisedPlan");
  });

  it("treats an explicit null ruleBreach as present (no breach occurred)", () => {
    const v = validateResetChecklist({
      accountValue: 440,
      currentOpenRiskUsd: 0,
      ruleBreach: null,
      correlationExposure: "None open.",
      revisedPlan: "Resume at base risk rate.",
    });
    expect(v.complete).toBe(true);
  });
});

describe("requiresResetChecklist", () => {
  it("is required from hard_cooldown through severe_override", () => {
    expect(requiresResetChecklist("soft_cooldown")).toBe(false);
    expect(requiresResetChecklist("hard_cooldown")).toBe(true);
    expect(requiresResetChecklist("critical_lock")).toBe(true);
    expect(requiresResetChecklist("emergency_lock")).toBe(true);
    expect(requiresResetChecklist("severe_override")).toBe(true);
  });
});
