import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { applySchoolPicks, normalizeSchoolPicks, pickKindOf, readSchoolPicks } from "../picks";
import { MARKET_SUGGESTIONS, PICK_QUESTIONS, suggestionsFor } from "../pickPrompts";
import { chooseExample, EXAMPLE_TITLES, findExample, type ExampleKind } from "../examples";
import { LESSON_EXAMPLES } from "../lessonExamples";
import { completedDays } from "../exampleData";
import { ACADEMIES } from "../curriculum";

/** Daily bars walking one point a bar through `waypoints`. */
function path(waypoints: number[], volumeAt?: (i: number) => number): Bar[] {
  const closes: number[] = [waypoints[0]];
  for (let k = 1; k < waypoints.length; k++) {
    const from = waypoints[k - 1];
    const to = waypoints[k];
    const steps = Math.max(1, Math.round(Math.abs(to - from)));
    for (let i = 1; i <= steps; i++) closes.push(from + ((to - from) * i) / steps);
  }
  const start = Date.UTC(2024, 0, 2);
  return closes.map((c, i) => ({
    t: new Date(start + i * 86_400_000).toISOString(),
    o: c,
    h: c + 0.2,
    l: c - 0.2,
    c,
    v: volumeAt ? volumeAt(i) : 1000,
  }));
}

describe("school picks", () => {
  it("reads each kind of market", () => {
    expect(pickKindOf("aapl")).toBe("us_equity");
    expect(pickKindOf("BRK.B")).toBe("us_equity");
    expect(pickKindOf("BTC/USD")).toBe("crypto");
    expect(pickKindOf("EUR/USD")).toBe("forex");
    expect(pickKindOf("/ES")).toBe("future");
    expect(pickKindOf("")).toBeNull();
    expect(pickKindOf("NOT A TICKER")).toBeNull();
  });

  it("needs three markets and one US stock", () => {
    expect(normalizeSchoolPicks(["AAPL", "MSFT"]).ok).toBe(false);
    expect(normalizeSchoolPicks(["BTC/USD", "ETH/USD", "EUR/USD"]).ok).toBe(false);
    expect(normalizeSchoolPicks("AAPL").ok).toBe(false);
    const ok = normalizeSchoolPicks([" aapl", "AAPL", "btc/usd", "/ES"]);
    expect(ok).toEqual({
      ok: true,
      symbols: [
        { symbol: "AAPL", kind: "us_equity" },
        { symbol: "BTC/USD", kind: "crypto" },
        { symbol: "/ES", kind: "future" },
      ],
    });
  });

  it("refuses more than nine", () => {
    const ten = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "KO", "PEP", "WMT"];
    expect(normalizeSchoolPicks(ten).ok).toBe(false);
  });

  it("keeps other prefs and counts changes", () => {
    const first = normalizeSchoolPicks(["AAPL", "MSFT", "SPY"]);
    if (!first.ok) throw new Error("expected ok");
    const t0 = new Date("2026-10-01T00:00:00Z");
    const a = applySchoolPicks({ theme: "dark" }, first.symbols, t0);
    expect(a.prefs.theme).toBe("dark");
    expect(a.picks.changes).toBe(0);
    expect(readSchoolPicks(a.prefs)?.symbols).toHaveLength(3);

    const same = applySchoolPicks(a.prefs, first.symbols, new Date("2026-10-05T00:00:00Z"));
    expect(same.picks.changes).toBe(0);
    expect(same.picks.savedAt).toBe(t0.toISOString());

    const next = normalizeSchoolPicks(["AAPL", "MSFT", "KO"]);
    if (!next.ok) throw new Error("expected ok");
    const b = applySchoolPicks(same.prefs, next.symbols, new Date("2026-10-09T00:00:00Z"));
    expect(b.picks.changes).toBe(1);
    expect(b.picks.firstSavedAt).toBe(t0.toISOString());
  });

  it("ignores an unreadable stored value", () => {
    expect(readSchoolPicks({ schoolPicks: { symbols: "AAPL" } })).toBeNull();
    expect(readSchoolPicks(null)).toBeNull();
  });
});

