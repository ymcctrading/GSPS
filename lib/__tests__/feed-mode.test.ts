import { afterEach, describe, expect, it, vi } from "vitest";
import { activeFeedMode, assertLiveMarketData, feedModeOf, SyntheticMarketDataError, syntheticDataRefusal } from "@/lib/data/feed-mode";
import { quotePrice } from "@/lib/brokers/simulator";
import { runMarketScan } from "@/lib/marketScan";
import type { MarketDataProvider } from "@/lib/data/provider";

// Every Alpaca key spelling the provider seam accepts, so the auto-fallback
// case can't pick up an ambient credential and flip to "live".
const ALPACA_KEYS = [
  "ALPACA_API_KEY",
  "ALPACAP_API",
  "ALPACA_KEY_ID",
  "APCA_API_KEY_ID",
  "ALPACA_API_SECRET",
  "ALPACA_API_SECRET_KEY",
  "ALPACA_SECRET_KEY",
  "APCA_API_SECRET_KEY",
] as const;
const ENV_KEYS = ["MARKET_DATA_PROVIDER", ...ALPACA_KEYS] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const provider = (isLive: boolean, name: string): MarketDataProvider =>
  ({ name, isLive }) as MarketDataProvider;

describe("feedModeOf", () => {
  it("maps a live provider to 'live'", () => {
    expect(feedModeOf(provider(true, "alpaca"))).toBe("live");
  });

  it("maps a non-live provider to 'simulated'", () => {
    expect(feedModeOf(provider(false, "synthetic"))).toBe("simulated");
  });
});

describe("activeFeedMode", () => {
  it("is 'simulated' when the synthetic provider is selected", () => {
    process.env.MARKET_DATA_PROVIDER = "synthetic";
    expect(activeFeedMode()).toBe("simulated");
  });

  it("is 'live' when the Alpaca provider is selected", () => {
    process.env.MARKET_DATA_PROVIDER = "alpaca";
    expect(activeFeedMode()).toBe("live");
  });

  it("auto-falls back to 'simulated' with no provider set and no Alpaca keys", () => {
    for (const k of ENV_KEYS) delete process.env[k];
    expect(activeFeedMode()).toBe("simulated");
  });
});

describe("syntheticDataRefusal (senior code review, lib/data)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const clearAlpaca = () => {
    for (const k of ALPACA_KEYS) delete process.env[k];
    delete process.env.MARKET_DATA_PROVIDER;
  };

  it("refuses synthetic data in production, with the action and a fix in the reason, and logs it", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const reason = syntheticDataRefusal("run the market scan", provider(false, "synthetic"));
    expect(reason).toMatch(/^Refused to run the market scan: market data is coming from the "synthetic" generator/);
    expect(reason).toMatch(/Alpaca key and secret/);
    expect(log).toHaveBeenCalledWith(`[market-data] ${reason}`);
  });

  it("allows a live provider in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(syntheticDataRefusal("run the market scan", provider(true, "alpaca"))).toBeNull();
  });

  it("allows synthetic data in tests and local development", () => {
    expect(syntheticDataRefusal("run the market scan", provider(false, "synthetic"))).toBeNull();
    vi.stubEnv("NODE_ENV", "development");
    expect(syntheticDataRefusal("run the market scan", provider(false, "synthetic"))).toBeNull();
  });

  it("throws the same reason where a caller fails closed on a throw", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertLiveMarketData("arm a plan", provider(false, "synthetic"))).toThrow(SyntheticMarketDataError);
  });

  it("gives no paper quote on the synthetic fallback in production, so nothing fills or exits", async () => {
    clearAlpaca();
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await quotePrice("AAPL", "us_equity")).toBeNull();
  });

  it("still quotes the synthetic fallback outside production", async () => {
    clearAlpaca();
    expect(await quotePrice("AAPL", "us_equity")).toBeGreaterThan(0);
  });

  it("refuses to run (and so to publish) the market scan on the synthetic fallback in production", async () => {
    clearAlpaca();
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runMarketScan(5)).rejects.toThrow(/Refused to run the market scan/);
  });
});
