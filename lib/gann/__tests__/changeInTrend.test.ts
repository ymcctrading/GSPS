import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { changeInTrend, ninePointChart, threeDayTrend } from "@/lib/gann/changeInTrend";

// Synthetic bars (seeded random walks from 2018-01-02, one near $40, one near $180) and the
// research code's Rule 10 reading on every bar (internal: private-research/card-goodcall/
// gc2-parity-synthetic.py and gc2-parity-dump.py, G12 code SHA256SUMS 01c56fd4). Flags per bar
// from bar 1: fired, holiday, cross, anniversary.
const FIX = JSON.parse(readFileSync(path.join(__dirname, "fixtures/change-in-trend-parity.json"), "utf8")) as Record<
  string,
  { bars: [string, number, number][]; flags: string }
>;

describe("changeInTrend", () => {
  it("reads every bar as the research code did, except its year-end look-ahead", () => {
    let compared = 0;
    const lookAhead: string[] = [];
    for (const [sym, { bars, flags }] of Object.entries(FIX)) {
      const b = bars.map(([date, h, l]) => ({ date, h, l }));
      for (let t = 1; t < b.length; t++) {
        const r = changeInTrend(b, t);
        const mine = [r.fired, r.holiday, r.cross, r.anniversary].map(Number).join("");
        const theirs = flags.slice((t - 1) * 4, t * 4);
        compared++;
        if (mine === theirs) continue;
        // The research tagged a quarter's extreme "yearly" from the whole year in its data, so a
        // bar in the year's last days could see an anniversary of it early; the port cannot.
        expect(theirs, `${sym} ${b[t].date}`).toBe("1001");
        expect(mine, `${sym} ${b[t].date}`).toBe("0000");
        expect(b[t].date.slice(5) >= "12-29", `${sym} ${b[t].date}`).toBe(true);
        lookAhead.push(`${sym} ${b[t].date}`);
      }
    }
    expect(compared).toBe(4606);
    expect(lookAhead).toEqual(["SYNA 2021-12-30", "SYNA 2021-12-31"]);
  });

  it("covers each of the rule's three parts in the fixture", () => {
    const all = Object.values(FIX).map((f) => f.flags).join("");
    const count = (i: number) => [...all].filter((c, j) => j % 4 === i && c === "1").length;
    expect(count(1)).toBeGreaterThan(100);
    expect(count(2)).toBeGreaterThan(50);
    expect(count(3)).toBeGreaterThan(500);
  });

  it("marks the rule's holiday dates on any bars", () => {
    const at = (date: string) => changeInTrend([{ date: "2026-01-01", h: 10, l: 9 }, { date, h: 10, l: 9 }]);
    expect(at("2026-07-06").holiday).toBe(true); // July 4 + 2
    expect(at("2026-07-07").holiday).toBe(false);
    expect(at("2026-09-07").holiday).toBe(true); // Labor Day 2026
    expect(at("2026-09-04").holiday).toBe(false);
    expect(at("2028-11-06").holiday).toBe(true); // election year
    expect(at("2026-11-06").holiday).toBe(false);
    expect(at("2026-12-24").holiday).toBe(true);
  });

  it("reads no bar after the one asked for", () => {
    const b = FIX.SYNB.bars.map(([date, h, l]) => ({ date, h, l }));
    const t = 1500;
    const moved = b.map((x, i) => (i > t ? { ...x, h: x.h * 3, l: x.l / 3 } : x));
    expect(changeInTrend(moved, t)).toEqual(changeInTrend(b, t));
    expect(threeDayTrend(b.map((x) => x.h), b.map((x) => x.l)).slice(0, t + 1)).toEqual(
      threeDayTrend(moved.slice(0, t + 1).map((x) => x.h), moved.slice(0, t + 1).map((x) => x.l)),
    );
    expect(ninePointChart([1], [1]).pivots).toEqual([]);
  });

  it("is no signal on bad input", () => {
    expect(changeInTrend([], 0).fired).toBe(false);
    expect(changeInTrend([{ date: "2026-01-02", h: NaN, l: 1 }, { date: "2026-01-05", h: 2, l: 1 }]).fired).toBe(false);
  });
});
