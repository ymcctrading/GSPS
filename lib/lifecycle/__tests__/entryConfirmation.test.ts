import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  advanceEntryConfirmation,
  entryReady,
  freshEntryConfirmation,
  replayEntryConfirmation,
} from "@/lib/lifecycle/entryConfirmation";

const bar = (t: string, o: number, h: number, l: number, c: number): Bar => ({
  t,
  o,
  h,
  l,
  c,
  v: 1000,
});

describe("entry confirmation — bullish break/retest/confirm", () => {
  it("requires all four stages, each on a later bar, before entryReady", () => {
    const rule = { direction: "bullish" as const, entryTrigger: 100 };
    let evidence = freshEntryConfirmation();
    expect(entryReady(evidence)).toBe(false);

    // Bar 1: touches the zone but doesn't close through it -- setup-state only.
    evidence = advanceEntryConfirmation(evidence, rule, bar("t1", 99, 100.2, 98.8, 99.5));
    expect(evidence.touchedAt).toBe("t1");
    expect(evidence.breakOrSweepAt).toBeNull();
    expect(entryReady(evidence)).toBe(false);

    // Bar 2: closes beyond the trigger -- the break.
    evidence = advanceEntryConfirmation(evidence, rule, bar("t2", 100, 101.5, 100, 101.2));
    expect(evidence.breakOrSweepAt).toBe("t2");
    expect(entryReady(evidence)).toBe(false);

    // Bar 3: comes back down through the trigger -- the retest. Still not ready.
    evidence = advanceEntryConfirmation(evidence, rule, bar("t3", 101, 101.1, 99.7, 100.1));
    expect(evidence.retestAt).toBe("t3");
    expect(evidence.retestPrice).toBe(99.7);
    expect(entryReady(evidence)).toBe(false);

    // Bar 4: closes above the retest bar's low -- confirmation. Now ready.
    evidence = advanceEntryConfirmation(evidence, rule, bar("t4", 100.2, 101.8, 100.1, 101.6));
    expect(evidence.confirmationMoveAt).toBe("t4");
    expect(entryReady(evidence)).toBe(true);
  });

  it("never lets a single bar satisfy two stages (no touch+break collapse)", () => {
    const rule = { direction: "bullish" as const, entryTrigger: 100 };
    // One bar that both touches and closes through the trigger.
    const evidence = advanceEntryConfirmation(
      freshEntryConfirmation(),
      rule,
      bar("t1", 99, 101, 98.8, 100.9),
    );
    expect(evidence.touchedAt).toBe("t1");
    // Break requires a bar strictly AFTER the touch bar.
    expect(evidence.breakOrSweepAt).toBeNull();
  });

  it("an indicator flip / initial break alone can never produce entryReady", () => {
    const rule = { direction: "bullish" as const, entryTrigger: 100 };
    const evidence = replayEntryConfirmation(rule, [
      bar("t1", 99, 100.5, 98.5, 100.4),
      bar("t2", 100.5, 102, 100.4, 101.8),
    ]);
    expect(evidence.breakOrSweepAt).not.toBeNull();
    expect(entryReady(evidence)).toBe(false);
  });
});

describe("entry confirmation — bearish", () => {
  it("mirrors the bullish rule for a breakdown-retest-fail", () => {
    const rule = { direction: "bearish" as const, entryTrigger: 50 };
    const evidence = replayEntryConfirmation(rule, [
      bar("t1", 50.5, 50.6, 49.8, 50.2), // touch
      bar("t2", 50.1, 50.1, 48.5, 48.9), // break (close < 50)
      bar("t3", 49, 50.3, 48.9, 49.9), // retest (high back to/through 50)
      bar("t4", 49.8, 49.9, 48.2, 48.4), // confirmation (close < retest bar's high 50.3)
    ]);
    expect(entryReady(evidence)).toBe(true);
  });
});
