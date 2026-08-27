import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizeUsageReservation, reserveUsageSlot } from "@/lib/entitlements/quota";

/** Records the RPC name + args each call makes, and returns a scripted result. */
function fakeRpcClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    rpc(name: string, args: unknown) {
      calls.push({ name, args });
      const withSingle = {
        then: (resolve: (v: typeof result) => void) => resolve(result),
        single: () => Promise.resolve(result),
      };
      return withSingle;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("reserveUsageSlot", () => {
  it("passes the ET day key, request id, and a null limit for 'unlimited'", async () => {
    const { client, calls } = fakeRpcClient({
      data: { reservation_id: "r1", status: "reserved", current_count: 1, was_duplicate: false },
      error: null,
    });

    const result = await reserveUsageSlot(client, {
      profileId: "u1",
      usageKey: "manual_dashboard_scan",
      limit: "unlimited",
      requestId: "req-1",
      now: new Date("2026-08-26T15:00:00Z"),
    });

    expect(calls[0].name).toBe("reserve_usage_slot");
    expect(calls[0].args).toEqual({
      p_profile_id: "u1",
      p_usage_key: "manual_dashboard_scan",
      p_usage_day_et: "2026-08-26",
      p_request_id: "req-1",
      p_limit: null,
    });
    expect(result).toEqual({
      reservationId: "r1",
      status: "reserved",
      currentCount: 1,
      wasDuplicate: false,
    });
  });

  it("passes a numeric limit through unchanged", async () => {
    const { client, calls } = fakeRpcClient({
      data: { reservation_id: null, status: "quota_exceeded", current_count: 3, was_duplicate: false },
      error: null,
    });

    const result = await reserveUsageSlot(client, {
      profileId: "u1",
      usageKey: "guided_scan",
      limit: 3,
      requestId: "req-2",
    });

    expect(calls[0].args).toMatchObject({ p_limit: 3 });
    expect(result.status).toBe("quota_exceeded");
    expect(result.reservationId).toBeNull();
  });

  it("throws with the underlying message when the RPC errors", async () => {
    const { client } = fakeRpcClient({ data: null, error: { message: "permission denied" } });

    await expect(
      reserveUsageSlot(client, { profileId: "u1", usageKey: "guided_scan", limit: 1, requestId: "req-3" }),
    ).rejects.toThrow("permission denied");
  });
});

describe("finalizeUsageReservation", () => {
  it("returns the RPC's boolean result", async () => {
    const { client, calls } = fakeRpcClient({ data: true, error: null });

    const applied = await finalizeUsageReservation(client, {
      profileId: "u1",
      reservationId: "r1",
      status: "finalized",
    });

    expect(applied).toBe(true);
    expect(calls[0]).toEqual({
      name: "finalize_usage_reservation",
      args: { p_profile_id: "u1", p_reservation_id: "r1", p_status: "finalized" },
    });
  });

  it("throws with the underlying message when the RPC errors", async () => {
    const { client } = fakeRpcClient({ data: null, error: { message: "not found" } });

    await expect(
      finalizeUsageReservation(client, { profileId: "u1", reservationId: "r1", status: "released" }),
    ).rejects.toThrow("not found");
  });
});
