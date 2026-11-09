import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { firstPassAfterPause, walkPausedExit, type PausedPosition } from "@/lib/recovery/pausedPaperExits";

/** A 15-minute bar at a UTC time (Nov 2026 is EST, so 14:30 UTC is the 9:30 ET open). */
const bar = (t: string, o: number, h: number, l: number, c: number): Bar => ({ t, o, h, l, c, v: 1000 });

const long = (over: Partial<PausedPosition> = {}): PausedPosition => ({
  side: "long",
  entryPrice: 100,
  initialStop: 95,
  appliedStop: 95,
  highWater: 101,
  openedAt: "2026-10-30T15:00:00Z",
  lastManagedAt: "2026-10-30T19:30:00Z",
  tranches: [
    { key: "scale_out", qty: 2, target: 110, done: false },
    { key: "runner", qty: 2, target: null, done: false },
  ],
  ...over,
});

const end = new Date("2026-11-27T21:00:00Z");

describe("walkPausedExit", () => {
  it("closes at the stop when the stop broke before the target was touched, where the first pass books the target", () => {
    const bars = [
      bar("2026-11-03T15:00:00Z", 99, 99.5, 94, 96), // stop at 95 broken on Nov 3
      bar("2026-11-20T15:00:00Z", 105, 111, 104, 110), // TP1 at 110 touched on Nov 20
    ];
    const walk = walkPausedExit({ position: long(), bars, daily: [], end });
    expect(walk.state).toBe("closed");
    expect(walk.fills.map((f) => [f.key, f.price, f.reason])).toEqual([
      ["scale_out", 95, "stop (applied)"],
      ["runner", 95, "stop (applied)"],
    ]);
    expect(walk.rMultiple).toBeCloseTo(-1);

    const first = firstPassAfterPause({ position: long(), bars, daily: [], end, lastPrice: 108 });
    expect(first.fills).toEqual([{ key: "scale_out", qty: 2, price: 110, reason: "TP1" }]);
  });

  it("counts a bar that reaches both the stop and a target as the stop", () => {
    const bars = [bar("2026-11-04T15:00:00Z", 100, 111, 94, 100)];
    const walk = walkPausedExit({ position: long(), bars, daily: [], end });
    expect(walk.ambiguousBars).toBe(1);
    expect(walk.fills.every((f) => f.price === 95)).toBe(true);
  });

  it("fills a gap through the stop at the open", () => {
    const bars = [bar("2026-11-04T14:30:00Z", 90, 91, 89, 90)];
    const walk = walkPausedExit({ position: long(), bars, daily: [], end });
    expect(walk.fills.every((f) => f.price === 90)).toBe(true);
  });

  it("takes the target, then keeps walking the runner", () => {
    const bars = [
      bar("2026-11-04T15:00:00Z", 105, 110.5, 104, 110),
      bar("2026-11-05T15:00:00Z", 110, 112, 109, 111),
    ];
    const walk = walkPausedExit({ position: long(), bars, daily: [], end });
    expect(walk.state).toBe("open");
    expect(walk.fills).toEqual([{ key: "scale_out", qty: 2, price: 110, at: "2026-11-04T15:00:00Z", reason: "TP1" }]);
    expect(walk.best).toBe(112);
    expect(walk.rMultiple).toBeNull();
  });

  it("ignores bars before the last managed time, after the end, and outside the session", () => {
    const bars = [
      bar("2026-10-30T15:00:00Z", 99, 99, 90, 92), // before last managed: already read live
      bar("2026-11-04T12:00:00Z", 99, 99, 90, 92), // 7:00 ET, pre-market
      bar("2026-11-30T15:00:00Z", 99, 99, 90, 92), // after the end
    ];
    const walk = walkPausedExit({ position: long(), bars, daily: [], end });
    expect(walk.state).toBe("open");
    expect(walk.barsWalked).toBe(0);
    expect(walk.fills).toEqual([]);
  });

  it("never loosens the stop in force when management stopped", () => {
    const pos = long({ appliedStop: 100, highWater: 108 }); // break-even already applied
    const bars = [bar("2026-11-04T15:00:00Z", 101, 102, 99.5, 100)];
    const walk = walkPausedExit({ position: pos, bars, daily: [], end });
    expect(walk.fills.map((f) => f.price)).toEqual([100, 100]);
  });

  it("includes tranches filled before the pause in the R of a closed walk", () => {
    const pos = long({
      appliedStop: 100,
      tranches: [
        { key: "scale_out", qty: 2, target: 110, done: true },
        { key: "runner", qty: 2, target: null, done: false },
      ],
    });
    const bars = [bar("2026-11-04T15:00:00Z", 101, 102, 99, 100)];
    const walk = walkPausedExit({ position: pos, bars, daily: [], end, priorFills: [{ key: "scale_out", qty: 2, price: 110 }] });
    // (2 × +10 + 2 × 0) / 4 shares / 5 risk = +1R
    expect(walk.rMultiple).toBeCloseTo(1);
  });

  it("mirrors a short", () => {
    const pos: PausedPosition = {
      ...long(),
      side: "short",
      entryPrice: 100,
      initialStop: 105,
      appliedStop: 105,
      highWater: 99,
      tranches: [{ key: "runner", qty: 3, target: null, done: false }],
    };
    const bars = [bar("2026-11-04T15:00:00Z", 104, 106, 103, 105)];
    const walk = walkPausedExit({ position: pos, bars, daily: [], end });
    expect(walk.fills).toEqual([{ key: "runner", qty: 3, price: 105, at: "2026-11-04T15:00:00Z", reason: "stop (applied)" }]);
    expect(walk.rMultiple).toBeCloseTo(-1);
  });
});
