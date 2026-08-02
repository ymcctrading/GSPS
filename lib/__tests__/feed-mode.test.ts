import { afterEach, describe, expect, it } from "vitest";
import { activeFeedMode, feedModeOf } from "@/lib/data/feed-mode";
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
