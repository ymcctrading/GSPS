import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import type { SharesPoint } from "@/lib/data/instrumentReference";
import { buildUniverseStrength } from "@/lib/gann/universeStrength";
import {
  buildPointInTimeUniverse,
  describePointInTimeUniverse,
  findDuplicateCompanies,
  isPointInTimeMember,
  marketCapAt,
  pointInTimeCandidates,
  yearsBetween,
} from "@/lib/universe/pointInTime";
import { departedShares, memberListHash, monthlyReadStart, suspectDepartedBars } from "@/lib/backtest/pointInTime";

function month(ym: string, c: number, v = 1_000_000): Bar {
  return { t: `${ym}-01T05:00:00Z`, o: c, h: c, l: c, c, v };
}

/** Monthly closes from `from` (YYYY-MM), one a month. */
function months(from: string, closes: number[], v = 1_000_000): Bar[] {
  const [y, m] = from.split("-").map(Number);
  return closes.map((c, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return month(d.toISOString().slice(0, 7), c, v + i);
  });
}

const HISTORY = {
  tickers: {
    AAA: [["2000-01-01", null]] as [string, string | null][],
    GONE: [["2010-01-01", "2022-06-09"]] as [string, string | null][],
    OLD: [["2001-01-01", "2015-01-01"]] as [string, string | null][],
    LATER: [["2005-01-01", "2024-03-01"]] as [string, string | null][],
    KEPT: [["2012-01-01", "2023-01-01"]] as [string, string | null][],
  },
};

describe("pointInTimeCandidates", () => {
  it("adds the index's departed tickers after today's list, read as of the day before they left", () => {
    const c = pointInTimeCandidates(["KEPT", "ZZZ"], "2020-01-01", HISTORY);
    expect(c.map((x) => x.symbol)).toEqual(["KEPT", "ZZZ", "AAA", "LATER", "GONE"]);
    expect(c.find((x) => x.symbol === "GONE")).toEqual({ symbol: "GONE", asOf: "2022-06-08", source: "history" });
    expect(c.find((x) => x.symbol === "AAA")?.asOf).toBeNull();
    // Left the index before the run's span: not a candidate.
    expect(c.some((x) => x.symbol === "OLD")).toBe(false);
  });

  it("reads the checked-in history by default", () => {
    const c = pointInTimeCandidates(["AAPL"], "2020-01-01");
    expect(c[0]).toEqual({ symbol: "AAPL", asOf: null, source: "today" });
    expect(c.length).toBeGreaterThan(400);
    expect(c.filter((x) => x.symbol === "AAPL")).toHaveLength(1);
  });
});

describe("marketCapAt", () => {
  const shares: SharesPoint[] = [
    { asOf: "2019-09-30", filed: "2019-10-25", shares: 100_000_000 },
    // A 2-for-1 split: earlier counts restate to this basis.
    { asOf: "2020-09-30", filed: "2020-10-25", shares: 200_000_000 },
  ];
  // Split-adjusted closes: $60 adjusted in Dec 2019 was $120 traded.
  const bars = months("2019-10", [55, 58, 60, 62]);

  it("multiplies the count filed before the date by the last month's close before it", () => {
    // Before the split's filing: 100M restated to 200M, times December's 60.
    expect(marketCapAt(shares, bars, "2020-01-01")).toEqual({ capUsd: 200_000_000 * 60, reason: "ok", on: "2020-01-01" });
  });

  it("reads nothing filed or closed on or after the date", () => {
    const r = marketCapAt(shares, bars, "2019-12-01");
    // November's close, not December's; the October 2019 filing.
    expect(r.capUsd).toBe(200_000_000 * 58);
    expect(marketCapAt(shares, bars, "2019-10-25").reason).toBe("no_shares");
  });

  it("fails closed on no count, a stale count or no close", () => {
    expect(marketCapAt(undefined, bars, "2020-01-01").reason).toBe("no_shares");
    expect(marketCapAt(shares, bars, "2022-06-01").reason).toBe("stale_shares");
    expect(marketCapAt(shares, [], "2020-01-01")).toEqual({ capUsd: null, reason: "no_close", on: "2020-01-01" });
  });
});

