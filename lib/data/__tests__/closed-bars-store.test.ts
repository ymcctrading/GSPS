import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";
import type { BatchFetch } from "@/lib/data/monthlyStore";
import {
  fetchCryptoClosedStored,
  keepsClosedBars,
  setClosedBarsStore,
  type ClosedBarsStore,
  type StoredSeries,
} from "@/lib/data/closedBarsStore";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-09-01T00:00:00Z");

// Hourly bars from T0 up to (not including) `until`, close = index (+ `bump` on the last).
function hours(until: number, bump = 0): Bar[] {
  const out: Bar[] = [];
  for (let t = T0, i = 0; t < until; t += HOUR, i++) {
    out.push({ t: new Date(t).toISOString().replace(".000Z", "Z"), o: i, h: i + 1, l: i - 1, c: i, v: 10 });
  }
  if (bump && out.length) out[out.length - 1] = { ...out[out.length - 1], c: out[out.length - 1].c + bump };
  return out;
}

function memoryStore(): ClosedBarsStore & { rows: Map<string, StoredSeries>; writes: number } {
  const rows = new Map<string, StoredSeries>();
  const s = {
    rows,
    writes: 0,
    async read(tf: string, symbols: string[]) {
      const out = new Map<string, StoredSeries>();
      for (const sym of symbols) {
        const r = rows.get(`${tf}:${sym}`);
        if (r) out.set(sym, r);
      }
      return out;
    },
    async write(tf: string, w: Map<string, StoredSeries>) {
      s.writes++;
      for (const [sym, series] of w) rows.set(`${tf}:${sym}`, series);
    },
  };
  return s;
}

function feed(series: () => Map<string, Bar[]>) {
  return vi.fn<BatchFetch>(async (symbols, _tf, start) => {
    const out = new Map<string, Bar[]>();
    for (const s of symbols) out.set(s, (series().get(s) ?? []).filter((b) => Date.parse(b.t) >= start.getTime()));
    return out;
  });
}

const at = (iso: string) => new Date(iso);
const windowStart = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

afterEach(() => setClosedBarsStore(undefined));

