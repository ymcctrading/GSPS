import { afterEach, describe, expect, it } from "vitest";
import { scanTicker } from "../scanTicker";
import {
  AlpacaBar,
  averageVolume,
  computeAtr,
  computeRsi,
  consecutiveCloses,
  createAlpacaProvider,
  hasAlpacaCredentials,
  KEY_ID_ENV_VARS,
  SECRET_ENV_VARS,
  sma,
  snapshotFromBars,
  trueRange,
} from "./alpacaProvider";

/** Build `n` ascending daily bars with a linear close drift + fixed range. */
function bars(
  n: number,
  opts: { start?: number; step?: number; vol?: number; range?: number } = {},
): AlpacaBar[] {
  const { start = 100, step = -0.5, vol = 1_000_000, range = 2 } = opts;
  return Array.from({ length: n }, (_, i) => {
    const c = start + step * i;
    const o = c - step; // opened at the prior close-ish
    return {
      t: `2026-05-${String((i % 27) + 1).padStart(2, "0")}T00:00:00Z`,
      o,
      h: Math.max(o, c) + range / 2,
      l: Math.min(o, c) - range / 2,
      c,
      v: vol,
    };
  });
}

describe("pure indicator helpers", () => {
  it("trueRange takes the widest of the three ranges", () => {
    expect(trueRange(11, 9, 10)).toBe(2); // high-low dominates
    expect(trueRange(11, 9, 5)).toBe(6); // high-prevClose dominates
    expect(trueRange(11, 9, 20)).toBe(11); // low-prevClose dominates
  });

  it("computeAtr averages true range over the period", () => {
    // Flat $2 range every bar → ATR is exactly 2.
    expect(computeAtr(bars(20, { step: 0, range: 2 }))).toBeCloseTo(2);
  });

  it("computeRsi is 100 for a pure uptrend and low for a downtrend", () => {
    const up = Array.from({ length: 20 }, (_, i) => 100 + i);
    const down = Array.from({ length: 20 }, (_, i) => 100 - i);
    expect(computeRsi(up)).toBeCloseTo(100);
    expect(computeRsi(down)).toBeLessThan(5);
  });

  it("sma and averageVolume average the trailing window", () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
    expect(averageVolume(bars(5, { vol: 500 }), 3)).toBe(500);
  });

  it("consecutiveCloses counts the trailing run in a direction", () => {
    expect(consecutiveCloses([10, 9, 8, 7], "down")).toBe(3);
    expect(consecutiveCloses([10, 9, 8, 9], "down")).toBe(0);
    expect(consecutiveCloses([1, 2, 3, 4], "up")).toBe(3);
  });
});

describe("snapshotFromBars", () => {
  it("throws with a clear message when there is too little history", () => {
    expect(() => snapshotFromBars("XYZ", bars(5))).toThrow(/need >=/);
  });

  it("derives a bullish reversion from a downtrend that sits below its mean", () => {
    const snap = snapshotFromBars("aapl", bars(30, { start: 100, step: -0.5 }));
    expect(snap.symbol).toBe("AAPL");
    expect(snap.direction).toBe("bullish");
    expect(snap.previousClose).toBeGreaterThan(snap.price);
    expect(snap.checklist).toHaveLength(9);
    expect(snap.atr).toBeGreaterThan(0);
  });

  it("derives a bearish reversion from an uptrend above its mean", () => {
    const snap = snapshotFromBars("MSFT", bars(30, { start: 100, step: 0.5 }));
    expect(snap.direction).toBe("bearish");
  });

  it("uses the injected latest trade price over the last bar close", () => {
    const snap = snapshotFromBars("AAPL", bars(30), 42);
    expect(snap.price).toBe(42);
  });

  it("flags relative volume when the last bar spikes", () => {
    const b = bars(30, { vol: 1_000_000 });
    b[b.length - 1].v = 3_000_000;
    const snap = snapshotFromBars("AAPL", b);
    expect(snap.relativeVolume).toBeGreaterThanOrEqual(2);
  });
});

describe("createAlpacaProvider", () => {
  const fakeHttp = (barsData: AlpacaBar[], price: number) => {
    return async (url: string) => {
      if (url.includes("/trades/latest")) return { trade: { p: price } };
      return { bars: barsData };
    };
  };

  it("builds a live snapshot from Alpaca payloads via the injected HTTP layer", async () => {
    const provider = createAlpacaProvider({
      credentials: { keyId: "k", secretKey: "s" },
      httpGetJson: fakeHttp(bars(30), 88.5),
    });
    const snap = await provider("aapl");
    expect(snap.symbol).toBe("AAPL");
    expect(snap.price).toBe(88.5);
  });

  it("feeds straight into scanTicker to produce a live decision", async () => {
    const provider = createAlpacaProvider({
      credentials: { keyId: "k", secretKey: "s" },
      httpGetJson: fakeHttp(bars(30), 84),
    });
    const result = await scanTicker("AAPL", undefined, provider);
    expect(["Execute", "Watch", "Reject"]).toContain(
      result.decision.outputState,
    );
    expect(result.price).toBe(84);
  });

  it("throws a helpful error when credentials are absent", async () => {
    const provider = createAlpacaProvider({ httpGetJson: fakeHttp(bars(30), 1) });
    await expect(provider("AAPL")).rejects.toThrow(/credentials missing/i);
  });
});

describe("hasAlpacaCredentials", () => {
  const CRED_VARS = [
    ...KEY_ID_ENV_VARS,
    ...SECRET_ENV_VARS,
  ];
  const original = new Map(CRED_VARS.map((v) => [v, process.env[v]]));
  afterEach(() => {
    for (const v of CRED_VARS) {
      const prev = original.get(v);
      if (prev === undefined) delete process.env[v];
      else process.env[v] = prev;
    }
  });

  it("is false with no keys and true once both are set", () => {
    for (const v of CRED_VARS) delete process.env[v];
    expect(hasAlpacaCredentials()).toBe(false);
    process.env.ALPACA_API_KEY_ID = "k";
    process.env.ALPACA_API_SECRET_KEY = "s";
    expect(hasAlpacaCredentials()).toBe(true);
  });

  it("accepts common alias names (e.g. ALPACA_API_KEY)", () => {
    for (const v of CRED_VARS) delete process.env[v];
    process.env.ALPACA_API_KEY = "k"; // no _ID suffix
    process.env.ALPACA_API_SECRET_KEY = "s";
    expect(hasAlpacaCredentials()).toBe(true);
  });
});
