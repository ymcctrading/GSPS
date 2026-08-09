/**
 * The feed delay decides verdicts, so it gets the same treatment as any other
 * scoring input: pinned behaviour, and a hold that cannot be argued away.
 */

import { describe, expect, it } from "vitest";
import {
  FREE_EQUITY_FEED_DELAY_MS,
  MAX_EXECUTE_LAG_RATIO,
  decisionLag,
  feedDelayMs,
} from "@/lib/data/latency";
import { applyDataLagHold } from "@/lib/scoring/score";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";
import type { ScanDecision } from "@/lib/types";

const execute = (): ScanDecision => ({
  score: 8,
  outputState: "Execute",
  breakdown: [
    { key: "macroTrend", criterion: "Macro trend context (10yr/5yr/1yr)", pillar: "trend", passed: true, note: "" },
  ],
});

describe("feedDelayMs", () => {
  it("charges the free equity feed its contractual 15 minutes", () => {
    expect(feedDelayMs("us_equity", true, false)).toBe(FREE_EQUITY_FEED_DELAY_MS);
  });

  it("does not charge crypto, which is not delayed", () => {
    expect(feedDelayMs("crypto", true, false)).toBe(0);
  });

  it("does not charge synthetic bars, which have no market behind them", () => {
    expect(feedDelayMs("us_equity", false, false)).toBe(0);
  });

  it("clears once a real-time entitlement is declared", () => {
    expect(feedDelayMs("us_equity", true, true)).toBe(0);
  });
});

describe("decisionLag", () => {
  it("reads 15 minutes as a full bar on the 15-minute execution timeframe", () => {
    const lag = decisionLag("15Min", FREE_EQUITY_FEED_DELAY_MS);
    expect(lag.ratio).toBeCloseTo(1, 10);
    expect(lag.holdsExecute).toBe(true);
    expect(lag.note).toContain("come and gone");
  });

  it("reads the same 15 minutes as noise on a 4-hour bar", () => {
    const lag = decisionLag("4Hour", FREE_EQUITY_FEED_DELAY_MS);
    expect(lag.ratio).toBeCloseTo(1 / 16, 10);
    expect(lag.holdsExecute).toBe(false);
    expect(lag.ratio).toBeLessThan(MAX_EXECUTE_LAG_RATIO);
  });

  it("reports the lag but does not hold when the market is shut", () => {
    // Nothing can have come and gone behind a closed market: the last bar is
    // the last bar there is, and the verdict is a plan for the next session.
    const lag = decisionLag("15Min", FREE_EQUITY_FEED_DELAY_MS, false);
    expect(lag.ratio).toBeCloseTo(1, 10);
    expect(lag.holdsExecute).toBe(false);
    expect(lag.note).toContain("market is closed");
  });

  it("says so plainly when the data is real time", () => {
    const lag = decisionLag("15Min", 0);
    expect(lag.holdsExecute).toBe(false);
    expect(lag.note).toContain("Real-time");
  });
});

describe("applyDataLagHold", () => {
  it("holds Execute at Watch when a trigger can be a full bar stale", () => {
    const held = applyDataLagHold(execute(), decisionLag("15Min", FREE_EQUITY_FEED_DELAY_MS));
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)?.key).toBe("dataLag");
  });

  it("leaves the score alone — the analysis was sound, the data was late", () => {
    const held = applyDataLagHold(execute(), decisionLag("15Min", FREE_EQUITY_FEED_DELAY_MS));
    expect(held.score).toBe(8);
  });

  it("does not touch a verdict the lag is small relative to", () => {
    const kept = applyDataLagHold(execute(), decisionLag("4Hour", FREE_EQUITY_FEED_DELAY_MS));
    expect(kept.outputState).toBe("Execute");
    expect(kept.breakdown).toHaveLength(1);
  });

  it("does not promote anything — a Watch stays a Watch", () => {
    const watch: ScanDecision = { ...execute(), outputState: "Watch" };
    expect(applyDataLagHold(watch, decisionLag("15Min", 0)).outputState).toBe("Watch");
  });

  it("publishes the lag as the reason, not the trade-plan wording", () => {
    const held = applyDataLagHold(execute(), decisionLag("15Min", FREE_EQUITY_FEED_DELAY_MS));
    const note = toPublicScoreSummary(held).stateNote;
    expect(note).toContain("behind the market");
    expect(note).not.toContain("trade plan");
  });
});