describe("guiding questions", () => {
  it("offers only stocks the scanner covers", () => {
    const universe = new Set(LARGE_CAP_UNIVERSE);
    const missing = PICK_QUESTIONS.flatMap((q) => q.answers.flatMap((a) => a.companies.map((c) => c.symbol))).filter(
      (s) => !universe.has(s),
    );
    expect(missing).toEqual([]);
    for (const m of MARKET_SUGGESTIONS) expect(pickKindOf(m.symbol)).not.toBeNull();
  });

  it("lists each company once, first answer first", () => {
    const s = suggestionsFor(["phone", "computer"]);
    expect(s.map((x) => x.symbol)).toEqual(["AAPL", "QCOM", "VZ", "MSFT", "NVDA"]);
    expect(s[0].because).toBe("My phone");
  });
});

describe("lesson examples", () => {
  it("maps only lessons that exist", () => {
    const ids = new Set(ACADEMIES.flatMap((a) => a.courses.flatMap((c) => c.lessons.map((l) => l.id))));
    for (const id of Object.keys(LESSON_EXAMPLES)) expect(ids.has(id), id).toBe(true);
  });

  it("finds a bear market and a correction", () => {
    const bars = path([100, 130, 90, 110, 98, 105]);
    const bear = findExample(bars, "bear_market");
    expect(bear?.caption).toMatch(/fell 31%/);
    expect(bear?.points[0].price).toBe(130);
    const corr = findExample(bars, "correction");
    expect(corr?.points.map((p) => p.price)).toEqual([110, 98]);
  });

  it("finds a bull market", () => {
    const bars = path([100, 80, 110, 105]);
    const bull = findExample(bars, "bull_market");
    expect(bull?.points.map((p) => p.price)).toEqual([80, 110]);
  });

  it("finds a breakout from a narrow range", () => {
    const range = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 100 : 104));
    const bars = path([90, ...range, 120]);
    const m = findExample(bars, "trading_range_breakout");
    expect(m?.points[0].text).toBe("breakout");
    expect(m?.lines.map((l) => l.label)).toEqual(["range top", "range bottom"]);
  });

  it("finds an uptrend and an Elliott count", () => {
    const bars = path([100, 120, 110, 145, 132, 150, 138, 144, 130, 136]);
    expect(findExample(bars, "uptrend")).not.toBeNull();
    const five = findExample(bars, "elliott_five_waves");
    expect(five?.points.map((p) => p.text)).toEqual(["start", "1", "2", "3", "4", "5"]);
    expect(five?.caption).toMatch(/One valid count; others are possible\.$/);
  });

  it("finds heavy volume at a turn", () => {
    const bars = path([100, 130, 110, 140, 120], (i) => (i === 80 ? 5000 : 1000));
    expect(bars[80].c).toBe(140);
    const m = findExample(bars, "volume_at_turn");
    expect(m?.caption).toMatch(/swing high on 5\.0 times/);
  });

  it("uses the stand-in only when no pick has the example", () => {
    const flat = path(Array.from({ length: 20 }, (_, i) => (i % 2 ? 100 : 101)));
    const bear = path([100, 130, 90, 100]);
    const mine = chooseExample("bear_market", new Map([["AAPL", flat]]), ["AAPL"], { symbol: "SPY", bars: bear });
    expect(mine?.symbol).toBe("SPY");
    expect(mine?.standIn).toBe(true);
    const own = chooseExample("bear_market", new Map([["AAPL", bear]]), ["AAPL"], { symbol: "SPY", bars: bear });
    expect(own).toMatchObject({ symbol: "AAPL", standIn: false });
    expect(chooseExample("bear_market", new Map(), [], null)).toBeNull();
  });

  it("keeps every title and caption to public words", () => {
    // Spelled in pieces so the copy gate doesn't read the guard itself as copy.
    const banned = new RegExp(["ga" + "nn", "jen" + "sen", "de" + "wey", "her" + "metic", "swing chart", "over-?balance", "square of", "anniversar", "cycle"].join("|"), "i");
    for (const t of Object.values(EXAMPLE_TITLES)) expect(t).not.toMatch(banned);
    const all = path([100, 130, 90, 110, 100, 105, 120, 110, 145, 132, 150, 138, 144, 130, 136]);
    for (const kind of Object.keys(EXAMPLE_TITLES) as ExampleKind[]) {
      const m = findExample(all, kind);
      if (m) expect(m.caption, kind).not.toMatch(banned);
    }
  });

  it("drops today's unfinished bar", () => {
    const bars = path([100, 103]);
    const now = new Date(Date.parse(bars[bars.length - 1].t) + 3_600_000);
    expect(completedDays(bars, true, now)).toHaveLength(bars.length - 1);
  });
});
