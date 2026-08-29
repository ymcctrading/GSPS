import { describe, expect, it } from "vitest";
import {
  evaluateIntradayEntryGates,
  MAX_INTRADAY_ENTRIES_PER_DAY,
  MAX_INTRADAY_CONCURRENT_POSITIONS,
  MAX_INTRADAY_CONSECUTIVE_LOSSES,
  INTRADAY_DAILY_LOSS_LOCK_PCT,
  type IntradayGateInputs,
} from "@/lib/promotion/pro-intraday";

const clean: IntradayGateInputs = {
  entriesToday: 0,
  openPositions: 0,
  consecutiveLosses: 0,
  realizedPnlTodayUsd: 0,
  equity: 100_000,
};

describe("evaluateIntradayEntryGates", () => {
  it("allows a clean day", () => {
    const r = evaluateIntradayEntryGates(clean);
    expect(r.allowed).toBe(true);
    expect(r.code).toBeNull();
  });

  it("blocks once the entry/day cap is reached", () => {
    const r = evaluateIntradayEntryGates({ ...clean, entriesToday: MAX_INTRADAY_ENTRIES_PER_DAY });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("entry_per_day");
  });

  it("allows one under the entry/day cap", () => {
    const r = evaluateIntradayEntryGates({ ...clean, entriesToday: MAX_INTRADAY_ENTRIES_PER_DAY - 1 });
    expect(r.allowed).toBe(true);
  });

  it("blocks once the concurrent-position cap is reached", () => {
    const r = evaluateIntradayEntryGates({ ...clean, openPositions: MAX_INTRADAY_CONCURRENT_POSITIONS });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("concurrent_position");
  });

  it("blocks once consecutive losses reach the cap", () => {
    const r = evaluateIntradayEntryGates({ ...clean, consecutiveLosses: MAX_INTRADAY_CONSECUTIVE_LOSSES });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("consecutive_loss");
  });

  it("blocks once today's realized loss reaches the daily-loss-lock percentage of equity", () => {
    const equity = 100_000;
    const lossAtThreshold = -(equity * (INTRADAY_DAILY_LOSS_LOCK_PCT / 100));
    const r = evaluateIntradayEntryGates({ ...clean, equity, realizedPnlTodayUsd: lossAtThreshold });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("daily_loss_lock");
  });

  it("does not trip the daily-loss-lock on a profitable day", () => {
    const r = evaluateIntradayEntryGates({ ...clean, realizedPnlTodayUsd: 5000 });
    expect(r.allowed).toBe(true);
  });

  it("does not trip the daily-loss-lock just under the threshold", () => {
    const equity = 100_000;
    const lossJustUnder = -(equity * (INTRADAY_DAILY_LOSS_LOCK_PCT / 100) - 1);
    const r = evaluateIntradayEntryGates({ ...clean, equity, realizedPnlTodayUsd: lossJustUnder });
    expect(r.allowed).toBe(true);
  });

  it("never divides by zero equity", () => {
    const r = evaluateIntradayEntryGates({ ...clean, equity: 0, realizedPnlTodayUsd: -500 });
    expect(r.allowed).toBe(true);
  });

  it("reports the first gate tripped when several would fail", () => {
    const r = evaluateIntradayEntryGates({
      ...clean,
      entriesToday: MAX_INTRADAY_ENTRIES_PER_DAY,
      openPositions: MAX_INTRADAY_CONCURRENT_POSITIONS,
      consecutiveLosses: MAX_INTRADAY_CONSECUTIVE_LOSSES,
    });
    expect(r.code).toBe("entry_per_day");
  });
});
