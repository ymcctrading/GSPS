import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";
import {
  fetchMonthlyStored,
  fromRows,
  setMonthlyBarsStore,
  storedAgrees,
  toRows,
  type BatchFetch,
  type MonthlyBarsStore,
} from "@/lib/data/monthlyStore";
import { parallelChunkSize } from "@/lib/data/alpaca";

// Monthly bars from Jan 2016 through `last` (YYYY-MM), close = 100 + index.
function months(last: string, factor = 1): Bar[] {
  const [ly, lm] = last.split("-").map(Number);
  const out: Bar[] = [];
  for (let y = 2016, m = 1, i = 0; y < ly || (y === ly && m <= lm); i++) {
    const c = (100 + i) * factor;
    out.push({ t: `${y}-${String(m).padStart(2, "0")}-01T04:00:00Z`, o: c, h: c + 1, l: c - 1, c, v: 1000 + i });
    m++;
    if (m === 13) {
      m = 1;
      y++;
    }
  }
  return out;
}

function memoryStore(): MonthlyBarsStore & { rows: Map<string, Bar[]>; writes: number } {
  const rows = new Map<string, Bar[]>();
  const s = {
    rows,
    writes: 0,
    async read(month: string, symbols: string[]) {
      const out = new Map<string, Bar[]>();
      for (const sym of symbols) {
        const r = rows.get(`${month}:${sym}`);
        if (r) out.set(sym, fromRows(toRows(r)));
      }
      return out;
    },
    async write(month: string, w: Map<string, Bar[]>) {
      s.writes++;
      for (const [sym, bars] of w) rows.set(`${month}:${sym}`, bars);
    },
  };
  return s;
}

// A feed serving each symbol's series from `series`, filtered by start.
function feed(series: () => Map<string, Bar[]>) {
  const fn = vi.fn<BatchFetch>(async (symbols, _tf, start) => {
    const out = new Map<string, Bar[]>();
    for (const s of symbols) out.set(s, (series().get(s) ?? []).filter((b) => Date.parse(b.t) >= start.getTime()));
    return out;
  });
  return fn;
}

const NOW = new Date("2026-10-23T14:00:00Z");
const TEN_YEARS = new Date("2016-10-23T00:00:00Z");
const sinceTen = (b: Bar) => Date.parse(b.t) >= TEN_YEARS.getTime();

afterEach(() => setMonthlyBarsStore(undefined));

