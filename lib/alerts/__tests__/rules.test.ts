import { describe, expect, it } from "vitest";
import {
  EditorAlertSchema,
  dayExpiry,
  closeBeyondThreshold,
  comparatorOf,
  describeAlertRule,
  directionOf,
  isAlertRuleFired,
  levelSources,
  readAlertField,
  roundThreshold,
  thresholdProblem,
  thresholdStep,
  type AlertQuote,
} from "@/lib/alerts/rules";
import { beyondByThreePoints, pricePoint } from "@/lib/gann/pointScale";
import { shortOfFigure } from "@/lib/gann/evenFigures";

const q: AlertQuote = {
  last: 47.73,
  bid: 47.42,
  ask: 47.89,
  dayHigh: 48.5,
  dayLow: 47.1,
  dayVolume: 1_250_000,
  completedClose: 47.5,
  changeFrom: 47.0,
};

describe("readAlertField", () => {
  it("reads every field from one snapshot", () => {
    expect(readAlertField("last", q)).toBe(47.73);
    expect(readAlertField("bid", q)).toBe(47.42);
    expect(readAlertField("ask", q)).toBe(47.89);
    expect(readAlertField("mark", q)).toBeCloseTo(47.655, 9);
    expect(readAlertField("close", q)).toBe(47.5);
    expect(readAlertField("net_change", q)).toBeCloseTo(0.73, 9);
    expect(readAlertField("pct_change", q)).toBeCloseTo((0.73 / 47) * 100, 9);
    expect(readAlertField("day_high", q)).toBe(48.5);
    expect(readAlertField("day_low", q)).toBe(47.1);
    expect(readAlertField("volume", q)).toBe(1_250_000);
  });

  it("marks at the last trade when the book is one-sided or crossed, and reads nothing missing", () => {
    expect(readAlertField("mark", { ...q, bid: null })).toBe(47.73);
    expect(readAlertField("mark", { ...q, bid: 48, ask: 47.9 })).toBe(47.73);
    expect(readAlertField("bid", { ...q, bid: null })).toBeNull();
    expect(readAlertField("net_change", { ...q, changeFrom: null })).toBeNull();
    expect(readAlertField("last", { ...q, last: Number.NaN })).toBeNull();
  });
});

describe("isAlertRuleFired", () => {
  it("compares with each of the four triggers, equality included only where asked", () => {
    expect(isAlertRuleFired({ field: "last", comparator: ">=", threshold: 47.73 }, q)).toBe(true);
    expect(isAlertRuleFired({ field: "last", comparator: ">", threshold: 47.73 }, q)).toBe(false);
    expect(isAlertRuleFired({ field: "bid", comparator: "<=", threshold: 47.42 }, q)).toBe(true);
    expect(isAlertRuleFired({ field: "bid", comparator: "<", threshold: 47.42 }, q)).toBe(false);
    expect(isAlertRuleFired({ field: "net_change", comparator: "<", threshold: -0.5 }, q)).toBe(false);
  });

  it("never fires on a field it can't read", () => {
    expect(isAlertRuleFired({ field: "ask", comparator: "<=", threshold: 1000 }, { ...q, ask: null })).toBe(false);
  });
});

describe("thresholds", () => {
  it("allows signed change thresholds but only positive prices", () => {
    expect(thresholdProblem("net_change", -1.25)).toBeNull();
    expect(thresholdProblem("pct_change", 0)).toBeNull();
    expect(thresholdProblem("last", 0)).not.toBeNull();
    expect(thresholdProblem("volume", 0)).toBeNull();
    expect(thresholdProblem("volume", -1)).not.toBeNull();
    expect(thresholdProblem("bid", Number.NaN)).not.toBeNull();
  });

  it("steps an eighth of a price-scaled point, never under a cent", () => {
    expect(thresholdStep("last", 42.5)).toBeCloseTo(Math.round((pricePoint(42.5) / 8) * 100) / 100, 9);
    expect(thresholdStep("last", 0.2)).toBe(0.01);
    expect(thresholdStep("pct_change", 50)).toBe(0.1);
    expect(thresholdStep("volume", 1e6)).toBe(1000);
    // Net change steps by the stock's price, not by the size of the change.
    expect(thresholdStep("net_change", 500)).toBe(thresholdStep("last", 500));
  });

  it("rounds to what the field is quoted in", () => {
    expect(roundThreshold("last", 47.734)).toBe(47.73);
    expect(roundThreshold("last", 0.161234)).toBe(0.1612);
    expect(roundThreshold("volume", 1234.6)).toBe(1235);
  });
});

