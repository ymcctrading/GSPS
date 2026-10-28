import { describe, expect, it } from "vitest";
import {
  attributePrefilter,
  attributeSweep,
  distinctDetections,
  focusStanding,
  formatStage,
  moverAttributionLine,
  moverOutcome,
  remainingAfter,
  splitMove,
  stage,
  type MoverContext,
} from "../coverage";

// The October 27 session opened 9:30 ET = 13:30Z.
const OPEN = new Date("2026-10-27T13:30:00Z");

describe("focus standing (October 27 cases)", () => {
  const rows = (symbolRank: number, basisDate: string, builtAt: string) => [{ basisDate, rank: symbolRank, builtAt }];

  it("BA at rank 48 of the Oct 26 list is a stored reserve, not 'no listing'", () => {
    const s = focusStanding(rows(48, "2026-10-26", "2026-10-26T22:00:00Z"), "2026-10-27", OPEN);
    expect(s).toEqual({ kind: "reserve", rank: 48, basisDate: "2026-10-26" });
  });

  it("ASML at rank 35 is within the timed slice", () => {
    expect(focusStanding(rows(35, "2026-10-26", "2026-10-26T22:00:00Z"), "2026-10-27", OPEN).kind).toBe("active");
  });

  it("SOFI, listed only on the list built after the session, gets no pre-session credit", () => {
    const s = focusStanding(rows(8, "2026-10-27", "2026-10-27T22:00:00Z"), "2026-10-27", OPEN);
    expect(s.kind).toBe("post_session");
  });

  it("reads only the newest pre-session list (BA was rank 6 on Oct 23, 48 on Oct 26)", () => {
    const s = focusStanding(
      [
        { basisDate: "2026-10-23", rank: 6, builtAt: "2026-10-23T22:00:00Z" },
        { basisDate: "2026-10-26", rank: 48, builtAt: "2026-10-26T22:00:00Z" },
      ],
      "2026-10-27",
      OPEN,
    );
    expect(s).toMatchObject({ kind: "reserve", rank: 48 });
  });

  it("a row with no build time is judged by its basis date; malformed ranks are ignored", () => {
    expect(focusStanding([{ basisDate: "2026-10-26", rank: 3, builtAt: null }], "2026-10-27", OPEN).kind).toBe("active");
    expect(focusStanding([{ basisDate: "2026-10-26", rank: NaN, builtAt: null }], "2026-10-27", OPEN).kind).toBe("none");
  });
});

describe("stage counts", () => {
  it("unknown is not zero", () => {
    expect(stage(null, "x").value).toBeNull();
    expect(stage(NaN, "x").value).toBeNull();
    expect(stage(Infinity, "x").value).toBeNull();
    expect(stage(-1, "x").value).toBeNull();
    expect(stage(0, "x").value).toBe(0);
    expect(formatStage(stage(undefined, "no ledger"))).toBe("not recorded (no ledger)");
  });

  it("price data and evaluation are separate stages", () => {
    const price = stage(832, "overnight readings stored");
    const evaluated = stage(70, "fully scored in the daytime");
    expect(price.value).not.toBe(evaluated.value);
  });
});

