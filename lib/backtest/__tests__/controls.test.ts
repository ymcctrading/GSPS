import { describe, expect, it } from "vitest";
import { controlTradeAt, equalWeightBenchmark, randomEntryControl, randomEntryDistribution, type ControlBar } from "@/lib/backtest/controls";

function bars(closes: number[], start = "2026-01-05"): ControlBar[] {
  const d0 = Date.parse(`${start}T05:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(d0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c }));
}

describe("controlTradeAt", () => {
  it("fills at the open and exits at the held session's close", () => {
    const b = bars([100, 101, 102, 103]);
    const tr = controlTradeAt("A", b, 0, "long", 0.05, 3, 0);
    expect(tr?.entry).toBe(100);
    expect(tr?.exitReason).toBe("held");
    expect(tr?.exitPrice).toBe(102);
    expect(tr?.rMultiple).toBeCloseTo(2 / 5, 12);
  });

  it("stops at the stop, and at the open when price gaps through", () => {
    const touch = bars([100, 100, 100]);
    touch[1] = { ...touch[1], l: 94 };
    expect(controlTradeAt("A", touch, 0, "long", 0.05, 3, 0)).toMatchObject({ exitReason: "stop", exitPrice: 95, rMultiple: -1 });
    const gap = bars([100, 90, 90]);
    expect(controlTradeAt("A", gap, 0, "long", 0.05, 3, 0)).toMatchObject({ exitReason: "stop", exitPrice: 90, rMultiple: -2 });
  });

  it("charges the cost a share in R", () => {
    const tr = controlTradeAt("A", bars([100, 100]), 0, "long", 0.05, 2, 0.5);
    expect(tr?.rMultiple).toBeCloseTo(-0.1, 12);
  });

  it("mirrors a short", () => {
    const tr = controlTradeAt("A", bars([100, 99, 98]), 0, "short", 0.05, 3, 0);
    expect(tr?.rMultiple).toBeCloseTo(2 / 5, 12);
  });

  it("reads no bar after its holding period", () => {
    const b = bars([100, 101, 102, 50]);
    const tr = controlTradeAt("A", b, 0, "long", 0.05, 3, 0);
    expect(tr?.exitReason).toBe("held");
  });
});

describe("randomEntryControl", () => {
  const b = bars(Array.from({ length: 120 }, (_, i) => 100 + i * 0.1));
  const real = [{ symbol: "A", openedAt: b[60].t, entry: 106, stop: 100.7, barsHeld: 10, side: "long" as const, rMultiple: 1 }];

  it("is reproducible from its seed and draws inside the window", () => {
    const a = randomEntryControl(real, new Map([["A", b]]), { seed: 5, windowSessions: 5 });
    expect(a).toEqual(randomEntryControl(real, new Map([["A", b]]), { seed: 5, windowSessions: 5 }));
    const idx = b.findIndex((x) => x.t === a.trades[0].openedAt);
    expect(Math.abs(idx - 60)).toBeLessThanOrEqual(5);
    expect(a.trades[0].side).toBe("long");
  });

  it("counts campaigns it can't match", () => {
    const res = randomEntryControl([{ ...real[0], symbol: "NONE" }], new Map([["A", b]]));
    expect(res.unmatched).toBe(1);
  });

  it("draws only member sessions", () => {
    const res = randomEntryControl(real, new Map([["A", b]]), { windowSessions: 30, inUniverse: (_s, d) => d === b[70].t.slice(0, 10) });
    expect(res.trades[0].openedAt).toBe(b[70].t);
  });

  it("reports how often chance matches the real mean", () => {
    const dist = randomEntryDistribution(real, new Map([["A", b]]), 50, { windowSessions: 5 });
    expect(dist.draws).toBe(50);
    expect(dist.shareAtOrAboveReal).toBeGreaterThan(0);
    expect(dist.shareAtOrAboveReal).toBeLessThanOrEqual(1);
  });
});

describe("equalWeightBenchmark", () => {
  it("averages members' daily returns", () => {
    const m = new Map([
      ["A", bars([100, 110])],
      ["B", bars([100, 90])],
      ["C", bars([100, 130])],
    ]);
    const res = equalWeightBenchmark(m, (s) => s !== "C");
    expect(res).toHaveLength(1);
    expect(res[0].return).toBeCloseTo(0, 12);
    expect(res[0].members).toBe(2);
  });
});
