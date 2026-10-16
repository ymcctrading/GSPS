import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { overnightTradeR, readOvernightChart, walkOvernightChart, walkOvernightSystem } from "../overnightChart";

// One point = 1, so the ¼-point filter is 0.25.
const ONE = () => 1;

let day = 0;
function bar(h: number, l: number, o = (h + l) / 2, c = (h + l) / 2): Bar {
  const t = new Date(Date.UTC(2026, 0, 1) + day++ * 86_400_000).toISOString();
  return { t, o, h, l, c, v: 1000 };
}
const fresh = () => { day = 0; };

describe("walkOvernightChart (Master Course Ch. 3 p. 68)", () => {
  it("moves up on higher bottoms and records the top when a low breaks by ¼ point", () => {
    fresh();
    const bars = [bar(51, 49), bar(52, 50), bar(53, 51), bar(54, 52), bar(53.5, 51.5)];
    const s = walkOvernightChart(bars, ONE);
    expect(s.line).toBe("down");
    expect(s.pivots.map((p) => [p.kind, p.price])).toEqual([["bottom", 49], ["top", 54]]);
  });

  it("does not turn down on a low less than ¼ point under the previous bottom", () => {
    fresh();
    const bars = [bar(51, 49), bar(52, 50), bar(53, 51), bar(52.5, 50.9)];
    expect(walkOvernightChart(bars, ONE).line).toBe("up");
  });

  it("moves an inside day up to its top (rule 4)", () => {
    fresh();
    const bars = [bar(55, 53), bar(54, 52), bar(53, 50), bar(52.5, 50.5)];
    const s = walkOvernightChart(bars, ONE);
    expect(s.line).toBe("up");
    expect(s.extreme?.price).toBe(52.5);
    expect(s.pivots.at(-1)).toMatchObject({ kind: "bottom", price: 50 });
  });

  it("moves an outside day up to the high, then down to the low (rule 5)", () => {
    fresh();
    const bars = [bar(55, 53), bar(54, 52), bar(53, 51), bar(54.5, 50)];
    const s = walkOvernightChart(bars, ONE);
    expect(s.line).toBe("down");
    expect(s.pivots.slice(-2).map((p) => [p.kind, p.price])).toEqual([["bottom", 51], ["top", 54.5]]);
    expect(s.extreme?.price).toBe(50);
  });
});

describe("walkOvernightSystem (Rules 4 and 7)", () => {
  // Up to 51.5, a reaction to 50.9, a crossing of 51.5 + 1, a swing to 53.2,
  // a reaction to 52.3, an outside day topping at 53, then a break of 52.3 − 1.
  function upThenBreak(last: Bar = { t: "", o: 52, h: 52.5, l: 51, c: 51.1, v: 1000 }): Bar[] {
    fresh();
    const bars = [
      bar(50.5, 49.5), bar(51, 50), bar(51.5, 51.2),
      bar(51.3, 50.9), bar(51.4, 51),
      bar(52.8, 51.3, 51.4), bar(53.2, 52.6),
      bar(53, 52.3), bar(52.9, 52.4),
      bar(53, 52, 52.8),
    ];
    bars.push({ ...last, t: bar(0, 0).t });
    return bars;
  }

  it("buys a crossing of the last top by a point with a stop a point under the last bottom", () => {
    const first = walkOvernightSystem(upThenBreak(), { point: ONE }).trades[0];
    expect(first.side).toBe("long");
    expect(first.entry).toBe(52.5);
    expect(first.initialStop).toBeCloseTo(49.9);
  });

  it("reverses and doubles up when the stop is caught and a nearby top gives the new stop", () => {
    const w = walkOvernightSystem(upThenBreak(), { point: ONE });
    expect(w.trades[0].reason).toBe("reversed");
    expect(w.trades[0].exit).toBeCloseTo(51.3);
    expect(w.position?.side).toBe("short");
    expect(w.position?.opened).toBe("reversal");
    expect(w.position?.initialStop).toBeCloseTo(54);
  });

  it("does not reverse when the new stop would risk more than 3 points", () => {
    const w = walkOvernightSystem(upThenBreak({ t: "", o: 50, h: 50.2, l: 49.8, c: 50, v: 1000 }), { point: ONE });
    expect(w.trades[0].reason).toBe("stopped");
    expect(w.trades[0].exit).toBe(50);
    expect(w.position).toBeNull();
  });

  it("reports R on a closed trade", () => {
    const w = walkOvernightSystem(upThenBreak(), { point: ONE });
    expect(overnightTradeR(w.trades[0])).toBeCloseTo((51.3 - 52.5) / (52.5 - 49.9));
  });

  it("buys the half-way point of the last up swing with a 1-point stop when asked to", () => {
    fresh();
    // Up 50 → 54 (a top), then a reaction that reaches 52, the half-way point.
    const bars = [bar(50.5, 50), bar(52, 50.5), bar(54, 52), bar(53.5, 51.7), bar(53, 51.8, 52.6)];
    const w = walkOvernightSystem(bars, { point: ONE, halfwayEntries: true });
    expect(w.position).toMatchObject({ side: "long", opened: "halfway", entry: 52, initialStop: 51 });
  });
});

describe("readOvernightChart", () => {
  it("names the line, the stops a point beyond the pivots, the halfway point and the reversal", () => {
    fresh();
    const bars = [
      bar(50.5, 49.5), bar(51, 50), bar(51.5, 51.2),
      bar(51.3, 50.9), bar(51.4, 51),
      bar(52.8, 51.3, 51.4), bar(53.2, 52.6),
      bar(53, 52.3), bar(52.9, 52.4),
      bar(53, 52, 52.8), bar(52.5, 51, 52, 51.1),
    ];
    const r = readOvernightChart(bars, ONE)!;
    expect(r.line).toBe("down");
    // Rule 5: the outside day before the break moved the line up to 53 first.
    expect(r.lastTop).toBe(53);
    expect(r.shortStop).toBeCloseTo(54);
    expect(r.halfway).toEqual({ price: 52.65, swing: "up" });
    expect(r.system).toBe("short");
    expect(r.reversedToday).toBe(true);
  });
});
