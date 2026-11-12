/**
 * The real options chain (owner, 2026-11-12: strikes, quotes, volume, open
 * interest and greeks must all be real). Snapshots below are shaped like
 * Alpaca's indicative-feed answers read on 2026-11-12 for AAPL.
 */
import { describe, it, expect } from "vitest";
import {
  contractFromSnapshot,
  contractsFromSnapshots,
  expirationsFromSymbols,
  fetchLiveOptionChain,
  observedPremium,
  type RawOptionSnapshot,
} from "@/lib/options/liveChain";
import type { OptionContract as BrokerContract } from "@/lib/brokers/alpaca";

const NOW = new Date("2026-11-11T21:00:00Z"); // 4:00 PM ET, after the close
const SPOT = 358;

const quoteOnly: RawOptionSnapshot = {
  latestQuote: { bp: 8.31, ap: 8.58, t: "2026-11-11T20:59:59Z" },
  latestTrade: { p: 9.62, t: "2026-11-11T20:40:00Z" },
  dailyBar: { v: 3533, t: "2026-11-11T05:00:00Z" },
};

describe("contractFromSnapshot", () => {
  it("reads the listed strike, type and expiration from the OCC symbol, and the quote as sent", () => {
    const c = contractFromSnapshot("AAPL261218C00360000", quoteOnly, SPOT, 1200, NOW)!;
    expect(c).toMatchObject({
      strike: 360,
      type: "call",
      expiration: "2026-12-18",
      bid: 8.31,
      ask: 8.58,
      last: 9.62,
      volume: 3533,
      openInterest: 1200,
      inTheMoney: false,
      contractSymbol: "AAPL261218C00360000",
      quoteTime: "2026-11-11T20:59:59Z",
    });
  });

  it("solves IV and greeks from the quote's mid when the feed sends none, close to the feed's own figures", () => {
    const c = contractFromSnapshot("AAPL261218C00360000", quoteOnly, SPOT, null, NOW)!;
    expect(c.greeksSource).toBe("model");
    // The feed's own answer for this contract that day: IV 0.207, delta 0.4842.
    expect(c.iv!).toBeCloseTo(0.207, 2);
    expect(c.delta!).toBeGreaterThan(0.45);
    expect(c.delta!).toBeLessThan(0.52);
    expect(c.theta!).toBeLessThan(0);
    expect(c.gamma!).toBeGreaterThan(0);
    expect(c.vega!).toBeGreaterThan(0);
  });

  it("uses the feed's own greeks and IV when it sends a complete set", () => {
    const c = contractFromSnapshot(
      "AAPL261218P00350000",
      { ...quoteOnly, greeks: { delta: -0.36681, gamma: 0.0135, theta: -0.1312, vega: 0.4221 }, impliedVolatility: 0.2491 },
      SPOT,
      null,
      NOW,
    )!;
    expect(c).toMatchObject({ greeksSource: "feed", delta: -0.3668, gamma: 0.0135, theta: -0.1312, vega: 0.4221, iv: 0.249 });
  });

  it("shows no greeks, rather than invented ones, when the premium is at or below intrinsic value", () => {
    // A 300 call with the stock at 358 is worth at least 58; a 50 quote no volatility reprices.
    const c = contractFromSnapshot(
      "AAPL261218C00300000",
      { latestQuote: { bp: 49, ap: 51 } },
      SPOT,
      null,
      NOW,
    )!;
    expect(c).toMatchObject({ greeksSource: "none", iv: null, delta: null, gamma: null, theta: null, vega: null });
  });

  it("leaves a missing side of the quote, the last trade and the volume empty, never zero", () => {
    const c = contractFromSnapshot("AAPL261218C00360000", { latestQuote: { bp: 0, ap: 8.5 } }, SPOT, null, NOW)!;
    expect(c.bid).toBeNull();
    expect(c.ask).toBe(8.5);
    expect(c.last).toBeNull();
    expect(c.volume).toBeNull();
    expect(c.openInterest).toBeNull();
  });

  it("is null for a symbol that is not an OCC option symbol", () => {
    expect(contractFromSnapshot("AAPL", quoteOnly, SPOT, null, NOW)).toBeNull();
  });
});

describe("observedPremium", () => {
  it("is the mid of a two-sided quote, else the last trade", () => {
    expect(observedPremium(1, 1.2, 5)).toBe(1.1);
    expect(observedPremium(null, 1.2, 5)).toBe(5);
    expect(observedPremium(1.3, 1.2, 5)).toBe(5); // crossed quote
    expect(observedPremium(null, null, null)).toBeNull();
  });
});

describe("contractsFromSnapshots", () => {
  it("counts volume only in the chain's latest session, and sorts by strike, call first", () => {
    const out = contractsFromSnapshots(
      {
        "AAPL261218P00360000": { ...quoteOnly, dailyBar: { v: 40, t: "2026-11-10T05:00:00Z" } },
        "AAPL261218C00360000": quoteOnly,
        "AAPL261218C00355000": { ...quoteOnly, dailyBar: { v: 7, t: "2026-11-11T05:00:00Z" } },
      },
      SPOT,
      new Map([["AAPL261218C00360000", 900]]),
      NOW,
    );
    expect(out.map((c) => `${c.strike}${c.type[0]}`)).toEqual(["355c", "360c", "360p"]);
    expect(out.map((c) => c.volume)).toEqual([7, 3533, 0]);
    expect(out.map((c) => c.openInterest)).toEqual([null, 900, null]);
  });
});

