import { describe, expect, it } from "vitest";
import { buildTransitionKey, decideTransition, type MonitorState } from "@/lib/entitlements/monitor";

const T0 = new Date("2026-08-26T14:00:00Z");
const MIN = 60_000;

function at(offsetMs: number): Date {
  return new Date(T0.getTime() + offsetMs);
}

describe("decideTransition", () => {
  it("creates a brand-new monitor without notifying, even if born directly into EXECUTE", () => {
    const decision = decideTransition({
      priorState: null,
      priorEvaluatedAt: null,
      candidateState: "EXECUTE",
      candidateEvaluatedAt: T0,
      lastExecuteAt: null,
      cooldownMs: 15 * MIN,
    });
    expect(decision).toEqual({ apply: true, isNewMonitor: true, isTransition: false, notify: false });
  });

  it("refreshes without a transition when the state hasn't changed", () => {
    const decision = decideTransition({
      priorState: "WATCH",
      priorEvaluatedAt: T0,
      candidateState: "WATCH",
      candidateEvaluatedAt: at(MIN),
      lastExecuteAt: null,
      cooldownMs: 15 * MIN,
    });
    expect(decision).toEqual({ apply: true, isNewMonitor: false, isTransition: false, notify: false });
  });

  it("notifies on a confirmed WATCH -> EXECUTE transition with no prior EXECUTE history", () => {
    const decision = decideTransition({
      priorState: "WATCH",
      priorEvaluatedAt: T0,
      candidateState: "EXECUTE",
      candidateEvaluatedAt: at(MIN),
      lastExecuteAt: null,
      cooldownMs: 15 * MIN,
    });
    expect(decision).toEqual({ apply: true, isNewMonitor: false, isTransition: true, notify: true });
  });

  it("does not notify on EXECUTE -> WATCH (leaving Execute is not the alerted direction)", () => {
    const decision = decideTransition({
      priorState: "EXECUTE",
      priorEvaluatedAt: T0,
      candidateState: "WATCH",
      candidateEvaluatedAt: at(MIN),
      lastExecuteAt: T0,
      cooldownMs: 15 * MIN,
    });
    expect(decision).toEqual({ apply: true, isNewMonitor: false, isTransition: true, notify: false });
  });

  it("notifies on a tracked setup breaking (WATCH -> INVALIDATED)", () => {
    const decision = decideTransition({
      priorState: "WATCH",
      priorEvaluatedAt: T0,
      candidateState: "INVALIDATED",
      candidateEvaluatedAt: at(MIN),
      lastExecuteAt: null,
      cooldownMs: 15 * MIN,
    });
    expect(decision).toEqual({ apply: true, isNewMonitor: false, isTransition: true, notify: true });
  });

  it("notifies on a held setup breaking (EXECUTE -> INVALIDATED)", () => {
    const decision = decideTransition({
      priorState: "EXECUTE",
      priorEvaluatedAt: T0,
      candidateState: "INVALIDATED",
      candidateEvaluatedAt: at(MIN),
      lastExecuteAt: T0,
      cooldownMs: 15 * MIN,
    });
    expect(decision).toEqual({ apply: true, isNewMonitor: false, isTransition: true, notify: true });
  });

  it("applies but does not notify on WATCH -> NO_SETUP / EXPIRED (the setup didn't break, it just wasn't reconfirmed)", () => {
    for (const target of ["NO_SETUP", "EXPIRED"] as MonitorState[]) {
      const decision = decideTransition({
        priorState: "WATCH",
        priorEvaluatedAt: T0,
        candidateState: target,
        candidateEvaluatedAt: at(MIN),
        lastExecuteAt: null,
        cooldownMs: 15 * MIN,
      });
      expect(decision).toEqual({ apply: true, isNewMonitor: false, isTransition: true, notify: false });
    }
  });

  it("rejects an out-of-order (stale) evaluation regardless of the states involved", () => {
    const decision = decideTransition({
      priorState: "INVALIDATED",
      priorEvaluatedAt: at(10 * MIN),
      candidateState: "EXECUTE",
      candidateEvaluatedAt: at(5 * MIN), // earlier than priorEvaluatedAt
      lastExecuteAt: null,
      cooldownMs: 15 * MIN,
    });
    expect(decision).toEqual({ apply: false, reason: "stale_evaluation" });
  });

  it("a newer invalidation is never overwritten by an evaluation timestamped before it", () => {
    // Simulates two evaluations racing: an EXECUTE read from an older scan
    // arrives after a newer INVALIDATED read already landed.
    const decision = decideTransition({
      priorState: "INVALIDATED",
      priorEvaluatedAt: at(20 * MIN),
      candidateState: "EXECUTE",
      candidateEvaluatedAt: at(10 * MIN),
      lastExecuteAt: null,
      cooldownMs: 15 * MIN,
    });
    expect(decision.apply).toBe(false);
  });

  it("suppresses a WATCH -> EXECUTE flap within the cooldown window", () => {
    const decision = decideTransition({
      priorState: "WATCH",
      priorEvaluatedAt: at(10 * MIN),
      candidateState: "EXECUTE",
      candidateEvaluatedAt: at(12 * MIN), // 2 minutes after leaving EXECUTE
      lastExecuteAt: at(10 * MIN), // left EXECUTE 2 minutes ago
      cooldownMs: 15 * MIN,
    });
    expect(decision).toEqual({ apply: false, reason: "cooldown" });
  });

  it("allows WATCH -> EXECUTE once the cooldown window has elapsed", () => {
    const decision = decideTransition({
      priorState: "WATCH",
      priorEvaluatedAt: at(10 * MIN),
      candidateState: "EXECUTE",
      candidateEvaluatedAt: at(26 * MIN), // 16 minutes after leaving EXECUTE
      lastExecuteAt: at(10 * MIN),
      cooldownMs: 15 * MIN,
    });
    expect(decision).toEqual({ apply: true, isNewMonitor: false, isTransition: true, notify: true });
  });

  it("re-arms after a full INVALIDATED -> WATCH -> EXECUTE cycle", () => {
    // Leaving EXECUTE, going through INVALIDATED, and coming back is a
    // fresh WATCH with no EXECUTE history yet -- no cooldown applies and it
    // notifies again on reconfirmation, per "a new valid transition".
    const backToWatch = decideTransition({
      priorState: "INVALIDATED",
      priorEvaluatedAt: at(30 * MIN),
      candidateState: "WATCH",
      candidateEvaluatedAt: at(40 * MIN),
      lastExecuteAt: at(10 * MIN),
      cooldownMs: 15 * MIN,
    });
    expect(backToWatch).toEqual({ apply: true, isNewMonitor: false, isTransition: true, notify: false });

    const reconfirmed = decideTransition({
      priorState: "WATCH",
      priorEvaluatedAt: at(40 * MIN),
      candidateState: "EXECUTE",
      candidateEvaluatedAt: at(41 * MIN),
      // A real store would recompute lastExecuteAt from the monitor's own
      // transition history; the still-old EXECUTE from 10min ago has long
      // since cleared the cooldown by this point regardless.
      lastExecuteAt: at(10 * MIN),
      cooldownMs: 15 * MIN,
    });
    expect(reconfirmed).toEqual({ apply: true, isNewMonitor: false, isTransition: true, notify: true });
  });
});

describe("buildTransitionKey", () => {
  it("is stable for the same logical evaluation and differs across any varied input", () => {
    const base = { profileId: "p1", symbol: "aapl", evaluationId: "exec-1", candidateState: "EXECUTE" as const };
    expect(buildTransitionKey(base)).toBe(buildTransitionKey({ ...base }));
    expect(buildTransitionKey(base)).toBe(buildTransitionKey({ ...base, symbol: "AAPL" })); // case-insensitive

    expect(buildTransitionKey(base)).not.toBe(buildTransitionKey({ ...base, profileId: "p2" }));
    expect(buildTransitionKey(base)).not.toBe(buildTransitionKey({ ...base, symbol: "TSLA" }));
    expect(buildTransitionKey(base)).not.toBe(buildTransitionKey({ ...base, evaluationId: "exec-2" }));
    expect(buildTransitionKey(base)).not.toBe(buildTransitionKey({ ...base, candidateState: "WATCH" }));
  });
});
