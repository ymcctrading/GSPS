import { beforeEach, describe, expect, it, vi } from "vitest";

const { fanOutForProfileMock } = vi.hoisted(() => ({ fanOutForProfileMock: vi.fn() }));
vi.mock("@/lib/entitlements/scan-fanout", () => ({ fanOutForProfile: fanOutForProfileMock }));

import { FAN_OUT_CONCURRENCY, fanOutToProfiles, rotateProfiles } from "@/lib/entitlements/fanout-all";
import type { SupabaseClient } from "@supabase/supabase-js";

function service(profiles: { id: string; tier: string | null }[]): SupabaseClient {
  return {
    from: () => ({ select: () => Promise.resolve({ data: profiles, error: null }) }),
  } as unknown as SupabaseClient;
}

const profiles = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(2, "0")}`, tier: "SYSTEM_MASTERY" }));

const baseArgs = {
  scanExecutionId: "se-1",
  source: "test",
  qualifying: [],
  rejectedSymbols: new Set<string>(),
  isEnabled: () => true,
  rotationKey: 0,
};

beforeEach(() => {
  fanOutForProfileMock.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("fanOutToProfiles", () => {
  it("runs profiles side by side, never more than the concurrency cap at once", async () => {
    let inFlight = 0;
    let peak = 0;
    fanOutForProfileMock.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      return { visibleCount: 0, notifiedCount: 1 };
    });
    const out = await fanOutToProfiles(service(profiles(20)), baseArgs);
    expect(out.profilesFannedOut).toBe(20);
    expect(out.totalNotified).toBe(20);
    expect(peak).toBe(FAN_OUT_CONCURRENCY);
  });

  it("starts nothing when the deadline has already passed, and reports them deferred", async () => {
    fanOutForProfileMock.mockResolvedValue({ visibleCount: 0, notifiedCount: 0 });
    const out = await fanOutToProfiles(service(profiles(5)), { ...baseArgs, deadlineAt: Date.now() - 1 });
    expect(fanOutForProfileMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ profilesFannedOut: 0, profilesDeferred: 5, profilesFailed: 0 });
  });

  it("stops starting new profiles once the deadline passes mid-run, letting started ones finish", async () => {
    fanOutForProfileMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { visibleCount: 0, notifiedCount: 0 };
    });
    // Waves start at ~0ms and ~50ms; the third (~100ms) is past the deadline.
    const out = await fanOutToProfiles(service(profiles(20)), { ...baseArgs, deadlineAt: Date.now() + 75 });
    expect(out.profilesFannedOut).toBe(FAN_OUT_CONCURRENCY * 2);
    expect(out.profilesDeferred).toBe(20 - FAN_OUT_CONCURRENCY * 2);
    expect(out.profilesFannedOut + out.profilesDeferred).toBe(20);
  });

  it("keeps going when one profile fails", async () => {
    fanOutForProfileMock.mockImplementation(async (_s: unknown, args: { profileId: string }) => {
      if (args.profileId === "p02") throw new Error("boom");
      return { visibleCount: 0, notifiedCount: 0 };
    });
    const out = await fanOutToProfiles(service(profiles(5)), baseArgs);
    expect(out).toMatchObject({ profilesFannedOut: 4, profilesFailed: 1 });
  });

  it("only serves profiles whose tier policy the job enables, with that tier's limits", async () => {
    fanOutForProfileMock.mockResolvedValue({ visibleCount: 0, notifiedCount: 0 });
    await fanOutToProfiles(
      service([
        { id: "a", tier: "PRACTICE" },
        { id: "b", tier: "SYSTEM_MASTERY" },
      ]),
      { ...baseArgs, isEnabled: (policy) => policy.maxDashboardSetupsPerScan === 30 },
    );
    expect(fanOutForProfileMock).toHaveBeenCalledTimes(1);
    expect(fanOutForProfileMock.mock.calls[0][1]).toMatchObject({ profileId: "b", maxDashboardSetupsPerScan: 30 });
  });
});

describe("rotateProfiles", () => {
  const list = [{ id: "c" }, { id: "a" }, { id: "b" }];

  it("orders by id, then rotates the start point by the key", () => {
    expect(rotateProfiles(list, 0).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(rotateProfiles(list, 1).map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(rotateProfiles(list, 5).map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("gives every profile a turn at the front over consecutive keys", () => {
    const fronts = new Set([0, 1, 2].map((k) => rotateProfiles(list, k)[0].id));
    expect(fronts).toEqual(new Set(["a", "b", "c"]));
  });
});
