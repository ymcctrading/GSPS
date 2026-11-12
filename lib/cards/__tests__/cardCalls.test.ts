import { describe, expect, it } from "vitest";
import { buildCards, timedCards, walkCardCall, CARD_KINDS, CARD_MODES, CARD_WINDOW_BARS, type CardCall } from "@/lib/cards/cardCalls";
import { evaluateRsiReversal } from "@/lib/strategies/rsiReversal";
import { GOOD_CALL_MAX_SESSIONS } from "@/lib/shadow/goodCall";
import type { Bar } from "@/lib/types";

/** A daily bar on the n-th weekday-ish date after 2025-01-01 (05:00Z, New York midnight). */
function day(n: number, o: number, h: number, l: number, c: number): Bar {
  return { t: new Date(Date.UTC(2025, 0, 1 + n, 5)).toISOString(), o, h, l, c, v: 1_000_000 };
}

/** A long decline, then one up bar: RSI(14) crosses back above 30 on the last bar. */
function rsiCrossSeries(): Bar[] {
  const bars: Bar[] = [];
  let p = 200;
  for (let i = 0; i < 260; i++) {
    const drift = i < 230 ? 0.05 * Math.sin(i / 3) : -1.2;
    const o = p;
    p = p + drift;
    bars.push(day(i, o, Math.max(o, p) + 0.3, Math.min(o, p) - 0.3, p));
  }
  // the turn
  const o = p;
  for (let k = 0; k < 6; k++) {
    const last = bars[bars.length - 1];
    const c = last.c + 2.5;
    bars.push(day(bars.length, last.c, c + 0.2, last.c - 0.2, c));
    if (evaluateRsiReversal(bars.slice(-CARD_WINDOW_BARS))) break;
  }
  void o;
  return bars;
}

describe("buildCards", () => {
  it("arms the RSI reversal's own long card on the last completed bar", () => {
    const bars = rsiCrossSeries();
    const want = evaluateRsiReversal(bars.slice(-CARD_WINDOW_BARS));
    expect(want?.direction).toBe("bullish");
    const cards = buildCards("TEST", bars, ["rsiReversal"]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: "rsiReversal", symbol: "TEST", entry: want!.entry, stop: want!.stopLoss, tp1: want!.takeProfit1 });
    expect(cards[0].signalDate).toBe(bars[bars.length - 1].t.slice(0, 10));
  });

  it("builds nothing from no bars, and never a VWAP card (intraday only)", () => {
    expect(buildCards("TEST", [])).toEqual([]);
    expect(CARD_MODES).not.toContain("vwap");
  });
});

describe("timedCards (the RSI card on a Rule 10 day)", () => {
  /** Flat bars on fixed New York dates, so only the rule's holiday dates can fire. */
  const flat = (dates: string[]): Bar[] => dates.map((d) => ({ t: `${d}T05:00:00.000Z`, o: 100, h: 101, l: 99, c: 100, v: 1 }));
  const card = (signalDate: string, kind: CardCall["kind"] = "rsiReversal"): CardCall => ({
    kind, symbol: "TEST", signalDate, entry: 101, stop: 97, tp1: 105, signalClose: 100,
  });

  it("copies the RSI card, levels unchanged, when its signal bar is a Rule 10 day", () => {
    const h = flat(["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24"]);
    expect(timedCards([card("2026-12-24")], h)).toEqual([{ ...card("2026-12-24"), kind: "rsiReversalTimed" }]);
  });

  it("gives nothing on a day the rule does not hold, for another kind, or on a history ending elsewhere", () => {
    const quiet = flat(["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20"]);
    expect(timedCards([card("2026-08-20")], quiet)).toEqual([]);
    const h = flat(["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24"]);
    expect(timedCards([card("2026-12-24", "donchian")], h)).toEqual([]);
    expect(timedCards([card("2026-12-23")], h)).toEqual([]);
    expect(timedCards([card("2026-12-24")], [])).toEqual([]);
  });

  it("is recorded every night beside the modes' kinds", () => {
    expect(CARD_KINDS).toEqual([...CARD_MODES, "rsiReversalTimed", "edgeBottom", "rangeLow", "rangeBreakout"]);
  });
});

