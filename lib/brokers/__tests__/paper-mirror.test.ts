import { describe, expect, it } from "vitest";
import {
  dayLossHold,
  LIVE_MIRROR_START,
  liveOpenQty,
  scaleSimForLive,
  MAX_OPEN_LINES,
  MIRROR_START,
  orderSide,
  planMirrorActions,
  type MirrorGate,
  type MirrorLine,
  type SimLine,
} from "@/lib/brokers/paper-mirror";

const T0 = Date.parse(MIRROR_START) + 3 * 24 * 3600 * 1000;
const gate = (over: Partial<MirrorGate> = {}): MirrorGate => ({
  disabled: false,
  tradingHalted: false,
  marketOpen: true,
  dayLossHold: false,
  now: T0,
  ...over,
});
const sim = (over: Partial<SimLine> = {}): SimLine => ({
  positionId: "p1",
  symbol: "AAA",
  side: "long",
  qty: 10,
  stop: 95,
  price: 100,
  openedAt: new Date(T0 - 60_000).toISOString(),
  automated: true,
  ...over,
});
const line = (over: Partial<MirrorLine> = {}): MirrorLine => ({
  positionId: "p1",
  symbol: "AAA",
  side: "long",
  status: "open",
  targetQty: 10,
  simQty: 10,
  openOrderId: "o1",
  addOrderId: null,
  addSeq: 0,
  stopOrderId: "s1",
  stopPrice: 95,
  stopQty: 10,
  ...over,
});
const held = (entries: [string, number][]) => new Map(entries);

