/**
 * Small-account mechanics — a $450 account either can or cannot execute a
 * plan mechanically, and this must never quietly relax to make the answer
 * "yes".
 */

import { describe, expect, it } from "vitest";
import {
  accountDataProvenanceLabel,
  assessAccountFeasibility,
  exitMechanics,
  riskAutomationAllowed,
} from "@/lib/universe/smallAccount";

describe("exitMechanics", () => {
  it("requires at least 4 whole-share-equivalent units without fractional support", () => {
    expect(exitMechanics(3, false).stagedExitFeasible).toBe(false);
    expect(exitMechanics(3, false).fallback).toBe("all_in_all_out");
    expect(exitMechanics(4, false).stagedExitFeasible).toBe(true);
  });

  it("skips the whole-unit floor when fractional support is confirmed", () => {
    expect(exitMechanics(1.5, true).stagedExitFeasible).toBe(true);
    expect(exitMechanics(1.5, true).fallback).toBe("staged");
  });

  it("rejects a non-positive quantity", () => {
    expect(exitMechanics(0, false).stagedExitFeasible).toBe(false);
  });
});

describe("assessAccountFeasibility", () => {
  const base = {
    settledFunds: 450,
    buyingPower: 450,
    accountType: "cash" as const,
    reliesOnUnsettledFunds: false,
    brokerRestrictions: [] as string[],
    plannedNotionalUsd: 100,
    plannedRiskUsd: 5,
    maxAllocationPct: 25,
  };

  it("passes a plan that fits every check", () => {
    const verdict = assessAccountFeasibility(base);
    expect(verdict.executable).toBe(true);
    expect(verdict.reasons).toEqual([]);
  });

  it("flags allocation that's too large even though risk is within budget", () => {
    const verdict = assessAccountFeasibility({ ...base, plannedNotionalUsd: 300, plannedRiskUsd: 3 });
    expect(verdict.executable).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("allocation"))).toBe(true);
  });

  it("blocks a cash-account plan exceeding settled funds", () => {
    const verdict = assessAccountFeasibility({ ...base, settledFunds: 50 });
    expect(verdict.executable).toBe(false);
  });

  it("blocks T+1-unsettled reliance on a cash account", () => {
    const verdict = assessAccountFeasibility({ ...base, reliesOnUnsettledFunds: true });
    expect(verdict.executable).toBe(false);
  });

  it("allows T+1-unsettled reliance on a margin account", () => {
    const verdict = assessAccountFeasibility({ ...base, accountType: "margin", reliesOnUnsettledFunds: true });
    expect(verdict.reasons.some((r) => r.includes("T+1"))).toBe(false);
  });

  it("blocks when a broker restriction applies", () => {
    const verdict = assessAccountFeasibility({ ...base, brokerRestrictions: ["PDT flag"] });
    expect(verdict.executable).toBe(false);
  });
});

describe("account data provenance", () => {
  it("labels every provenance state", () => {
    expect(accountDataProvenanceLabel("broker_verified")).toMatch(/verified/i);
    expect(accountDataProvenanceLabel("manual")).toMatch(/not broker-verified/i);
    expect(accountDataProvenanceLabel("unavailable")).toBe("Unavailable");
  });

  it("only allows risk automation on broker-verified or live vendor data", () => {
    expect(riskAutomationAllowed("broker_verified")).toBe(true);
    expect(riskAutomationAllowed("vendor_live")).toBe(true);
    expect(riskAutomationAllowed("manual")).toBe(false);
    expect(riskAutomationAllowed("delayed")).toBe(false);
    expect(riskAutomationAllowed("simulated")).toBe(false);
    expect(riskAutomationAllowed("unavailable")).toBe(false);
  });
});
