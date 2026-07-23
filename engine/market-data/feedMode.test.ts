import { afterEach, describe, expect, it } from "vitest";
import { activeFeedMode } from "./marketDataIngestor";

const { MARKET_DATA_WS_URL, MARKET_DATA_API_KEY } = process.env;

afterEach(() => {
  // Restore whatever the surrounding environment had.
  restore("MARKET_DATA_WS_URL", MARKET_DATA_WS_URL);
  restore("MARKET_DATA_API_KEY", MARKET_DATA_API_KEY);
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("activeFeedMode", () => {
  it("reports 'live' when both credentials are present", () => {
    expect(
      activeFeedMode({ wsUrl: "wss://feed.example", apiKey: "secret" }),
    ).toBe("live");
  });

  it("falls back to 'simulated' when either credential is missing", () => {
    expect(activeFeedMode({ wsUrl: "wss://feed.example" })).toBe("simulated");
    expect(activeFeedMode({ apiKey: "secret" })).toBe("simulated");
    expect(activeFeedMode({})).toBe("simulated");
  });

  it("honors an explicit useSimulation override even with credentials set", () => {
    expect(
      activeFeedMode({
        useSimulation: true,
        wsUrl: "wss://feed.example",
        apiKey: "secret",
      }),
    ).toBe("simulated");
  });

  it("reads MARKET_DATA_* env vars when no opts are passed (the switch)", () => {
    process.env.MARKET_DATA_WS_URL = "wss://feed.example";
    process.env.MARKET_DATA_API_KEY = "secret";
    expect(activeFeedMode()).toBe("live");

    delete process.env.MARKET_DATA_API_KEY;
    expect(activeFeedMode()).toBe("simulated");
  });
});
