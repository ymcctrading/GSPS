import { describe, expect, it } from "vitest";
import type { Time } from "lightweight-charts";
import { movedPastThreshold, resolveDrawGesture } from "@/lib/chart/drawGesture";

const t = (n: number) => n as Time;

describe("resolveDrawGesture", () => {
  it("a drag with the trend tool draws from press to release", () => {
    expect(
      resolveDrawGesture({
        tool: "trend",
        down: { time: t(100), price: 10 },
        up: { time: t(200), price: 12 },
        dragged: true,
        pending: null,
      }),
    ).toEqual({ kind: "trend", a: { time: 100, price: 10 }, b: { time: 200, price: 12 } });
  });

  it("two taps make a line, the first one pending", () => {
    const first = resolveDrawGesture({
      tool: "trend",
      down: { time: t(100), price: 10 },
      up: { time: t(100), price: 10 },
      dragged: false,
      pending: null,
    });
    expect(first).toEqual({ kind: "pending", point: { time: 100, price: 10 } });
    const second = resolveDrawGesture({
      tool: "trend",
      down: { time: t(300), price: 9 },
      up: { time: t(300), price: 9 },
      dragged: false,
      pending: { time: t(100), price: 10 },
    });
    expect(second).toEqual({ kind: "trend", a: { time: 100, price: 10 }, b: { time: 300, price: 9 } });
  });

  it("a second tap on the same bar keeps the first point pending", () => {
    expect(
      resolveDrawGesture({
        tool: "trend",
        down: { time: t(100), price: 11 },
        up: { time: t(100), price: 11 },
        dragged: false,
        pending: { time: t(100), price: 10 },
      }),
    ).toEqual({ kind: "pending", point: { time: 100, price: 10 } });
  });

  it("a drag that stays on one bar, or leaves the bars, draws nothing", () => {
    expect(
      resolveDrawGesture({ tool: "trend", down: { time: t(1), price: 1 }, up: { time: t(1), price: 2 }, dragged: true, pending: null }),
    ).toEqual({ kind: "none" });
    expect(
      resolveDrawGesture({ tool: "trend", down: { time: t(1), price: 1 }, up: { time: null, price: 2 }, dragged: true, pending: null }),
    ).toEqual({ kind: "none" });
  });

  it("a horizontal line drops where the press ends, never at a bad price", () => {
    expect(
      resolveDrawGesture({ tool: "hline", down: { time: null, price: 5 }, up: { time: null, price: 6 }, dragged: true, pending: null }),
    ).toEqual({ kind: "hline", price: 6 });
    for (const bad of [null, NaN, -1, 0, Infinity]) {
      expect(
        resolveDrawGesture({ tool: "hline", down: { time: null, price: 5 }, up: { time: null, price: bad }, dragged: false, pending: null }),
      ).toEqual({ kind: "none" });
    }
  });

  it("no tool armed draws nothing", () => {
    expect(
      resolveDrawGesture({ tool: "none", down: { time: t(1), price: 1 }, up: { time: t(2), price: 2 }, dragged: true, pending: null }),
    ).toEqual({ kind: "none" });
  });
});

describe("movedPastThreshold", () => {
  it("a finger wobble is still a tap", () => {
    expect(movedPastThreshold(3, 4)).toBe(false);
    expect(movedPastThreshold(6, 6)).toBe(true);
  });
});