describe("fetchCryptoClosedStored", () => {
  it("returns what a live read of the window returns, and later reads only the newest bars", async () => {
    const store = memoryStore();
    setClosedBarsStore(store);
    let now = at("2026-10-01T10:30:00Z");
    let live = new Map([["BTC/USD", hours(now.getTime())]]);
    const fetch = feed(() => live);
    const plain = feed(() => live);

    const first = await fetchCryptoClosedStored(fetch, ["btc/usd"], "1Hour", windowStart(now, 7), now);
    expect(first.get("BTC/USD")).toEqual((await plain(["BTC/USD"], "1Hour", windowStart(now, 7), null, "crypto")).get("BTC/USD"));
    // The forming 10:00 bar is served but not stored.
    expect(store.rows.get("1Hour:BTC/USD")!.bars.at(-1)!.t).toBe("2026-10-01T09:00:00Z");

    now = at("2026-10-01T12:30:00Z");
    live = new Map([["BTC/USD", hours(now.getTime())]]);
    const second = await fetchCryptoClosedStored(fetch, ["BTC/USD"], "1Hour", windowStart(now, 7), now);
    // Live from the last two stored bars only.
    expect(fetch.mock.calls[1][2].toISOString()).toBe("2026-10-01T08:00:00.000Z");
    expect(second.get("BTC/USD")).toEqual(live.get("BTC/USD")!.filter((b) => Date.parse(b.t) >= windowStart(now, 7).getTime()));
  });

  it("a late revision to the newest stored close is taken from the live read", async () => {
    setClosedBarsStore(memoryStore());
    const now = at("2026-10-01T10:30:00Z");
    let live = new Map([["ETH/USD", hours(now.getTime())]]);
    const fetch = feed(() => live);
    await fetchCryptoClosedStored(fetch, ["ETH/USD"], "1Hour", windowStart(now, 7), now);
    // 09:00 (newest closed) and 10:00 (forming) revised.
    live = new Map([["ETH/USD", hours(now.getTime(), 5)]]);
    const out = await fetchCryptoClosedStored(fetch, ["ETH/USD"], "1Hour", windowStart(now, 7), now);
    expect(out.get("ETH/USD")!.at(-1)!.c).toBe(live.get("ETH/USD")!.at(-1)!.c);
  });

  it("another instance reads the stored bars", async () => {
    const store = memoryStore();
    setClosedBarsStore(store);
    const now = at("2026-10-01T10:30:00Z");
    const live = new Map([["SOL/USD", hours(now.getTime())]]);
    await fetchCryptoClosedStored(feed(() => live), ["SOL/USD"], "1Hour", windowStart(now, 7), now);
    setClosedBarsStore(store); // a fresh instance holds nothing in memory
    const other = feed(() => live);
    const out = await fetchCryptoClosedStored(other, ["SOL/USD"], "1Hour", windowStart(now, 7), now);
    expect(other).toHaveBeenCalledTimes(1);
    expect(other.mock.calls[0][2].toISOString()).toBe("2026-10-01T08:00:00.000Z");
    expect(out.get("SOL/USD")).toEqual(live.get("SOL/USD")!.filter((b) => Date.parse(b.t) >= windowStart(now, 7).getTime()));
  });

  it("a wider window than the stored one is read whole", async () => {
    setClosedBarsStore(memoryStore());
    const now = at("2026-10-01T10:30:00Z");
    const live = new Map([["BTC/USD", hours(now.getTime())]]);
    const fetch = feed(() => live);
    await fetchCryptoClosedStored(fetch, ["BTC/USD"], "1Hour", windowStart(now, 7), now);
    const out = await fetchCryptoClosedStored(fetch, ["BTC/USD"], "1Hour", windowStart(now, 20), now);
    expect(fetch.mock.calls[1][2].toISOString()).toBe(windowStart(now, 20).toISOString());
    expect(out.get("BTC/USD")).toEqual(live.get("BTC/USD")!.filter((b) => Date.parse(b.t) >= windowStart(now, 20).getTime()));
  });

  it("a series that has fallen out of the window is read whole", async () => {
    setClosedBarsStore(memoryStore());
    let now = at("2026-09-05T00:30:00Z");
    let live = new Map([["BTC/USD", hours(now.getTime())]]);
    const fetch = feed(() => live);
    await fetchCryptoClosedStored(fetch, ["BTC/USD"], "1Hour", windowStart(now, 2), now);
    now = at("2026-10-01T10:30:00Z");
    live = new Map([["BTC/USD", hours(now.getTime())]]);
    await fetchCryptoClosedStored(fetch, ["BTC/USD"], "1Hour", windowStart(now, 2), now);
    expect(fetch.mock.calls[1][2].toISOString()).toBe(windowStart(now, 2).toISOString());
  });

  it("an empty live read serves the held bars", async () => {
    setClosedBarsStore(memoryStore());
    const now = at("2026-10-01T10:30:00Z");
    let live = new Map([["BTC/USD", hours(now.getTime())]]);
    const fetch = feed(() => live);
    const first = await fetchCryptoClosedStored(fetch, ["BTC/USD"], "1Hour", windowStart(now, 7), now);
    live = new Map();
    const out = await fetchCryptoClosedStored(fetch, ["BTC/USD"], "1Hour", windowStart(now, 7), now);
    expect(out.get("BTC/USD")).toEqual(first.get("BTC/USD")!.slice(0, -1));
  });

  it("a store that can't be read or written falls back to the live read", async () => {
    setClosedBarsStore({
      read: async () => {
        throw new Error("down");
      },
      write: async () => {
        throw new Error("down");
      },
    });
    const now = at("2026-10-01T10:30:00Z");
    const live = new Map([["BTC/USD", hours(now.getTime())]]);
    const out = await fetchCryptoClosedStored(feed(() => live), ["BTC/USD"], "1Hour", windowStart(now, 7), now);
    expect(out.get("BTC/USD")).toEqual(live.get("BTC/USD")!.filter((b) => Date.parse(b.t) >= windowStart(now, 7).getTime()));
  });

  it("keeps the hourly and 15-minute charts only", () => {
    expect(keepsClosedBars("1Hour")).toBe(true);
    expect(keepsClosedBars("15Min")).toBe(true);
    expect(keepsClosedBars("1Day")).toBe(false);
  });
});