describe("overnight reading", () => {
  const base = { state: "Watch", score: 7, direction: "bullish", setupKind: "continuation", entry: 222.22, error: null };

  it("flags the scale check on CBRS-like distance (222.22 against 108)", () => {
    const a = attributeSweep(base, 108, 6);
    expect(a.scaleCheck).toBe(true);
    expect(a.resting).toBe(true);
    expect(a.line).toMatch(/scale check/);
  });

  it("a near entry is not resting; unknown range is unknown, not false", () => {
    expect(attributeSweep({ ...base, entry: 101 }, 100, 3).resting).toBe(false);
    expect(attributeSweep({ ...base, entry: 101 }, 100, null).resting).toBeNull();
  });

  it("is safe on missing and malformed inputs", () => {
    expect(attributeSweep(null, 100, 3).line).toMatch(/no overnight reading/);
    expect(attributeSweep({ ...base, error: "fetch failed" }, 100, 3).line).toMatch(/failed/);
    expect(attributeSweep({ ...base, entry: NaN }, 100, 3).entryDistancePct).toBeNull();
    expect(attributeSweep({ ...base, entry: 100 }, Infinity, 3).entryDistancePct).toBeNull();
  });

  it("says the pre-filter row is the day's last reading", () => {
    expect(attributePrefilter(null)).toMatch(/no daytime/);
    expect(attributePrefilter({ clearedReversion: true, clearedContinuation: false, shortlisted: false, fullScanScore: null, fullScanState: null })).toMatch(/not shortlisted \(last reading/);
  });
});

describe("the move, split", () => {
  it("keeps the overnight gap apart from the session", () => {
    const s = splitMove(100, 110, 105)!;
    expect(s.gapPct).toBeCloseTo(10);
    expect(s.sessionPct).toBeCloseTo(-4.545, 2);
    expect(splitMove(NaN, 1, 1)).toBeNull();
  });

  it("credits only the move after the data could be seen, never the gap", () => {
    const bars = [
      { t: "2026-10-27T13:30:00Z", o: 110, h: 111, l: 109, c: 110, v: 1 },
      { t: "2026-10-27T13:45:00Z", o: 112, h: 113, l: 111, c: 112, v: 1 },
      { t: "2026-10-27T14:00:00Z", o: 113, h: 116, l: 112, c: 115, v: 1 },
    ];
    expect(remainingAfter(bars, new Date("2026-10-27T13:46:00Z"), "bullish")).toBe(2);
    expect(remainingAfter(bars, new Date("2026-10-27T14:01:00Z"), "bullish")).toBeNull();
    expect(remainingAfter(bars, null, "bullish")).toBeNull();
  });
});

describe("mover outcome", () => {
  const ctx = (over: Partial<MoverContext>): MoverContext => ({
    symbol: "BA",
    side: "bullish",
    sweep: attributeSweep({ state: "Watch", score: 7, direction: "bearish", setupKind: null, entry: 180, error: null }, 190, 3),
    sweepState: "Watch",
    sweepError: false,
    prefilter: attributePrefilter(null),
    focus: { kind: "reserve", rank: 48, basisDate: "2026-10-26" },
    detections: [],
    deliveries: 0,
    executePlan: false,
    watchPlan: false,
    examined: true,
    ...over,
  });

  it("BA: a directional overnight Watch and a reserve listing is withheld, not missed", () => {
    const a = moverAttributionLine(ctx({}));
    expect(a.outcome).toBe("withheld");
    expect(a.line).toMatch(/reserve, rank 48/);
  });

  it("a system detection not delivered stays distinct from a delivery", () => {
    const d = distinctDetections([
      { symbol: "NVDA", kind: "k", side: "bullish", evaluatedAt: "2026-10-27T14:00:00Z", dataBarOpen: null, usableAt: "2026-10-27T14:16:00Z" },
      { symbol: "NVDA", kind: "k", side: "bullish", evaluatedAt: "2026-10-27T13:45:00Z", dataBarOpen: null, usableAt: null },
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].repeats).toBe(2);
    expect(d[0].evaluatedAt).toBe("2026-10-27T13:45:00Z");
    expect(moverOutcome(ctx({ detections: d }))).toBe("detected_not_delivered");
    expect(moverOutcome(ctx({ detections: d, deliveries: 1 }))).toBe("offered");
  });

  it("a signal or Execute only against the move is not 'Offered'", () => {
    expect(moverOutcome(ctx({ deliveriesAgainst: 1 }))).toBe("offered_against");
    expect(moverOutcome(ctx({ executeAgainst: true }))).toBe("offered_against");
    expect(moverAttributionLine(ctx({ deliveriesAgainst: 2 })).line).toMatch(/2 delivered against the move/);
  });

  it("unavailable and not examined are stated apart", () => {
    const none = attributeSweep(null, 100, 3);
    expect(moverOutcome(ctx({ sweep: none, sweepState: null, sweepError: true, examined: true }))).toBe("unavailable");
    expect(moverOutcome(ctx({ sweep: none, sweepState: null, examined: false }))).toBe("not_examined");
    expect(moverOutcome(ctx({ sweep: none, sweepState: null, examined: true }))).toBe("examined_no_candidate");
  });
});

describe("delay-faithful credit", () => {
  it("a detection on the 10:00 ET bar is usable at 10:30 ET (bar close + 15 min), and is credited only from there", async () => {
    const { availability, barCloseAt, CONTRACTUAL_EQUITY_DELAY_MS } = await import("@/lib/data/timeliness");
    const usable = availability(barCloseAt("2026-10-27T14:00:00Z", "15Min", "us_equity"), CONTRACTUAL_EQUITY_DELAY_MS)!;
    expect(usable.usableAt.toISOString()).toBe("2026-10-27T14:30:00.000Z");
    const bars = ["13:30", "13:45", "14:00", "14:15", "14:30", "14:45"].map((hm, i) => ({
      t: `2026-10-27T${hm}:00Z`,
      o: 100 + i * 2,
      h: 101 + i * 2,
      l: 99 + i * 2,
      c: 101 + i * 2,
      v: 1,
    }));
    // From the 14:30 bar's open (108) to the last close (111): 3, not the 11 from the open.
    expect(remainingAfter(bars, usable.usableAt, "bullish")).toBe(3);
    expect(remainingAfter(bars, usable.usableAt, "bearish")).toBe(-3);
  });
});
