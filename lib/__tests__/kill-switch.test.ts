/**
 * The global kill switch.
 *
 * The property under test is the failure direction: trading cannot be halted
 * by a typo, and — just as important during an incident — it cannot be
 * re-enabled by one either.
 */

import { afterEach, describe, expect, it } from "vitest";
import { killSwitchRefusal, tradingDisabled } from "@/lib/trade/kill-switch";

const ORIGINAL = process.env.TRADING_DISABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TRADING_DISABLED;
  else process.env.TRADING_DISABLED = ORIGINAL;
});

describe("tradingDisabled", () => {
  it("is off when the variable is unset", () => {
    delete process.env.TRADING_DISABLED;
    expect(tradingDisabled()).toBe(false);
  });

  it("is on for 'true', whatever its case or padding", () => {
    for (const value of ["true", "TRUE", "True", "  true  "]) {
      process.env.TRADING_DISABLED = value;
      expect(tradingDisabled()).toBe(true);
    }
  });

  it("stays off for anything that isn't 'true'", () => {
    // "1", "yes" and "on" all read as intent to disable, and none of them do.
    // That is deliberate: the switch is explicit or it is not thrown.
    for (const value of ["", "1", "yes", "on", "false", "disabled"]) {
      process.env.TRADING_DISABLED = value;
      expect(tradingDisabled()).toBe(false);
    }
  });
});

describe("killSwitchRefusal", () => {
  it("returns null while trading is enabled", () => {
    delete process.env.TRADING_DISABLED;
    expect(killSwitchRefusal()).toBeNull();
  });

  it("returns a coded refusal when trading is halted", () => {
    process.env.TRADING_DISABLED = "true";
    const refusal = killSwitchRefusal();

    expect(refusal?.code).toBe("trading_disabled");
    // The user needs to know their existing positions weren't touched. The
    // simulator fills synchronously, so a refusal is genuinely all-or-nothing:
    // there is no accepted-but-unfilled order left in limbo behind it.
    expect(refusal?.error).toMatch(/positions and resting orders .* are untouched/);
  });
});