describe("walkCardCall (buy stop for the next session only)", () => {
  const card = { signalDate: "2025-01-10", entry: 100, stop: 96, tp1: 106 };
  const sig = 9; // day(9) is 2025-01-10
  it("is pending until the next session is in", () => {
    expect(walkCardCall(card, [day(sig, 99, 100, 97, 99)])).toEqual({ call: "pending", fill: null, session: null });
  });
  it("never fills when the next session stays under the entry", () => {
    const r = walkCardCall(card, [day(sig, 99, 100, 97, 99), day(sig + 1, 99, 99.9, 98, 99), day(sig + 2, 99, 120, 98, 119)]);
    expect(r).toMatchObject({ call: "no_fill", fill: null, session: "2025-01-11" });
  });
  it("fills at the entry, or the open when it gaps through, then TP1 first is a good call", () => {
    const r = walkCardCall(card, [day(sig + 1, 99, 101, 98, 100.5), day(sig + 2, 101, 106.5, 100, 105), day(sig + 3, 105, 105, 90, 91)]);
    expect(r).toMatchObject({ call: "good", fill: 100 });
    const gap = walkCardCall(card, [day(sig + 1, 102, 103, 101, 102.5), day(sig + 2, 102, 103, 95, 96)]);
    expect(gap).toMatchObject({ call: "bad", fill: 102 });
  });
  it("counts a fill bar that touches the stop as a bad call", () => {
    expect(walkCardCall(card, [day(sig + 1, 99, 101, 95, 96)])).toMatchObject({ call: "bad", fill: 100 });
  });
  it("is a no fill when the session opens beyond TP1 or under the stop", () => {
    expect(walkCardCall(card, [day(sig + 1, 107, 108, 106, 107)]).call).toBe("no_fill");
  });
  it("stays open while neither level is touched", () => {
    expect(walkCardCall(card, [day(sig + 1, 99, 101, 98, 100.5), day(sig + 2, 100, 103, 99, 102)])).toMatchObject({ call: "open", fill: 100 });
  });
  it("scales the levels by a split after the card, and reports the fill in the card's own prices", () => {
    // 2-for-1 after the card: the signal bar now reads 49.5 where it closed at 99.
    const split = { ...card, signalClose: 99 };
    const bars = [day(sig, 49.5, 50, 48.5, 49.5), day(sig + 1, 49.5, 50.5, 49, 50.2), day(sig + 2, 50.2, 53.1, 50, 53)];
    expect(walkCardCall(split, bars)).toMatchObject({ call: "good", fill: 100 });
    // Unscaled, the same bars would never reach the 100 entry.
    expect(walkCardCall(card, bars).call).toBe("no_fill");
  });
  it("ignores a sub-cent drift in the signal close", () => {
    const drift = { ...card, signalClose: 99.05 };
    const r = walkCardCall(drift, [day(sig, 99, 100, 97, 99), day(sig + 1, 99, 101, 98, 100.5), day(sig + 2, 101, 106.5, 100, 105)]);
    expect(r).toMatchObject({ call: "good", fill: 100 });
  });
  it("is unresolved once the cap has passed with neither level touched", () => {
    const bars = [day(sig + 1, 99, 101, 98, 100.5)];
    for (let i = 2; i <= GOOD_CALL_MAX_SESSIONS + 2; i++) bars.push(day(sig + i, 100, 103, 99, 101));
    expect(walkCardCall(card, bars)).toMatchObject({ call: "unresolved", fill: 100 });
    expect(walkCardCall(card, bars.slice(0, GOOD_CALL_MAX_SESSIONS)).call).toBe("open");
  });
});

describe("walkCardCall by the card's order", () => {
  const card = { signalDate: "2025-01-10", entry: 100, stop: 96, tp1: 106 };
  const sig = 9; // day(9) is 2025-01-10
  it("buys at the open between the stop and TP1, the entry being only the last close", () => {
    const r = walkCardCall(card, [day(sig, 99, 100, 97, 100), day(sig + 1, 101, 107, 100.5, 106.5)], "buyAtOpen");
    expect(r).toEqual({ call: "good", fill: 101, session: "2025-01-11" });
    expect(walkCardCall(card, [day(sig + 1, 95, 99, 94, 98)], "buyAtOpen").call).toBe("no_fill");
    expect(walkCardCall(card, [day(sig + 1, 107, 108, 105, 107)], "buyAtOpen").call).toBe("no_fill");
    // The stop on the fill bar is a bad call (the open fill is read from the bar's open on).
    expect(walkCardCall(card, [day(sig + 1, 99, 100, 95, 96)], "buyAtOpen")).toMatchObject({ call: "bad", fill: 99 });
  });
  it("buys a limit at the open at or under it, else at the entry when the low reaches it, else no fill", () => {
    expect(walkCardCall(card, [day(sig + 1, 99, 107, 98, 106)], "buyLimit")).toMatchObject({ call: "good", fill: 99 });
    expect(walkCardCall(card, [day(sig + 1, 102, 103, 99.5, 102), day(sig + 2, 102, 106, 101, 105)], "buyLimit")).toMatchObject({
      call: "good",
      fill: 100,
    });
    expect(walkCardCall(card, [day(sig + 1, 102, 104, 100.5, 103)], "buyLimit").call).toBe("no_fill");
    expect(walkCardCall(card, [day(sig + 1, 95, 99, 94, 98)], "buyLimit").call).toBe("no_fill");
  });
  it("keeps the buy stop as the default", () => {
    expect(walkCardCall(card, [day(sig + 1, 99, 99.9, 98, 99)]).call).toBe("no_fill");
    expect(walkCardCall(card, [day(sig + 1, 99, 99.9, 98, 99)], "buyAtOpen").call).toBe("open");
  });
});
