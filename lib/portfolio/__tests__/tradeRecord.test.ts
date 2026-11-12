import { describe, expect, it } from "vitest";
import { cleanTradeNote, readTradeRecord, type RecordTrade } from "@/lib/portfolio/tradeRecord";
import { readLossSeries } from "@/lib/risk/lossSeries";

let n = 0;
function t(outcome: "profit" | "loss", exitTimestamp: string, pl: number | null = outcome === "profit" ? 100 : -50): RecordTrade {
  n++;
  return { id: `t${String(n).padStart(3, "0")}`, symbol: "AAA", outcome, exitTimestamp, profitLossDollars: pl };
}

describe("readTradeRecord", () => {
  it("reads nothing from no trades", () => {
    const r = readTradeRecord([]);
    expect(r).toMatchObject({ closed: 0, wins: 0, losses: 0, longestWinRun: 0, longestLossRun: 0, current: null, runs: [], pauses: [] });
  });

  it("splits trades into runs in time order, whatever order they arrive in", () => {
    const trades = [
      t("profit", "2026-11-02T15:00:00Z"),
      t("profit", "2026-11-03T15:00:00Z"),
      t("loss", "2026-11-04T15:00:00Z"),
      t("profit", "2026-11-05T15:00:00Z", 30),
    ];
    const r = readTradeRecord([...trades].reverse());
    expect(r.closed).toBe(4);
    expect(r.wins).toBe(3);
    expect(r.losses).toBe(1);
    expect(r.longestWinRun).toBe(2);
    expect(r.longestLossRun).toBe(1);
    expect(r.runs.map((x) => `${x.kind}${x.length}`)).toEqual(["win1", "loss1", "win2"]);
    expect(r.runs[2]).toMatchObject({ from: "2026-11-02", to: "2026-11-03", net: 200 });
    expect(r.current).toMatchObject({ kind: "win", length: 1, net: 30 });
    expect(r.pauses).toEqual([]);
  });

  it("marks a pause on the third loss in a row and moves it on with each further loss", () => {
    const trades = [
      t("loss", "2026-11-03T15:00:00Z"),
      t("loss", "2026-11-04T15:00:00Z"),
      t("loss", "2026-11-05T15:00:00Z"), // Thursday: the series completes
      t("loss", "2026-11-06T15:00:00Z"), // Friday: one more
    ];
    const r = readTradeRecord(trades);
    expect(r.pauses).toHaveLength(1);
    expect(r.pauses[0]).toMatchObject({
      startedOn: "2026-11-05",
      lastLossOn: "2026-11-06",
      // Friday's pause covers Friday and Monday; entries resume Tuesday.
      resumesOn: "2026-11-10",
      losses: 4,
      tradeId: trades[2].id,
    });
    expect(r.longestLossRun).toBe(4);
  });

  it("dates the pause exactly as the live rule does", () => {
    const trades = [t("loss", "2026-11-03T15:00:00Z"), t("loss", "2026-11-04T15:00:00Z"), t("loss", "2026-11-05T20:30:00Z")];
    const live = readLossSeries(
      [...trades].reverse().map((x) => ({ outcome: x.outcome, exitTimestamp: x.exitTimestamp, symbol: x.symbol, profitLossDollars: x.profitLossDollars })),
      new Date("2026-11-05T21:00:00Z"),
    );
    const record = readTradeRecord(trades);
    expect(live.paused).toBe(true);
    expect(record.pauses[0].startedOn).toBe(live.seriesCompletedOn);
    expect(record.pauses[0].resumesOn).toBe(live.resumesOn);
  });

  it("keeps a pause across a holiday on the trading calendar", () => {
    // Wed Nov 25, 2026 completes the series; Thu Nov 26 is Thanksgiving.
    const r = readTradeRecord([t("loss", "2026-11-23T15:00:00Z"), t("loss", "2026-11-24T15:00:00Z"), t("loss", "2026-11-25T15:00:00Z")]);
    expect(r.pauses[0].resumesOn).toBe("2026-11-30");
  });

  it("dates by the New York day, not UTC", () => {
    // 01:30 UTC on Nov 6 is 8:30 PM on Nov 5 in New York.
    const r = readTradeRecord([t("loss", "2026-11-04T15:00:00Z"), t("loss", "2026-11-05T15:00:00Z"), t("loss", "2026-11-06T01:30:00Z")]);
    expect(r.pauses[0].startedOn).toBe("2026-11-05");
  });

  it("a win closed during the pause ends it that day, as the live rule reads it", () => {
    const r = readTradeRecord([
      t("loss", "2026-11-03T15:00:00Z"),
      t("loss", "2026-11-04T15:00:00Z"),
      t("loss", "2026-11-05T15:00:00Z"),
      t("profit", "2026-11-06T15:00:00Z"),
    ]);
    expect(r.pauses[0].resumesOn).toBe("2026-11-06");
    const live = readLossSeries([{ outcome: "profit", exitTimestamp: "2026-11-06T15:00:00Z" }, { outcome: "loss", exitTimestamp: "2026-11-05T15:00:00Z" }, { outcome: "loss", exitTimestamp: "2026-11-04T15:00:00Z" }, { outcome: "loss", exitTimestamp: "2026-11-03T15:00:00Z" }], new Date("2026-11-06T16:00:00Z"));
    expect(live.paused).toBe(false);
  });

  it("a reset during a pause ends it on the reset's day", () => {
    const r = readTradeRecord(
      [t("loss", "2026-11-03T15:00:00Z"), t("loss", "2026-11-04T15:00:00Z"), t("loss", "2026-11-05T15:00:00Z"), t("loss", "2026-11-10T15:00:00Z")],
      "2026-11-06T14:00:00Z",
    );
    expect(r.pauses).toHaveLength(1);
    expect(r.pauses[0].resumesOn).toBe("2026-11-06");
  });

  it("a reset after the newest trade ends a pause still open", () => {
    const r = readTradeRecord([t("loss", "2026-11-03T15:00:00Z"), t("loss", "2026-11-04T15:00:00Z"), t("loss", "2026-11-05T15:00:00Z")], "2026-11-06T14:00:00Z");
    expect(r.pauses[0].resumesOn).toBe("2026-11-06");
  });

  it("a win ends the series, so two losses either side of it start nothing", () => {
    const r = readTradeRecord([
      t("loss", "2026-11-02T15:00:00Z"),
      t("loss", "2026-11-03T15:00:00Z"),
      t("profit", "2026-11-04T15:00:00Z"),
      t("loss", "2026-11-05T15:00:00Z"),
      t("loss", "2026-11-06T15:00:00Z"),
    ]);
    expect(r.pauses).toEqual([]);
  });

  it("an operator's reset starts a series in progress afresh, and earlier pauses stand", () => {
    const r = readTradeRecord(
      [
        t("loss", "2026-10-26T15:00:00Z"),
        t("loss", "2026-10-27T15:00:00Z"),
        t("loss", "2026-10-28T15:00:00Z"), // a pause, before the reset
        t("profit", "2026-10-29T15:00:00Z"),
        t("loss", "2026-11-02T15:00:00Z"),
        t("loss", "2026-11-03T15:00:00Z"),
        // reset here
        t("loss", "2026-11-04T15:00:00Z"),
        t("loss", "2026-11-05T15:00:00Z"),
      ],
      "2026-11-03T18:00:00Z",
    );
    expect(r.pauses.map((p) => p.startedOn)).toEqual(["2026-10-28"]);
    // The trades themselves are unchanged: four losses in a row.
    expect(r.current).toMatchObject({ kind: "loss", length: 4 });
  });

  it("after a reset, three more losses start a pause again", () => {
    const r = readTradeRecord(
      [t("loss", "2026-11-02T15:00:00Z"), t("loss", "2026-11-03T15:00:00Z"), t("loss", "2026-11-04T15:00:00Z"), t("loss", "2026-11-05T15:00:00Z"), t("loss", "2026-11-06T15:00:00Z")],
      "2026-11-03T18:00:00Z",
    );
    expect(r.pauses).toHaveLength(1);
    expect(r.pauses[0].startedOn).toBe("2026-11-06");
  });

  it("drops rows with no usable outcome or time, and counts a missing figure as zero", () => {
    const r = readTradeRecord([
      t("profit", "not a date"),
      { id: "x", symbol: null, outcome: "pending" as unknown as "profit", exitTimestamp: "2026-11-02T15:00:00Z", profitLossDollars: 5 },
      t("profit", "2026-11-03T15:00:00Z", null),
      t("profit", "2026-11-04T15:00:00Z", Number.NaN),
    ]);
    expect(r.closed).toBe(2);
    expect(r.runs[0].net).toBe(0);
  });

  it("is deterministic when two trades close at the same moment", () => {
    const a = { ...t("loss", "2026-11-03T15:00:00Z"), id: "b" };
    const b = { ...t("profit", "2026-11-03T15:00:00Z"), id: "a" };
    expect(readTradeRecord([a, b])).toEqual(readTradeRecord([b, a]));
  });
});

describe("cleanTradeNote", () => {
  it("trims, normalises line ends, and reads blank as nothing", () => {
    expect(cleanTradeNote("  held too long\r\nnext time sell at the level  ")).toBe("held too long\nnext time sell at the level");
    expect(cleanTradeNote("   \n ")).toBeNull();
    expect(cleanTradeNote(42)).toBeNull();
  });
});
