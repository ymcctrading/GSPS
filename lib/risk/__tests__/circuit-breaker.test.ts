import { describe, expect, it } from "vitest";
import { resolveState, DEFAULT_CIRCUIT_THRESHOLDS } from "@/lib/risk/circuit-breaker";

describe("resolveState", () => {
  it("is normal with no triggers", () => {
    const d = resolveState({ newPositionsOpenedToday: 1, loss48hPct: 0, drawdown30dPct: 0 });
    expect(d.state).toBe("normal");
    expect(d.newEntriesAllowed).toBe(true);
    expect(d.existingPositionsRestrictedToRiskReduction).toBe(false);
  });

  it("enters entry_pause at 3 new positions in a day", () => {
    const d = resolveState({ newPositionsOpenedToday: 3, loss48hPct: 0, drawdown30dPct: 0 });
    expect(d.state).toBe("entry_pause");
    expect(d.newEntriesAllowed).toBe(false);
  });

  it("enters warning at 2% 48h loss and still allows entries with review", () => {
    const d = resolveState({ newPositionsOpenedToday: 0, loss48hPct: 2, drawdown30dPct: 0 });
    expect(d.state).toBe("warning");
    expect(d.newEntriesAllowed).toBe(true);
    expect(d.newEntryRequiresRiskReview).toBe(true);
  });

  it("enters soft_cooldown at 3% 48h loss, blocking new entries but not existing management", () => {
    const d = resolveState({ newPositionsOpenedToday: 0, loss48hPct: 3, drawdown30dPct: 0 });
    expect(d.state).toBe("soft_cooldown");
    expect(d.newEntriesAllowed).toBe(false);
    expect(d.existingPositionsRestrictedToRiskReduction).toBe(false);
  });

  it("enters hard_cooldown at 5% 48h loss, restricting existing positions to risk reduction", () => {
    const d = resolveState({ newPositionsOpenedToday: 0, loss48hPct: 5, drawdown30dPct: 0 });
    expect(d.state).toBe("hard_cooldown");
    expect(d.existingPositionsRestrictedToRiskReduction).toBe(true);
    expect(d.blockedTradingDaysRemaining).toBe(1);
  });

  it("escalates through critical, emergency, and severe on 30-day drawdown", () => {
    expect(resolveState({ newPositionsOpenedToday: 0, loss48hPct: 0, drawdown30dPct: 8 }).state).toBe(
      "critical_lock",
    );
    expect(resolveState({ newPositionsOpenedToday: 0, loss48hPct: 0, drawdown30dPct: 12 }).state).toBe(
      "emergency_lock",
    );
    expect(resolveState({ newPositionsOpenedToday: 0, loss48hPct: 0, drawdown30dPct: 18 }).state).toBe(
      "severe_override",
    );
  });

  it("returns the most severe state when multiple triggers hold at once", () => {
    const d = resolveState({ newPositionsOpenedToday: 3, loss48hPct: 6, drawdown30dPct: 9 });
    expect(d.state).toBe("critical_lock");
  });

  it("holds a hard_cooldown for its full duration even if the 48h loss recovers", () => {
    const triggeredAt = new Date("2026-08-24T14:00:00Z");
    const d = resolveState(
      { newPositionsOpenedToday: 0, loss48hPct: 0, drawdown30dPct: 0 },
      { state: "hard_cooldown", triggeredAt },
      () => 0, // no trading days elapsed yet
    );
    expect(d.state).toBe("hard_cooldown");
    expect(d.blockedTradingDaysRemaining).toBe(1);
  });

  it("releases a hard_cooldown once its trading-day hold has elapsed and metrics have recovered", () => {
    const triggeredAt = new Date("2026-08-24T14:00:00Z");
    const d = resolveState(
      { newPositionsOpenedToday: 0, loss48hPct: 0, drawdown30dPct: 0 },
      { state: "hard_cooldown", triggeredAt },
      () => 1, // one full trading day has elapsed
    );
    expect(d.state).toBe("normal");
  });

  it("does not let a prior duration hold downgrade a worse fresh read", () => {
    const triggeredAt = new Date("2026-08-24T14:00:00Z");
    const d = resolveState(
      { newPositionsOpenedToday: 0, loss48hPct: 0, drawdown30dPct: 12 },
      { state: "hard_cooldown", triggeredAt },
      () => 0,
    );
    expect(d.state).toBe("emergency_lock");
  });

  it("honors a policy_values-resolved threshold override instead of the code default", () => {
    const tighter = { ...DEFAULT_CIRCUIT_THRESHOLDS, warning48hLossPct: 1 };
    const d = resolveState({ newPositionsOpenedToday: 0, loss48hPct: 1, drawdown30dPct: 0 }, undefined, undefined, tighter);
    expect(d.state).toBe("warning");
    // The code-default threshold (2%) would not have triggered at a 1% loss.
    const withDefault = resolveState({ newPositionsOpenedToday: 0, loss48hPct: 1, drawdown30dPct: 0 });
    expect(withDefault.state).toBe("normal");
  });
});
