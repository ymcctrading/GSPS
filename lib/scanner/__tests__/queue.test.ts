import { describe, expect, it } from "vitest";
import { planQueue, rotationTick, QUEUE_CAPACITY, DEFAULT_SHARES, type QueueShares } from "../queue";

const syms = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
const core = ["SPY", "QQQ", "IWM", "BTC/USD", "ETH/USD"];
// The 50-slot queue these cases were written on (before 2026-10-29); the
// policy is the same at any capacity, and the default 100 is pinned below.
const FIFTY = { capacity: 50, shares: { core: 5, plans: 14, discovery: 8, focus: 12, watched: 6, rotating: 5 } as QueueShares };

describe("intraday queue", () => {
  it("October 27: the focus reserves fill free slots instead of sitting out", () => {
    const focus = syms("F", 72);
    focus[47] = "BA";
    const plan = planQueue({ ...FIFTY, core, plans: [], discovery: [], focus, watched: [], tick: 0 });
    expect(plan.selected).toHaveLength(50);
    expect(plan.selected.some((e) => e.symbol === "BA")).toBe(false); // 45 slots, rank 48 deferred at tick 0
    // But it is reached on a later tick.
    const reached = Array.from({ length: 10 }, (_, t) => planQueue({ ...FIFTY, core, plans: [], discovery: [], focus, watched: [], tick: t })).some((p) =>
      p.selected.some((e) => e.symbol === "BA"),
    );
    expect(reached).toBe(true);
  });

  it("under saturation every tier keeps its reserved share", () => {
    const plan = planQueue({ ...FIFTY, core, plans: syms("P", 60), discovery: syms("D", 60), focus: syms("F", 72), watched: syms("W", 60), tick: 3 });
    expect(plan.selected).toHaveLength(50);
    expect(plan.byTier.core).toBe(5);
    expect(plan.byTier.plans).toBe(14);
    expect(plan.byTier.discovery).toBe(8);
    expect(plan.byTier.focus).toBe(12);
    expect(plan.byTier.watched).toBe(6);
    expect(plan.byTier.rotating).toBe(5);
  });

  it("the default queue holds 100, each share doubled, and keeps every reserved share under saturation", () => {
    expect(QUEUE_CAPACITY).toBe(100);
    const plan = planQueue({ core: ["SPY"], plans: syms("P", 120), discovery: syms("D", 120), focus: syms("F", 72), watched: syms("W", 120), tick: 3 });
    expect(plan.selected).toHaveLength(100);
    expect(plan.byTier.core).toBe(1);
    // Core's nine unused slots go to the setups past their share; the wheel keeps its own.
    expect(plan.byTier.plans).toBe(DEFAULT_SHARES.plans + 9);
    expect(plan.byTier.discovery).toBe(DEFAULT_SHARES.discovery);
    expect(plan.byTier.focus).toBe(DEFAULT_SHARES.focus);
    expect(plan.byTier.watched).toBe(DEFAULT_SHARES.watched);
    expect(plan.byTier.rotating).toBe(DEFAULT_SHARES.rotating);
  });

  it("no deferred name starves: every one is selected within ceil(rest/free) ticks", () => {
    const input = { core, plans: syms("P", 40), discovery: syms("D", 30), focus: syms("F", 72), watched: syms("W", 20) };
    const first = planQueue({ ...input, tick: 0 });
    const rest = first.deferred.length + first.byTier.rotating;
    const free = first.byTier.rotating;
    const seen = new Set<string>();
    for (let t = 0; t < Math.ceil(rest / free); t++) for (const e of planQueue({ ...input, tick: t }).selected) seen.add(e.symbol);
    const all = [...core, ...input.plans, ...input.discovery, ...input.focus, ...input.watched];
    expect(all.filter((s) => !seen.has(s))).toEqual([]);
  });

  it("is deterministic; a repeated or missed tick picks from the clock, not a counter", () => {
    const input = { core, plans: syms("P", 30), discovery: [], focus: syms("F", 72), watched: [], tick: 7 };
    expect(planQueue(input)).toEqual(planQueue(input));
    const at = new Date("2026-10-27T14:07:00Z");
    expect(rotationTick(at)).toBe(rotationTick(new Date("2026-10-27T14:00:00Z")));
    expect(rotationTick(new Date(NaN))).toBe(0);
  });

  it("never takes a symbol twice; the first tier that lists it owns it", () => {
    const plan = planQueue({ core, plans: ["AAPL", "aapl "], discovery: ["AAPL", "NVDA"], focus: ["NVDA", "", "MSFT"], watched: ["MSFT"], tick: 0 });
    const s = plan.selected.map((e) => e.symbol);
    expect(new Set(s).size).toBe(s.length);
    expect(plan.selected.find((e) => e.symbol === "AAPL")!.tier).toBe("plans");
    expect(plan.selected.find((e) => e.symbol === "NVDA")!.tier).toBe("discovery");
  });

  it("is bounded by capacity and safe on bad capacity", () => {
    expect(planQueue({ capacity: 3, core, plans: [], discovery: [], focus: [], watched: [], tick: 0 }).selected).toHaveLength(3);
    expect(planQueue({ capacity: NaN, core, plans: [], discovery: [], focus: [], watched: [], tick: 0 }).selected).toHaveLength(0);
  });

  it("setups and watched names beyond their share take unused slots before the wheel, never the wheel's share", () => {
    // No discoveries: their 8 unused slots go to the setups past 14, then watched past 6.
    const plan = planQueue({ ...FIFTY, core, plans: syms("P", 20), discovery: [], focus: syms("F", 72), watched: syms("W", 10), tick: 0 });
    expect(plan.selected).toHaveLength(50);
    const sel = new Set(plan.selected.map((e) => e.symbol));
    expect(syms("P", 20).every((s) => sel.has(s))).toBe(true);
    expect(syms("W", 8).every((s) => sel.has(s))).toBe(true);
    expect(plan.byTier.rotating).toBe(5);
    // Saturated: the wheel keeps its five.
    const full = planQueue({ ...FIFTY, core, plans: syms("P", 24), discovery: syms("D", 40), focus: syms("F", 72), watched: syms("W", 10), tick: 0 });
    expect(full.byTier.rotating).toBe(5);
    expect(full.byTier.plans).toBe(14);
  });
});