describe("findDuplicateCompanies", () => {
  it("drops a later candidate whose monthly bars repeat an earlier one's", () => {
    const meta = months("2020-01", [200, 210, 220, 230]);
    const other = months("2020-01", [200, 211, 220, 231]);
    const dupes = findDuplicateCompanies(
      ["META", "FB", "OTHER"],
      new Map([
        ["META", meta],
        ["FB", meta.slice(0, 3)],
        ["OTHER", other],
      ]),
    );
    expect([...dupes]).toEqual([["FB", "META"]]);
  });
});

describe("buildPointInTimeUniverse", () => {
  const shares = new Map<string, SharesPoint[]>([
    ["RISER", [{ asOf: "2019-06-30", filed: "2019-08-01", shares: 1_000_000_000 }, { asOf: "2021-06-30", filed: "2021-08-01", shares: 1_000_000_000 }]],
    ["FALLER", [{ asOf: "2019-06-30", filed: "2019-08-01", shares: 1_000_000_000 }, { asOf: "2021-06-30", filed: "2021-08-01", shares: 1_000_000_000 }]],
  ]);
  // Monthly closes Dec 2019 .. Dec 2021: RISER 5 → 12 (under then over $10B), FALLER 15 → 6.
  const riser = months("2019-12", Array.from({ length: 25 }, (_, i) => 5 + (7 * i) / 24));
  const faller = months("2019-12", Array.from({ length: 25 }, (_, i) => 15 - (9 * i) / 24), 2_000_000);
  const u = buildPointInTimeUniverse({
    candidates: [
      { symbol: "RISER", asOf: null, source: "today" },
      { symbol: "FALLER", asOf: "2022-03-01", source: "history" },
      { symbol: "NOSHARES", asOf: null, source: "today" },
    ],
    years: yearsBetween("2020-03-01", "2022-05-01"),
    monthly: new Map([
      ["RISER", riser],
      ["FALLER", faller],
      ["NOSHARES", months("2019-12", [500, 500, 500])],
    ]),
    shares,
  });

  it("admits each candidate only in the years its own cap cleared the floor", () => {
    expect(u.years).toEqual([2020, 2021, 2022]);
    expect([...(u.members.get("RISER") ?? [])]).toEqual([2022]);
    expect([...(u.members.get("FALLER") ?? [])]).toEqual([2020, 2021]);
    expect(isPointInTimeMember(u, "riser", "2022-07-15")).toBe(true);
    expect(isPointInTimeMember(u, "RISER", "2021-07-15T14:30:00Z")).toBe(false);
  });

  it("reads a year whose bars start after 1 January from the month after its first bar, counting from then", () => {
    const late = buildPointInTimeUniverse({
      candidates: [{ symbol: "LATE", asOf: null, source: "today" }],
      years: [2020, 2021],
      // The feed's first month is July 2020: no close before 1 January 2020.
      monthly: new Map([["LATE", months("2020-07", [20, 21, 22, 23, 24, 25, 26])]]),
      shares: new Map([["LATE", [{ asOf: "2019-09-30", filed: "2019-11-01", shares: 1_000_000_000 }]]]),
    });
    expect(late.readings.get("LATE")?.get(2020)).toEqual({ capUsd: 20_000_000_000, reason: "ok", on: "2020-08-01" });
    expect(isPointInTimeMember(late, "LATE", "2020-07-20")).toBe(false);
    expect(isPointInTimeMember(late, "LATE", "2020-08-03")).toBe(true);
    expect(isPointInTimeMember(late, "LATE", "2021-01-04")).toBe(true);
  });

  it("reads a December first bar on the next 1 January, and a late reading's stale count as no membership", () => {
    const u2 = buildPointInTimeUniverse({
      candidates: [
        { symbol: "DEC", asOf: null, source: "today" },
        { symbol: "STALE", asOf: null, source: "today" },
      ],
      years: [2020, 2021],
      monthly: new Map([
        ["DEC", months("2020-12", [30, 31])],
        ["STALE", months("2020-07", [30, 31, 32])],
      ]),
      shares: new Map([
        ["DEC", [{ asOf: "2019-09-30", filed: "2019-11-01", shares: 1_000_000_000 }]],
        ["STALE", [{ asOf: "2018-09-30", filed: "2018-11-01", shares: 1_000_000_000 }]],
      ]),
    });
    expect(u2.readings.get("DEC")?.get(2020)?.reason).toBe("no_close");
    expect([...(u2.members.get("DEC") ?? [])]).toEqual([2021]);
    expect(u2.readings.get("STALE")?.get(2020)?.reason).toBe("stale_shares");
    expect(u2.members.has("STALE")).toBe(false);
  });

  it("leaves out a candidate with no share count, and says why", () => {
    expect(u.members.has("NOSHARES")).toBe(false);
    const lines = describePointInTimeUniverse(u);
    expect(lines[0]).toContain("2020: 1 members (1 not on today's list)");
    expect(lines[0]).toContain("1 no share count");
  });

  it("ranks strength only among the month's members", () => {
    const all = buildUniverseStrength(new Map([["RISER", riser], ["FALLER", faller]]));
    const pit = buildUniverseStrength(new Map([["RISER", riser], ["FALLER", faller]]), (s, m) => isPointInTimeMember(u, s, `${m}-01`));
    const m = "2021-06";
    expect([...(all.get(m)?.bySymbol.keys() ?? [])].sort()).toEqual(["FALLER", "RISER"]);
    expect([...(pit.get(m)?.bySymbol.keys() ?? [])]).toEqual(["FALLER"]);
  });
});