describe("planMirrorActions", () => {
  it("opens a fresh automated simulator position with its stop", () => {
    const a = planMirrorActions([sim()], [], held([]), gate());
    expect(a).toEqual([{ kind: "open", positionId: "p1", symbol: "AAA", side: "long", qty: 10, simPrice: 100, stop: 95 }]);
  });

  it("never mirrors manual trades, old positions, or anything when disabled", () => {
    expect(planMirrorActions([sim({ automated: false })], [], held([]), gate())).toEqual([]);
    expect(planMirrorActions([sim({ openedAt: "2026-11-01T15:00:00.000Z" })], [], held([]), gate())).toEqual([]);
    expect(planMirrorActions([sim()], [], held([]), gate({ disabled: true }))).toEqual([]);
  });

  it("holds opens while halted, closed or past the day's loss hold, without marking them missed", () => {
    for (const g of [gate({ tradingHalted: true }), gate({ marketOpen: false }), gate({ dayLossHold: true })]) {
      const a = planMirrorActions([sim()], [], held([]), g);
      expect(a).toHaveLength(1);
      expect(a[0].kind).toBe("hold");
    }
  });

  it("does not chase a fill more than an hour old", () => {
    const a = planMirrorActions([sim({ openedAt: new Date(T0 - 61 * 60_000).toISOString() })], [], held([]), gate());
    expect(a[0].kind).toBe("missed");
  });

  it("caps open lines and never opens on a symbol the account already holds", () => {
    const lines = Array.from({ length: MAX_OPEN_LINES }, (_, i) => line({ positionId: `m${i}`, symbol: `S${i}` }));
    const brokers = held(lines.map((l) => [l.symbol, 10] as [string, number]));
    const sims = lines.map((l) => sim({ positionId: l.positionId, symbol: l.symbol }));
    const a = planMirrorActions([...sims, sim({ positionId: "new", symbol: "NEW" })], lines, brokers, gate());
    expect(a.find((x) => x.positionId === "new")?.kind).toBe("missed");

    const b = planMirrorActions([sim()], [], held([]), gate(), new Set(["AAA"]));
    expect(b[0].kind).toBe("missed");
  });

  it("does nothing when broker and simulator agree", () => {
    expect(planMirrorActions([sim()], [line()], held([["AAA", 10]]), gate())).toEqual([]);
  });

  it("reduces to the simulator's quantity and re-sizes the stop", () => {
    const a = planMirrorActions([sim({ qty: 5 })], [line()], held([["AAA", 10]]), gate());
    expect(a).toEqual([
      { kind: "reduce", positionId: "p1", symbol: "AAA", side: "long", qty: 5, simPrice: 100, targetAfter: 5 },
      { kind: "set_stop", positionId: "p1", symbol: "AAA", side: "long", qty: 5, stop: 95 },
    ]);
  });

  it("follows a moved simulator stop", () => {
    const a = planMirrorActions([sim({ stop: 101 })], [line()], held([["AAA", 10]]), gate());
    expect(a).toEqual([{ kind: "set_stop", positionId: "p1", symbol: "AAA", side: "long", qty: 10, stop: 101 }]);
  });

  it("adds a pyramid add (stop re-sized next run), but not while halted", () => {
    const a = planMirrorActions([sim({ qty: 15 })], [line()], held([["AAA", 10]]), gate());
    expect(a).toEqual([{ kind: "add", positionId: "p1", symbol: "AAA", side: "long", qty: 5, simPrice: 100, targetAfter: 15, simAfter: 15 }]);
    // Next run, once the add is held: the stop follows the new size.
    const b = planMirrorActions([sim({ qty: 15 })], [line({ targetQty: 15, simQty: 15 })], held([["AAA", 15]]), gate());
    expect(b).toEqual([{ kind: "set_stop", positionId: "p1", symbol: "AAA", side: "long", qty: 15, stop: 95 }]);
    // While the add is still filling, nothing moves.
    expect(planMirrorActions([sim({ qty: 15 })], [line({ targetQty: 15, simQty: 15 })], held([["AAA", 10]]), gate())).toEqual([]);
    const h = planMirrorActions([sim({ qty: 15 })], [line()], held([["AAA", 10]]), gate({ tradingHalted: true }));
    expect(h[0].kind).toBe("hold");
  });

  it("never re-buys after the broker's stop filled first", () => {
    const a = planMirrorActions([sim()], [line()], held([]), gate());
    expect(a).toEqual([{ kind: "broker_stopped", positionId: "p1", symbol: "AAA" }]);
  });

  it("checks an open that holds nothing and has no stop yet", () => {
    expect(planMirrorActions([sim()], [line({ stopOrderId: null, stopPrice: null, stopQty: null })], held([]), gate())).toEqual([
      { kind: "check_open", positionId: "p1", symbol: "AAA" },
    ]);
  });

  it("adds after a reduce from the reduced size", () => {
    // Opened 10, reduced to 5 (target follows), then the simulator pyramids to 8.
    const a = planMirrorActions([sim({ qty: 8 })], [line({ targetQty: 5, simQty: 5, stopQty: 5 })], held([["AAA", 5]]), gate());
    expect(a[0]).toMatchObject({ kind: "add", qty: 3, targetAfter: 8 });
  });

  it("waits, not misses, when the simulator reopened a symbol the mirror is still closing", () => {
    const a = planMirrorActions([sim({ positionId: "p2" })], [line()], held([["AAA", 10]]), gate());
    expect(a).toEqual([
      { kind: "close", positionId: "p1", symbol: "AAA", side: "long", qty: 10 },
      { kind: "hold", positionId: "p2", symbol: "AAA", reason: "Waits for the earlier line in this symbol to close." },
    ]);
  });

  it("closes a line the simulator closed, even while trading is halted, but only in market hours", () => {
    const a = planMirrorActions([], [line()], held([["AAA", 10]]), gate({ tradingHalted: true }));
    expect(a).toEqual([{ kind: "close", positionId: "p1", symbol: "AAA", side: "long", qty: 10 }]);
    const b = planMirrorActions([], [line()], held([["AAA", 10]]), gate({ marketOpen: false }));
    expect(b[0].kind).toBe("hold");
  });

  it("never buys back shares the broker's stop sold (target re-set below the simulator)", () => {
    // Broker stop part-filled: the line was re-targeted to the 7 held; the simulator still holds 10.
    const a = planMirrorActions([sim()], [line({ targetQty: 7, simQty: 10, stopQty: 7 })], held([["AAA", 7]]), gate());
    expect(a.some((x) => x.kind === "add")).toBe(false);
    // A later pyramid in the simulator adds only its own rise.
    const b = planMirrorActions([sim({ qty: 14 })], [line({ targetQty: 7, simQty: 10, stopQty: 7 })], held([["AAA", 7]]), gate());
    expect(b[0]).toMatchObject({ kind: "add", qty: 4, targetAfter: 11, simAfter: 14 });
  });

  it("leaves finished lines alone", () => {
    for (const status of ["closed", "broker_stopped", "missed"] as const) {
      expect(planMirrorActions([sim()], [line({ status })], held([]), gate())).toEqual([]);
    }
  });
});