describe("fetchMonthlyStored", () => {
  it("reads the whole history once, then only the last two months", async () => {
    const store = memoryStore();
    setMonthlyBarsStore(store);
    const live = new Map([["AAA", months("2026-10")]]);
    const fetch = feed(() => live);

    const first = await fetchMonthlyStored(fetch, ["aaa"], TEN_YEARS, null, NOW);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][2].toISOString()).toBe("2016-01-01T00:00:00.000Z");
    expect(first.get("AAA")).toEqual(months("2026-10").filter(sinceTen));
    // Closed months only are stored: September is the last.
    expect(store.rows.get("2026-10:AAA")!.at(-1)!.t).toBe("2026-09-01T04:00:00Z");

    const second = await fetchMonthlyStored(fetch, ["AAA"], TEN_YEARS, null, NOW);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][2].toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(second.get("AAA")).toEqual(first.get("AAA"));
    expect(store.writes).toBe(1);
  });

  it("another instance reads the stored months", async () => {
    const store = memoryStore();
    setMonthlyBarsStore(store);
    const live = new Map([["AAA", months("2026-10")]]);
    const fetch = feed(() => live);
    await fetchMonthlyStored(fetch, ["AAA"], TEN_YEARS, null, NOW);
    setMonthlyBarsStore(store); // clears memory, as a fresh instance has none
    const other = feed(() => live);
    const out = await fetchMonthlyStored(other, ["AAA"], TEN_YEARS, null, NOW);
    expect(other).toHaveBeenCalledTimes(1);
    expect(other.mock.calls[0][2].toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(out.get("AAA")).toEqual(months("2026-10").filter(sinceTen));
  });

  it("a split since the store was written reads the history again", async () => {
    const store = memoryStore();
    setMonthlyBarsStore(store);
    let live = new Map([["AAA", months("2026-10")]]);
    const fetch = feed(() => live);
    await fetchMonthlyStored(fetch, ["AAA"], TEN_YEARS, null, NOW);
    live = new Map([["AAA", months("2026-10", 0.5)]]); // a 2-for-1 adjusts every close
    const out = await fetchMonthlyStored(fetch, ["AAA"], TEN_YEARS, null, NOW);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(out.get("AAA")![0].c).toBe(months("2026-10", 0.5).find(sinceTen)!.c);
    expect(store.rows.get("2026-10:AAA")![0].c).toBe(50);
  });

  it("a new month reads again", async () => {
    const store = memoryStore();
    setMonthlyBarsStore(store);
    const live = new Map([["AAA", months("2026-11")]]);
    const fetch = feed(() => live);
    await fetchMonthlyStored(fetch, ["AAA"], TEN_YEARS, null, NOW);
    await fetchMonthlyStored(fetch, ["AAA"], TEN_YEARS, null, new Date("2026-11-03T14:00:00Z"));
    expect(fetch.mock.calls[1][2].toISOString()).toBe("2016-01-01T00:00:00.000Z");
    expect(store.rows.get("2026-11:AAA")!.at(-1)!.t).toBe("2026-10-01T04:00:00Z");
  });

  it("files the month in New York time", async () => {
    const store = memoryStore();
    setMonthlyBarsStore(store);
    const live = new Map([["AAA", months("2026-10")]]);
    // 02:00 UTC on Nov 1 is still Oct 31 in New York.
    await fetchMonthlyStored(feed(() => live), ["AAA"], TEN_YEARS, null, new Date("2026-11-01T02:00:00Z"));
    expect(store.rows.has("2026-10:AAA")).toBe(true);
  });

  it("a store that can't be read falls back to the live read", async () => {
    setMonthlyBarsStore({
      read: async () => {
        throw new Error("down");
      },
      write: async () => {
        throw new Error("down");
      },
    });
    const live = new Map([["AAA", months("2026-10")]]);
    const out = await fetchMonthlyStored(feed(() => live), ["AAA"], TEN_YEARS, null, NOW);
    expect(out.get("AAA")).toEqual(months("2026-10").filter(sinceTen));
  });

  it("a window from before 2016 gets the whole series", async () => {
    setMonthlyBarsStore(memoryStore());
    const live = new Map([["AAA", months("2026-10")]]);
    const fetch = feed(() => live);
    const sixtyYears = new Date("1965-10-23T00:00:00Z");
    await fetchMonthlyStored(fetch, ["AAA"], sixtyYears, null, NOW);
    const out = await fetchMonthlyStored(fetch, ["AAA"], sixtyYears, null, NOW);
    expect(out.get("AAA")).toEqual(months("2026-10"));
  });

  it("two overlapping reads after a split both get the new history", async () => {
    const store = memoryStore();
    setMonthlyBarsStore(store);
    let live = new Map([["AAA", months("2026-10")]]);
    const fetch = feed(() => live);
    await fetchMonthlyStored(fetch, ["AAA"], TEN_YEARS, null, NOW);
    live = new Map([["AAA", months("2026-10", 0.5)]]);
    const [a, b] = await Promise.all([
      fetchMonthlyStored(fetch, ["AAA"], TEN_YEARS, null, NOW),
      fetchMonthlyStored(fetch, ["AAA"], TEN_YEARS, null, NOW),
    ]);
    const want = months("2026-10", 0.5).filter(sinceTen);
    expect(a.get("AAA")).toEqual(want);
    expect(b.get("AAA")).toEqual(want);
    // One whole-history read, shared: the first read, two recent reads, one reread.
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("two overlapping cold reads share one whole-history read", async () => {
    setMonthlyBarsStore(memoryStore());
    const live = new Map([["AAA", months("2026-10")], ["BBB", months("2026-10")]]);
    const fetch = feed(() => live);
    const [a, b] = await Promise.all([
      fetchMonthlyStored(fetch, ["AAA", "BBB"], TEN_YEARS, null, NOW),
      fetchMonthlyStored(fetch, ["AAA"], new Date("1965-01-01T00:00:00Z"), null, NOW),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a.get("BBB")).toEqual(months("2026-10").filter(sinceTen));
    expect(b.get("AAA")).toEqual(months("2026-10"));
  });

  it("a stock with no bar last month, or listed this month, is served", async () => {
    setMonthlyBarsStore(memoryStore());
    const halted = months("2026-08");
    const listed = [{ t: "2026-10-01T04:00:00Z", o: 10, h: 11, l: 9, c: 10, v: 5 }];
    const live = new Map([["HLT", halted], ["NEW", listed]]);
    const fetch = feed(() => live);
    await fetchMonthlyStored(fetch, ["HLT", "NEW"], TEN_YEARS, null, NOW);
    const out = await fetchMonthlyStored(fetch, ["HLT", "NEW"], TEN_YEARS, null, NOW);
    expect(out.get("HLT")).toEqual(halted.filter(sinceTen));
    expect(out.get("NEW")).toEqual(listed);
    expect(out.has("ZZZ")).toBe(false);
  });

  it("a failed store write still returns the bars", async () => {
    setMonthlyBarsStore({
      read: async () => new Map(),
      write: async () => {
        throw new Error("down");
      },
    });
    const live = new Map([["AAA", months("2026-10")]]);
    const out = await fetchMonthlyStored(feed(() => live), ["AAA"], TEN_YEARS, null, NOW);
    expect(out.get("AAA")).toEqual(months("2026-10").filter(sinceTen));
  });

  it("round-trips the stored form", () => {
    const bars = months("2016-03");
    expect(fromRows(toRows(bars))).toEqual(bars);
  });

  it("storedAgrees needs the same closed months and closes", () => {
    const stored = months("2026-09");
    expect(storedAgrees(stored, months("2026-10").slice(-2), "2026-10")).toBe(true);
    expect(storedAgrees(stored, months("2026-10", 1.01).slice(-2), "2026-10")).toBe(false);
    expect(storedAgrees(months("2026-08"), months("2026-10").slice(-2), "2026-10")).toBe(false);
  });
});

describe("parallelChunkSize", () => {
  const end = new Date("2026-10-23T10:30:00Z");
  it("splits a long read held in one chunk", () => {
    // 12 crypto pairs' hourly bars over 30 days: 45 pages in one chunk on 2026-10-23.
    const start = new Date(end.getTime() - 30 * 86_400_000);
    expect(parallelChunkSize(12, 13, "1Hour", start, end, "crypto", end.getTime())).toBe(4);
  });
  it("leaves a short read whole", () => {
    const start = new Date(end.getTime() - 365 * 86_400_000);
    expect(parallelChunkSize(10, 34, "1Week", start, end, "us_equity", end.getTime())).toBe(34);
  });
  it("leaves a read already in enough chunks", () => {
    const start = new Date(end.getTime() - 10 * 365 * 86_400_000);
    expect(parallelChunkSize(250, 74, "1Month", start, end, "us_equity", end.getTime())).toBe(74);
  });
});