describe("the backtest's loader", () => {
  it("reads the month before the strength rank's span and the first year's close", () => {
    expect(monthlyReadStart("2020-10-30").toISOString().slice(0, 10)).toBe("2019-08-01");
    expect(monthlyReadStart("2020-01-15").toISOString().slice(0, 10)).toBe("2018-11-01");
  });

  it("fingerprints the member list so split jobs can be checked against each other", () => {
    expect(memberListHash(["A", "B"])).toBe(memberListHash(["A", "B"]));
    expect(memberListHash(["A", "B"])).not.toBe(memberListHash(["B", "A"]));
    expect(memberListHash(["A", "B"])).toMatch(/^[0-9a-f]{8}$/);
  });

  it("flags a departed ticker's bars only when they stop early or start after the feed did", () => {
    const candidates = [
      { symbol: "NOW", asOf: null, source: "today" as const },
      { symbol: "EARLY", asOf: "2020-03-01", source: "history" as const },
      { symbol: "ENDED", asOf: "2023-06-01", source: "history" as const },
      { symbol: "LATESTART", asOf: "2022-06-01", source: "history" as const },
    ];
    const monthly = new Map([
      ["NOW", months("2020-07", [1, 2, 3])],
      // Left before the feed's first month: bars start with the feed.
      ["EARLY", months("2020-07", [1, 2, 3])],
      // Bars stop a year before the day read as of.
      ["ENDED", months("2020-07", [1, 2, 3])],
      // Bars start after it left: another company.
      ["LATESTART", months("2024-01", [1, 2, 3])],
    ]);
    expect(suspectDepartedBars(candidates, monthly)).toEqual(["ENDED", "LATESTART"]);
  });

  it("reads the departed tickers' stored counts", () => {
    const m = departedShares({ symbols: { gone: { history: [["2020-03-31", "2020-04-30", 5e8]] }, none: {} } });
    expect([...m.keys()]).toEqual(["GONE"]);
    expect(m.get("GONE")).toEqual([{ asOf: "2020-03-31", filed: "2020-04-30", shares: 5e8 }]);
  });
});
