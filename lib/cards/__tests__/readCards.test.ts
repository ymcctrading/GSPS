import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cardsStillTrade, getTradeCards } from "@/lib/cards/readCards";

type Row = Record<string, unknown>;

/** A read-only stand-in for `card_calls` that applies the filters the reader uses. */
function fakeService(rows: Row[]): SupabaseClient {
  const query = () => {
    let out = [...rows];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => ((out = out.filter((r) => r[c] === v)), q),
      neq: (c: string, v: unknown) => ((out = out.filter((r) => r[c] !== v)), q),
      in: (c: string, v: unknown[]) => ((out = out.filter((r) => v.includes(r[c]))), q),
      order: (c: string, o?: { ascending?: boolean }) => {
        if (c === "signal_date") out.sort((a, b) => String(a[c]).localeCompare(String(b[c])) * (o?.ascending === false ? -1 : 1));
        return q;
      },
      limit: (n: number) => ((out = out.slice(0, n)), q),
      range: (a: number, b: number) => Promise.resolve({ data: out.slice(a, b + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: out[0] ?? null, error: null }),
      then: (f: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: out, error: null }).then(f),
    };
    return q;
  };
  return { from: () => query() } as unknown as SupabaseClient;
}

const card = (kind: string, symbol: string, signal_date: string, published: boolean, call_outcome = "pending"): Row => ({
  kind,
  symbol,
  signal_date,
  published,
  entry: 100,
  stop: 96,
  tp1: 106,
  fill_price: call_outcome === "good" || call_outcome === "bad" ? 100 : null,
  call_outcome,
});

const proPolicy = { allowedStrategyModes: ["macdMomentum", "rsiReversal", "maCrossover", "vwap"] } as never;
const pro = { policy: proPolicy, mode: "rsiReversal" };
// Tuesday 2026-11-10, 8 PM ET: Tuesday's cards trade Wednesday.
const tuesdayEvening = new Date("2026-11-11T01:00:00Z");

describe("cardsStillTrade", () => {
  it("is true until the session after the signal has closed", () => {
    expect(cardsStillTrade("2026-11-10", tuesdayEvening)).toBe(true);
    expect(cardsStillTrade("2026-11-10", new Date("2026-11-11T20:00:00Z"))).toBe(true); // Wednesday 3 PM ET
    expect(cardsStillTrade("2026-11-10", new Date("2026-11-11T21:30:00Z"))).toBe(false); // Wednesday 4:30 PM ET
  });
  it("carries Friday's cards over the weekend to Monday", () => {
    expect(cardsStillTrade("2026-11-06", new Date("2026-11-08T15:00:00Z"))).toBe(true);
    expect(cardsStillTrade("2026-11-06", new Date("2026-11-09T22:00:00Z"))).toBe(false);
  });
});

describe("getTradeCards", () => {
  it("shows tonight's published cards to a tier that includes them", async () => {
    const svc = fakeService([card("rsiReversal", "AAA", "2026-11-10", true), card("macdMomentum", "BBB", "2026-11-10", false)]);
    const t = await getTradeCards(svc, pro, tuesdayEvening);
    expect(t.signalDate).toBe("2026-11-10");
    expect(t.cards.map((c) => c.symbol)).toEqual(["AAA"]);
    expect(t.heldBack).toBe(0);
  });

  it("never shows an earlier night's card on a night with none published", async () => {
    const svc = fakeService([card("rsiReversal", "AAA", "2026-11-03", true, "no_fill"), card("macdMomentum", "BBB", "2026-11-10", false)]);
    const t = await getTradeCards(svc, pro, tuesdayEvening);
    expect(t.cards).toEqual([]);
    expect(t.signalDate).toBe("2026-11-10");
  });

  it("shows no card once its session has closed, before the next night's run", async () => {
    const svc = fakeService([card("rsiReversal", "AAA", "2026-11-10", true)]);
    const t = await getTradeCards(svc, pro, new Date("2026-11-11T21:30:00Z"));
    expect(t.signalDate).toBeNull();
    expect(t.cards).toEqual([]);
  });

  it("shows a mode's cards only to a member who chose that mode, and says where to choose it", async () => {
    const svc = fakeService([card("rsiReversal", "AAA", "2026-11-10", true), card("rsiReversal", "BBB", "2026-11-10", true)]);
    for (const mode of [null, "gsps", "macdMomentum"]) {
      const t = await getTradeCards(svc, { policy: proPolicy, mode }, tuesdayEvening);
      expect(t.cards).toEqual([]);
      expect(t.heldBack).toBe(2);
      expect(t.unchosen).toEqual([{ label: expect.any(String), count: 2 }]);
    }
  });

  it("counts but holds back cards a tier does not include, and shows none without a session", async () => {
    const svc = fakeService([card("rsiReversal", "AAA", "2026-11-10", true)]);
    const novice = await getTradeCards(svc, { policy: { allowedStrategyModes: [] } as never, mode: "rsiReversal" }, tuesdayEvening);
    expect(novice).toMatchObject({ cards: [], heldBack: 1, unchosen: [] });
    expect(await getTradeCards(svc, null, tuesdayEvening)).toMatchObject({ cards: [], heldBack: 1 });
  });

  it("shows the timed RSI card to the RSI reversal mode, once per stock, under its own label", async () => {
    const svc = fakeService([
      card("rsiReversal", "AAA", "2026-11-10", true),
      card("rsiReversalTimed", "AAA", "2026-11-10", true),
      card("rsiReversal", "BBB", "2026-11-10", true),
    ]);
    const t = await getTradeCards(svc, { policy: proPolicy, mode: "rsiReversal" }, tuesdayEvening);
    expect(t.cards.map((c) => [c.symbol, c.kind])).toEqual([
      ["AAA", "rsiReversalTimed"],
      ["BBB", "rsiReversal"],
    ]);
    expect(t.cards[0].label).toMatch(/turn date/);
    const other = await getTradeCards(svc, { policy: proPolicy, mode: "macdMomentum" }, tuesdayEvening);
    expect(other.cards).toEqual([]);
    expect(other.heldBack).toBe(2);
  });

  it("keeps the forward record, losses and no-fills included", async () => {
    const svc = fakeService([
      card("rsiReversal", "AAA", "2026-11-02", true, "good"),
      card("rsiReversal", "BBB", "2026-11-03", true, "bad"),
      card("rsiReversal", "CCC", "2026-11-04", true, "no_fill"),
      card("rsiReversal", "DDD", "2026-11-10", true),
    ]);
    const t = await getTradeCards(svc, pro, tuesdayEvening);
    const rsi = t.kinds.find((k) => k.kind === "rsiReversal")!;
    expect(rsi.forward).toMatchObject({ calls: 3, good: 1, bad: 1, noFill: 1 });
    expect(rsi.since).toBe("2026-11-02");
  });
});
