import { describe, expect, it } from "vitest";
import { threePoints, crossingLinesFromEntry } from "@/lib/gann/pointScale";
import { sessionCloseAt } from "@/lib/data/timeliness";
import { checkNotificationFreshness } from "@/lib/notifications/freshness";
import { isNoticeTitle } from "@/lib/notifications/intradayBell";
import {
  inPreOpenWindow,
  preOpenBellRow,
  preOpenEvidence,
  preOpenHash,
  preOpenPushMessage,
  preOpenTitle,
  readPreOpenLine,
  readPreOpenLines,
} from "@/lib/notifications/preOpenLines";
import type { DailyPlanLevels } from "@/lib/scanner/intraday";

/**
 * The pre-open notice: a plan's line within the method's 3-point allowance of
 * the prior close, told as of that close and never as a buy.
 */

const plan = (over: Partial<DailyPlanLevels> = {}): DailyPlanLevels => ({
  direction: "up", verdict: "Watch", entry: 301.86, stop: 290, tp1: 320, mtp: 340, awaitsCrossing: true, ...over,
});
const SESSION = "2026-10-26";

describe("readPreOpenLine", () => {
  it("reads TXN's night: the line ahead of the close by less than one allowance", () => {
    const close = 301.86 - threePoints(301.86) / 2;
    const line = readPreOpenLine("TXN", plan(), close, SESSION);
    expect(line).toMatchObject({ symbol: "TXN", line: 301.86, atEntry: true, prevSession: SESSION });
    expect(line!.nearness).toBeCloseTo(0.5, 2);
    expect(line!.points).toBeCloseTo(1.5, 2);
  });

  it("leaves out a line more than one allowance away", () => {
    expect(readPreOpenLine("TXN", plan(), 301.86 - threePoints(301.86) * 1.05, SESSION)).toBeNull();
  });

  it("reads the confirming close when the close crossed the entry but not by 3 points", () => {
    const { confirmingClose } = crossingLinesFromEntry(301.86, "bullish");
    const line = readPreOpenLine("TXN", plan(), 302.5, SESSION);
    expect(line).toMatchObject({ atEntry: false, line: confirmingClose });
  });

  it("has no line once the crossing is made, the stop is broken, or the symbol is crypto", () => {
    expect(readPreOpenLine("TXN", plan({ awaitsCrossing: false }), 300, SESSION)).toBeNull();
    expect(readPreOpenLine("TXN", plan({ stop: 300.5 }), 300, SESSION)).toBeNull();
    expect(readPreOpenLine("BTC/USD", plan(), 300, SESSION)).toBeNull();
    expect(readPreOpenLine("TXN", plan(), null, SESSION)).toBeNull();
  });

  it("mirrors a sell: the line under the close", () => {
    const sell = plan({ direction: "down", entry: 100, stop: 106 });
    const line = readPreOpenLine("XYZ", sell, 100 + threePoints(100) / 3, SESSION);
    expect(line).toMatchObject({ direction: "down", line: 100, atEntry: true });
    expect(line!.nearness).toBeCloseTo(1 / 3, 2);
  });
});

describe("readPreOpenLines", () => {
  it("orders nearest first, skips flagged rows, and Execute leads a tie", () => {
    const plans = new Map<string, DailyPlanLevels>([
      ["AAA", plan({ entry: 100, stop: 95 })],
      ["BBB", plan({ entry: 100, stop: 95, verdict: "Execute" })],
      ["CCC", plan({ entry: 100, stop: 95 })],
      ["DDD", plan({ entry: 100, stop: 95 })],
    ]);
    const a = threePoints(100);
    const closes = new Map([
      ["AAA", { close: 100 - a / 2, session: SESSION }],
      ["BBB", { close: 100 - a / 2, session: SESSION }],
      ["CCC", { close: 100 - a / 4, session: SESSION }],
      ["DDD", { close: 100 - a / 8, session: SESSION }],
    ]);
    expect(readPreOpenLines(plans, closes, new Set(["DDD"])).map((l) => l.symbol)).toEqual(["CCC", "BBB", "AAA"]);
  });
});

describe("inPreOpenWindow", () => {
  it("opens at 8:30 New York time to the open, under daylight and standard time, on trading days", () => {
    expect(inPreOpenWindow(new Date("2026-10-29T12:50:00Z"))).toBe(true); // 8:50 EDT
    expect(inPreOpenWindow(new Date("2026-10-29T13:50:00Z"))).toBe(false); // 9:50 EDT
    expect(inPreOpenWindow(new Date("2026-11-02T13:50:00Z"))).toBe(true); // 8:50 EST
    expect(inPreOpenWindow(new Date("2026-11-02T12:50:00Z"))).toBe(false); // 7:50 EST
    expect(inPreOpenWindow(new Date("2026-10-31T12:50:00Z"))).toBe(false); // Saturday
    expect(inPreOpenWindow(new Date("2026-11-26T13:50:00Z"))).toBe(false); // Thanksgiving
  });
});

describe("freshness and wording (NOTIFY-FRESHNESS-001)", () => {
  const line = readPreOpenLine("TXN", plan(), 300, SESSION)!;
  const evaluatedAt = new Date("2026-10-27T12:50:00Z");
  const evidence = preOpenEvidence(line, { closeAt: sessionCloseAt(SESSION), evaluatedAt, feed: "delayed", delayMs: 15 * 60_000 });

  it("is never actionable before the open, and lapses once its run has passed", () => {
    const f = checkNotificationFreshness(evidence, new Date(evaluatedAt.getTime() + 5_000));
    expect(f).toMatchObject({ disposition: "informational", reason: "delayed_observation" });
    expect(checkNotificationFreshness({ ...evidence, feed: "realtime" }, new Date(evaluatedAt.getTime() + 5_000)).disposition).toBe("informational");
    expect(checkNotificationFreshness(evidence, new Date(evaluatedAt.getTime() + 60 * 60_000)).disposition).toBe("suppress");
    expect(checkNotificationFreshness({ ...evidence, dataAsOf: null }, new Date(evaluatedAt.getTime() + 5_000)).disposition).toBe("suppress");
  });

  it("writes the bell as of the prior close, with no now, no arrival time and no buy", () => {
    expect(checkNotificationFreshness(evidence, new Date(evaluatedAt.getTime() + 5_000)).disposition).toBe("informational");
    const row = preOpenBellRow(line);
    expect(row.title).toBe("TXN buy: Line within reach before the open");
    expect(row.body).toBe(
      "At the Oct 26 close, TXN stood $1.86 (0.6%) under its daily plan's line at 301.86; it closed at 300.00. " +
        `A close at or above ${line.confirmingClose.toFixed(2)} would confirm it, and the entry, 301.86, would then be taken on a pullback. ` +
        "Its price has not been checked since that close. Not a buy yet.",
    );
    expect(row.body).not.toMatch(/\bnow\b|minutes?\b|away\b/i);
    expect(isNoticeTitle(row.title)).toBe(true);
  });

  it("names the lines in one push, as of the close", () => {
    const msg = preOpenPushMessage([line], "2026-10-27");
    expect(msg).toEqual({
      title: "TXN: Line within reach before the open",
      body: "As of the Oct 26 close: TXN buy line 301.86 (closed 300.00). Prices have not been checked since that close. Not a buy yet.",
      url: "/ticker/TXN",
      tag: "preopen-2026-10-27",
    });
    expect(preOpenHash(line, "2026-10-27")).toBe("TXN-preopen_line-bullish-2026-10-27");
    expect(preOpenTitle(line)).toBe("TXN buy: Line within reach before the open");
  });
});