describe("expirationsFromSymbols", () => {
  it("lists each listed expiration once, ascending, from today on", () => {
    expect(
      expirationsFromSymbols(
        ["AAPL261218C00360000", "AAPL261113C00360000", "AAPL261218C00365000", "AAPL261110C00360000", "junk"],
        "2026-11-11",
      ),
    ).toEqual(["2026-11-13", "2026-12-18"]);
  });
});

describe("fetchLiveOptionChain", () => {
  const listed = ["2026-11-13", "2026-11-20", "2026-12-04", "2026-12-18", "2027-01-15"];
  const probeSymbols = listed.map((e) => `AAPL${e.slice(2).replace(/-/g, "")}C00360000`);

  function deps(opts: { withBroker: boolean }) {
    const calls: Array<Record<string, string>> = [];
    return {
      calls,
      deps: {
        now: NOW,
        fetchSpot: async () => SPOT,
        snapshots: (async (q: { underlying: string; filters?: Record<string, string> } | { symbols: string[] }) => {
          if (!("underlying" in q)) return {};
          calls.push(q.filters ?? {});
          if (q.filters?.type === "call" && !q.filters.expiration_date) {
            return Object.fromEntries(probeSymbols.map((s) => [s, {}]));
          }
          const exp = q.filters!.expiration_date.slice(2).replace(/-/g, "");
          return {
            [`AAPL${exp}C00360000`]: quoteOnly,
            [`AAPL${exp}P00360000`]: { latestQuote: { bp: 11.36, ap: 11.86 }, dailyBar: { v: 462, t: "2026-11-11T05:00:00Z" } },
          };
        }) as never,
        listContracts: opts.withBroker
          ? async (q: { expiration?: string }): Promise<BrokerContract[]> =>
              q.expiration
                ? [
                    {
                      symbol: `AAPL${q.expiration.slice(2).replace(/-/g, "")}C00360000`,
                      name: "",
                      type: "call",
                      strike_price: "360",
                      expiration_date: q.expiration,
                      open_interest: "15234",
                    },
                  ]
                : listed.map((e, i) => ({
                    symbol: probeSymbols[i],
                    name: "",
                    type: "call" as const,
                    strike_price: "360",
                    expiration_date: e,
                  }))
          : null,
      },
    };
  }

  it("opens on the 30-day option term: the nearest listed expiration at least 30 days out", async () => {
    const { deps: d } = deps({ withBroker: false });
    const chain = await fetchLiveOptionChain("aapl", "us_equity", undefined, d);
    expect(chain.simulated).toBe(false);
    expect(chain.symbol).toBe("AAPL");
    expect(chain.expirations).toEqual(listed);
    expect(chain.expiration).toBe("2026-12-18");
    expect(chain.contracts.map((c) => [c.strike, c.type, c.expiration])).toEqual([
      [360, "call", "2026-12-18"],
      [360, "put", "2026-12-18"],
    ]);
    // Without the broker's contract list there is no open interest to show.
    expect(chain.contracts.every((c) => c.openInterest === null)).toBe(true);
  });

  it("serves the asked expiration when it is listed, and the default when it is not", async () => {
    const { deps: d } = deps({ withBroker: false });
    expect((await fetchLiveOptionChain("AAPL", "us_equity", "2026-11-20", d)).expiration).toBe("2026-11-20");
    expect((await fetchLiveOptionChain("AAPL", "us_equity", "2026-11-21", d)).expiration).toBe("2026-12-18");
  });

  it("reads the strikes ±20% around the price for the chosen expiration", async () => {
    const { deps: d, calls } = deps({ withBroker: false });
    await fetchLiveOptionChain("AAPL", "us_equity", undefined, d);
    expect(calls.at(-1)).toEqual({ expiration_date: "2026-12-18", strike_price_gte: "286.40", strike_price_lte: "429.60" });
  });

  it("takes the listed expirations and the open interest from the broker's contract list when it is reachable", async () => {
    const { deps: d, calls } = deps({ withBroker: true });
    const chain = await fetchLiveOptionChain("AAPL", "us_equity", undefined, d);
    expect(chain.expirations).toEqual(listed);
    expect(calls).toHaveLength(1); // only the quotes; no snapshot probe for expirations
    expect(chain.contracts.find((c) => c.type === "call")!.openInterest).toBe(15234);
  });

  it("refuses crypto, which has no listed options", async () => {
    const { deps: d } = deps({ withBroker: false });
    await expect(fetchLiveOptionChain("BTC/USD", "crypto", undefined, d)).rejects.toThrow(/US stocks and funds only/);
  });

  it("says so when nothing is listed", async () => {
    await expect(
      fetchLiveOptionChain("ZZZZ", "us_equity", undefined, {
        now: NOW,
        fetchSpot: async () => 10,
        snapshots: (async () => ({})) as never,
        listContracts: null,
      }),
    ).rejects.toThrow(/No listed options for ZZZZ/);
  });
});
