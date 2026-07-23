import { afterEach, describe, expect, it } from "vitest";
import { activeFeedMode, resolveFeedMode } from "./marketDataIngestor";

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

// The pure rule — deliberately independent of the environment.
describe("resolveFeedMode", () => {
  it("reports 'live' only when both credentials are present", () => {
    expect(
      resolveFeedMode({ wsUrl: "wss://feed.example", apiKey: "secret" }),
    ).toBe("live");
  });

  it("falls back to 'simulated' when either credential is missing", () => {
    expect(resolveFeedMode({ wsUrl: "wss://feed.example" })).toBe("simulated");
    expect(resolveFeedMode({ apiKey: "secret" })).toBe("simulated");
    expect(resolveFeedMode({})).toBe("simulated");
  });

  it("honors an explicit useSimulation override even with credentials set", () => {
    expect(
      resolveFeedMode({
        useSimulation: true,
        wsUrl: "wss://feed.example",
        apiKey: "secret",
      }),
    ).toBe("simulated");
  });
});

// The health-check entry point — reads the MARKET_DATA_* switch from env.
describe("activeFeedMode", () => {
  it("is 'live' when both env vars are set", () => {
    process.env.MARKET_DATA_WS_URL = "wss://feed.example";
    process.env.MARKET_DATA_API_KEY = "secret";
    expect(activeFeedMode()).toBe("live");
  });

  it("is 'simulated' when either env var is missing", () => {
    process.env.MARKET_DATA_WS_URL = "wss://feed.example";
    delete process.env.MARKET_DATA_API_KEY;
    expect(activeFeedMode()).toBe("simulated");

    delete process.env.MARKET_DATA_WS_URL;
    expect(activeFeedMode()).toBe("simulated");
  });
});
