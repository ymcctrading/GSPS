import { describe, expect, it } from "vitest";
import {
  dayLossHold,
  dayTradeBlocked,
  nyDay,
  LIVE_MIRROR_START,
  liveOpenQty,
  liveRiskFraction,
  cryptoPair,
  isCryptoPair,
  floorTo,
  roundTo,
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

  it("holds a same-day sell the day-trade rule would refuse, keeping the stop on every share held", () => {
    const today = line({ openedAt: new Date(T0 - 30 * 60_000).toISOString() });
    const a = planMirrorActions([sim({ qty: 5, stop: 96 })], [today], held([["AAA", 10]]), gate({ sameDaySellBlocked: true }));
    expect(a.some((x) => x.kind === "reduce")).toBe(false);
    expect(a.find((x) => x.kind === "set_stop")).toMatchObject({ qty: 10, stop: 96 });
    expect(a[0].kind).toBe("hold");
    const c = planMirrorActions([], [today], held([["AAA", 10]]), gate({ sameDaySellBlocked: true }));
    expect(c).toEqual([expect.objectContaining({ kind: "hold" })]);
    // A line from an earlier day sells as usual.
    const old = line({ openedAt: new Date(T0 - 3 * 24 * 3600_000).toISOString() });
    expect(planMirrorActions([sim({ qty: 5 })], [old], held([["AAA", 10]]), gate({ sameDaySellBlocked: true }))[0].kind).toBe("reduce");
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

  it("trades a coin while the stock market is closed, and holds stocks", () => {
    const coinSim = sim({ positionId: "c1", symbol: "BTC/USD", assetClass: "crypto", qty: 0.001, price: 90000, stop: 88000 });
    const a = planMirrorActions([sim(), coinSim], [], held([]), gate({ marketOpen: false }));
    expect(a.find((x) => x.positionId === "c1")?.kind).toBe("open");
    expect(a.find((x) => x.positionId === "p1")).toMatchObject({ kind: "hold", reason: "Market closed." });
    const coinLine = line({ positionId: "c1", symbol: "BTC/USD", targetQty: 0.001, simQty: 0.001, stopQty: 0.001 });
    expect(planMirrorActions([], [coinLine], held([["BTC/USD", 0.001]]), gate({ marketOpen: false }))[0]).toMatchObject({ kind: "close", qty: 0.001 });
  });

  it("holds stock opens for the day-trade rule, never a coin's, and never a coin's same-day sell", () => {
    const coinSim = sim({ positionId: "c1", symbol: "BTC/USD", assetClass: "crypto", qty: 0.001, price: 90000, stop: 88000 });
    const a = planMirrorActions([sim(), coinSim], [], held([]), gate({ pdtOpenHold: true, pdtNote: "Day trades used." }));
    expect(a.find((x) => x.positionId === "c1")?.kind).toBe("open");
    expect(a.find((x) => x.positionId === "p1")).toMatchObject({ kind: "hold", reason: "Day trades used." });
    const coinLine = line({ positionId: "c1", symbol: "BTC/USD", targetQty: 0.001, simQty: 0.001, stopQty: 0.001, openedAt: new Date(T0 - 60_000).toISOString() });
    expect(planMirrorActions([], [coinLine], held([["BTC/USD", 0.001]]), gate({ sameDaySellBlocked: true }))[0].kind).toBe("close");
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
  it("puts at most a third of the account in one trade, risking at most a tenth at the stop", () => {
    // $30 account: a third is $10. $4 stock, stop $3.80: $10 buys 2, the
    // $3 risk allows 15 → 2. The limit keeps both caps: min(3.80 + 3/2, 10/2) = 5.
    expect(liveOpenQty("long", 4, 3.8, 30, 30)).toEqual({ qty: 2, limitPrice: 5 });
    // Less cash than a third of the account: the cash binds.
    expect(liveOpenQty("long", 4, 3.8, 30, 6)).toEqual({ qty: 1, limitPrice: 5.7 });
  });

  it("sizes a coin in its own lot", () => {
    const lot = { increment: 0.000001, min: 0.001, priceIncrement: 0.1 };
    // $10 at $3,000 is 0.003333; the risk ($3 at $50 a coin) allows 0.06.
    expect(liveOpenQty("long", 3000, 2950, 30, 30, 0.1, lot)).toEqual({ qty: 0.003333, limitPrice: 3000.3 });
    // A wide stop: the loss limit binds, and a higher step allows more.
    expect(liveOpenQty("long", 3000, 1800, 60, 60, 0.1, lot).qty).toBe(0.005);
    expect(liveOpenQty("long", 3000, 1800, 60, 60, 0.2, lot).qty).toBe(0.006666);
    expect(liveOpenQty("long", 3000, 2950, 30, 30, 0.1, { increment: 0.0001, min: 0.01 }).reason).toMatch(/smallest order costs \$30.00, more than the \$10.00 one trade may use/);
  });

  it("refuses with a reason a small account would meet", () => {
    expect(liveOpenQty("long", 12, 11, 30, 30).reason).toMatch(/One share costs \$12.00, more than the \$10.00 one trade may use/);
    expect(liveOpenQty("long", 8, 4.5, 30, 30).reason).toMatch(/per-trade loss limit \(\$3.00 on a \$30.00 account\)/);
    expect(liveOpenQty("short", 20, 21, 30, 30).reason).toMatch(/long only/);
    expect(liveOpenQty("long", 20, null, 30, 30).reason).toMatch(/No protective stop/);
    expect(liveOpenQty("long", 20, 21, 30, 30).reason).toMatch(/No protective stop/);
    expect(liveOpenQty("long", 20, Number.NaN, 30, 30).reason).toMatch(/No protective stop/);
    expect(liveOpenQty("long", 4, 3.8, Number.NaN, 30).reason).toMatch(/equity unreadable/);
  });
});

describe("liveRiskFraction (the agreed step-ups, on trading gains)", () => {
  it("steps from a tenth to a fifth at $15 made, and to a third at $45 made", () => {
    expect(liveRiskFraction(0)).toBe(0.1);
    expect(liveRiskFraction(14.99)).toBe(0.1);
    expect(liveRiskFraction(15)).toBe(0.2);
    expect(liveRiskFraction(44.99)).toBe(0.2);
    expect(liveRiskFraction(45)).toBe(1 / 3);
    expect(liveRiskFraction(-5)).toBe(0.1);
  });

  it("takes the first step when the gain can't be read", () => {
    expect(liveRiskFraction(Number.NaN)).toBe(0.1);
  });
});

describe("crypto symbols", () => {
  it("keys a coin by its pair, whichever way the broker writes it", () => {
    expect(cryptoPair("BTCUSD")).toBe("BTC/USD");
    expect(cryptoPair("BTC/USD")).toBe("BTC/USD");
    expect(cryptoPair("eth-usd")).toBe("ETH/USD");
    expect(isCryptoPair("BTC/USD")).toBe(true);
    expect(isCryptoPair("BRK.B")).toBe(false);
  });

  it("rounds to a lot without float dust", () => {
    expect(floorTo(0.0033333333, 0.000001)).toBe(0.003333);
    expect(floorTo(3000.30030, 0.1)).toBe(3000.3);
    expect(roundTo(2949.96, 0.1)).toBe(2950);
  });
});


describe("dayTradeBlocked", () => {
  it("blocks at three day trades under $25,000, and fails closed on an unreadable count", () => {
    expect(dayTradeBlocked(2, 30)).toBe(false);
    expect(dayTradeBlocked(3, 30)).toBe(true);
    expect(dayTradeBlocked(NaN, 30)).toBe(true);
    expect(dayTradeBlocked(5, 30_000)).toBe(false);
  });
});

describe("nyDay", () => {
  it("dates by New York, not UTC", () => {
    expect(nyDay(Date.parse("2026-11-13T03:00:00Z"))).toBe("2026-11-12");
    expect(nyDay(Date.parse("2026-11-13T14:30:00Z"))).toBe("2026-11-13");
  });
});


describe("scaleSimForLive", () => {
  const T = new Date(Date.parse(LIVE_MIRROR_START) + 60_000).toISOString();
  const s = (over: Partial<SimLine> = {}): SimLine => sim({ openedAt: T, price: 12, stop: 11, qty: 40, ...over });
  const coin = (over: Partial<SimLine> = {}): SimLine =>
    s({ positionId: "c1", symbol: "ETH/USD", assetClass: "crypto", price: 3000, stop: 2950, qty: 0.5, ...over });
  const lots = new Map([["ETH/USD", { increment: 0.000001, min: 0.001, priceIncrement: 0.1 }]]);

  it("sizes a new coin line and refuses stock trades on live", () => {
    const r = scaleSimForLive([s({ price: 4, stop: 3.8 }), coin()], [], new Map(), 30, 30, { tradingGain: 0, lots });
    expect(r.lines).toEqual([expect.objectContaining({ positionId: "c1", qty: 0.003333, limitPrice: 3000.3 })]);
    expect(r.refused).toHaveLength(1);
    expect(r.refused[0].reason).toMatch(/Stock trade: the live account trades crypto and options only/);
  });

  it("holds options until trading has made $45", () => {
    const opt = s({ positionId: "o1", symbol: "AAA261218C00010000", assetClass: "option" });
    expect(scaleSimForLive([opt], [], new Map(), 30, 30, { tradingGain: 10 }).refused[0].reason).toMatch(/Options open once trading has made \$45.00 \(so far \$10.00\)/);
    expect(scaleSimForLive([opt], [], new Map(), 75, 75, { tradingGain: 45 }).refused[0].reason).toMatch(/aren't placed on the live account yet/);
  });

  it("refuses a coin whose lot couldn't be read", () => {
    expect(scaleSimForLive([coin()], [], new Map(), 30, 30, { tradingGain: 0 }).refused[0].reason).toMatch(/order size couldn't be read/);
  });

  it("follows the simulator's exits in proportion, keeping a lone share until the last tranche", () => {
    const m = [line({ targetQty: 1, simQty: 1, stopQty: 1 })];
    const scale = new Map([["p1", 1 / 40]]);
    expect(scaleSimForLive([s({ qty: 20 })], m, scale, 30, 30).lines[0].qty).toBe(1); // half out: round(0.5) keeps 1
    expect(scaleSimForLive([s({ qty: 10 })], m, scale, 30, 30).lines[0].qty).toBe(1); // three quarters out: still 1
    expect(scaleSimForLive([s({ qty: 1 })], m, scale, 30, 30).lines[0].qty).toBe(1); // one share left in the simulator: still 1
  });

  it("follows a coin's exits in its lot", () => {
    const m = [line({ positionId: "c1", symbol: "ETH/USD", targetQty: 0.003325, simQty: 0.003333 })];
    const scale = new Map([["c1", 0.003333 / 0.5]]);
    expect(scaleSimForLive([coin({ qty: 0.25 })], m, scale, 30, 30, { lots }).lines[0].qty).toBe(0.001666);
    expect(scaleSimForLive([coin({ qty: 0.01 })], m, scale, 30, 30, { lots }).lines[0].qty).toBe(0.001); // never under the smallest order
  });

  it("ignores positions opened before the live start", () => {
    expect(scaleSimForLive([s({ openedAt: "2026-11-12T16:00:00.000Z" })], [], new Map(), 30, 30).lines).toEqual([]);
  });
});