describe("level sources", () => {
  it("offers the chart's levels on the side price must travel to reach them", () => {
    const s = levelSources(100, [
      { price: 104, label: "TP1" },
      { price: 96, label: "SL" },
    ]);
    expect(s.find((x) => x.label === "TP1")).toMatchObject({ threshold: 104, comparator: ">=" });
    expect(s.find((x) => x.label === "SL")).toMatchObject({ threshold: 96, comparator: "<=" });
  });

  it("sets a round-number alert ⅜ point short of the figure (Stock Selector Ch. V)", () => {
    const s = levelSources(97, []);
    const above = s.find((x) => x.id.startsWith("figure:above"))!;
    const below = s.find((x) => x.id.startsWith("figure:below"))!;
    expect(above.level).toBe(100);
    expect(above.threshold).toBe(roundThreshold("last", shortOfFigure(100, "below")));
    expect(above.threshold).toBeLessThan(100);
    expect(below.level).toBe(95);
    expect(below.threshold).toBeGreaterThan(95);
  });

  it("puts the definite indication 3 points beyond the level on the alert's side", () => {
    expect(closeBeyondThreshold(100, ">=")).toBe(roundThreshold("close", beyondByThreePoints(100, 1)));
    expect(closeBeyondThreshold(100, "<")).toBe(roundThreshold("close", beyondByThreePoints(100, -1)));
  });

  it("offers nothing without a price", () => {
    expect(levelSources(0, [{ price: 1, label: "x" }])).toEqual([]);
  });
});

describe("rows and bodies", () => {
  it("reads a pre-0103 chart row's comparison from its side", () => {
    expect(comparatorOf({ comparator: null, direction: "above" })).toBe(">=");
    expect(comparatorOf({ comparator: null, direction: "below" })).toBe("<=");
    expect(comparatorOf({ comparator: "<", direction: "above" })).toBe("<");
    expect(directionOf(">")).toBe("above");
    expect(directionOf("<=")).toBe("below");
  });

  it("describes a rule the way the editor sets it", () => {
    expect(describeAlertRule({ symbol: "TFC", field: "bid", comparator: ">=", threshold: 47.73 })).toBe("TFC Bid >= $47.73");
    expect(describeAlertRule({ symbol: "TFC", field: "pct_change", comparator: "<", threshold: -2 })).toBe("TFC % change < -2.00%");
  });

  it("validates the editor's body and defaults the expiry", () => {
    const ok = EditorAlertSchema.safeParse({ symbol: "TFC", field: "mark", comparator: ">", threshold: 48 });
    expect(ok.success && ok.data.expiry).toBe("gtc");
    expect(EditorAlertSchema.safeParse({ symbol: "TFC", field: "sizzle", comparator: ">", threshold: 1 }).success).toBe(false);
    expect(EditorAlertSchema.safeParse({ symbol: "TFC", field: "last", comparator: "=", threshold: 1 }).success).toBe(false);
    expect(EditorAlertSchema.safeParse({ symbol: "TFC", field: "last", comparator: ">", threshold: 1, note: "x".repeat(141) }).success).toBe(false);
  });

  it("takes tickers and crypto pairs, uppercased, and refuses anything else as a symbol", () => {
    const parse = (symbol: string) => EditorAlertSchema.safeParse({ symbol, field: "last", comparator: ">", threshold: 1 });
    const brk = parse(" brk.b ");
    expect(brk.success && brk.data.symbol).toBe("BRK.B");
    expect(parse("BTC/USD").success).toBe(true);
    expect(parse("<b>x</b>").success).toBe(false);
    expect(parse("A,B").success).toBe(false);
    expect(parse("").success).toBe(false);
    expect(parse("X".repeat(21)).success).toBe(false);
  });

  it("keeps a day Close alert past the close so the checks after the bell can read that close", () => {
    const close = new Date("2026-10-22T20:00:00Z");
    expect(dayExpiry("last", close)).toEqual(close);
    expect(dayExpiry("close", close).toISOString()).toBe("2026-10-22T22:00:00.000Z");
  });
});