describe("orderSide", () => {
  it("buys to open a long and sells to close it; the reverse for a short", () => {
    expect(orderSide("long", true)).toBe("buy");
    expect(orderSide("long", false)).toBe("sell");
    expect(orderSide("short", true)).toBe("sell");
    expect(orderSide("short", false)).toBe("buy");
  });
});

describe("dayLossHold", () => {
  it("holds at a 3% day loss and fails closed on an unreadable account", () => {
    expect(dayLossHold(97_000, 100_000)).toBe(true);
    expect(dayLossHold(97_100, 100_000)).toBe(false);
    expect(dayLossHold(NaN, 100_000)).toBe(true);
    expect(dayLossHold(100_000, 0)).toBe(true);
  });
});


describe("liveOpenQty (a small live account)", () => {
  it("sizes whole shares within cash and a tenth of equity at risk", () => {
    // $30 account, $12 stock, stop $11: cash allows 2, risk allows 3 → 2.
    expect(liveOpenQty("long", 12, 11, 30, 30)).toEqual({ qty: 2 });
    // Wider stop: $12 stock, stop $10 → risk $2 a share, a tenth of $30 is $3 → 1.
    expect(liveOpenQty("long", 12, 10, 30, 30)).toEqual({ qty: 1 });
  });

  it("refuses with a reason a small account would meet", () => {
    expect(liveOpenQty("long", 92, 90, 30, 30).reason).toMatch(/more than the \$30.00 cash/);
    expect(liveOpenQty("long", 20, 15, 30, 30).reason).toMatch(/more than a tenth/);
    expect(liveOpenQty("short", 20, 21, 30, 30).reason).toMatch(/long only/);
    expect(liveOpenQty("long", 20, null, 30, 30).reason).toMatch(/No protective stop/);
    expect(liveOpenQty("long", 20, 21, 30, 30).reason).toMatch(/No protective stop/);
  });
});

describe("scaleSimForLive", () => {
  const T = new Date(Date.parse(LIVE_MIRROR_START) + 60_000).toISOString();
  const s = (over: Partial<SimLine> = {}): SimLine => sim({ openedAt: T, price: 12, stop: 11, qty: 40, ...over });

  it("sizes a new line for the account and drops what it can't take", () => {
    const r = scaleSimForLive([s(), s({ positionId: "p2", symbol: "BIG", price: 300, stop: 290 })], [], new Map(), 30, 30);
    expect(r.lines).toEqual([expect.objectContaining({ positionId: "p1", qty: 2 })]);
    expect(r.refused[0].line.positionId).toBe("p2");
  });

  it("follows the simulator's exits in proportion, keeping a lone share until the last tranche", () => {
    const m = [line({ targetQty: 1, simQty: 1, stopQty: 1 })];
    const scale = new Map([["p1", 1 / 40]]);
    expect(scaleSimForLive([s({ qty: 20 })], m, scale, 30, 30).lines[0].qty).toBe(1); // half out: round(0.5) keeps 1
    expect(scaleSimForLive([s({ qty: 10 })], m, scale, 30, 30).lines[0].qty).toBe(0); // three quarters out: 0
  });

  it("ignores positions opened before the live start", () => {
    expect(scaleSimForLive([s({ openedAt: "2026-11-12T16:00:00.000Z" })], [], new Map(), 30, 30).lines).toEqual([]);
  });
});
