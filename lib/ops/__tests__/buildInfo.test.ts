import { afterEach, describe, expect, it, vi } from "vitest";
import { readBuildInfo } from "../buildInfo";

const SHA = "d2e65d0a1b2c3d4e5f60718293a4b5c6d7e8f901";

describe("readBuildInfo", () => {
  it("keeps a full commit id and a valid build time", () => {
    expect(readBuildInfo({ commit: SHA, builtAt: "2026-11-30T15:04:05.000Z" })).toEqual({
      commit: SHA,
      builtAt: "2026-11-30T15:04:05.000Z",
    });
  });

  it("lower-cases and trims the commit id", () => {
    expect(readBuildInfo({ commit: ` ${SHA.toUpperCase()}\n` }).commit).toBe(SHA);
  });

  it("returns null for a missing, empty, short or non-hex commit", () => {
    for (const commit of [undefined, null, "", "d2e65d0", `${SHA}0`, "z".repeat(40)]) {
      expect(readBuildInfo({ commit }).commit).toBeNull();
    }
  });

  it("returns null for a missing or unparseable build time", () => {
    for (const builtAt of [undefined, null, "", "not a date"]) {
      expect(readBuildInfo({ builtAt }).builtAt).toBeNull();
    }
  });

  it("normalises a parseable build time to UTC ISO", () => {
    expect(readBuildInfo({ builtAt: "2026-11-30T10:04:05-05:00" }).builtAt).toBe(
      "2026-11-30T15:04:05.000Z",
    );
  });
});

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports the build's commit and build time beside the feed mode", async () => {
    vi.stubEnv("GSPS_BUILD_COMMIT", SHA);
    vi.stubEnv("GSPS_BUILD_TIME", "2026-11-30T15:04:05.000Z");
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const body = await res.json();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("ok");
    expect(body.commit).toBe(SHA);
    expect(body.builtAt).toBe("2026-11-30T15:04:05.000Z");
    expect(typeof body.feedMode).toBe("string");
  });

  it("answers null for both when the build carried neither", async () => {
    vi.stubEnv("GSPS_BUILD_COMMIT", "");
    vi.stubEnv("GSPS_BUILD_TIME", "");
    const { GET } = await import("@/app/api/health/route");
    const body = await (await GET()).json();
    expect(body.commit).toBeNull();
    expect(body.builtAt).toBeNull();
    expect(body.status).toBe("ok");
  });
});
