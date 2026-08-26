import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnabledChannels, recordNotificationDelivery } from "@/lib/entitlements/delivery";

function fakeInsertClient(result: { data: unknown; error: { code?: string; message: string } | null }) {
  const calls: unknown[] = [];
  const client = {
    from(_table: string) {
      return {
        insert(row: unknown) {
          calls.push(row);
          return { select: () => ({ single: () => Promise.resolve(result) }) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("recordNotificationDelivery", () => {
  it("records a pending delivery and returns its id", async () => {
    const { client, calls } = fakeInsertClient({ data: { id: "d1" }, error: null });

    const result = await recordNotificationDelivery(client, {
      transitionId: "t1",
      profileId: "p1",
      channel: "email",
      idempotencyKey: "t1:email",
    });

    expect(result).toEqual({ recorded: true, deliveryId: "d1" });
    expect(calls[0]).toMatchObject({
      transition_id: "t1",
      profile_id: "p1",
      channel: "email",
      idempotency_key: "t1:email",
      status: "pending",
    });
  });

  it("treats a unique-constraint violation as already-recorded, not an error", async () => {
    const { client } = fakeInsertClient({ data: null, error: { code: "23505", message: "duplicate" } });

    const result = await recordNotificationDelivery(client, {
      transitionId: "t1",
      profileId: "p1",
      channel: "email",
      idempotencyKey: "t1:email",
    });

    expect(result).toEqual({ recorded: false, deliveryId: null });
  });

  it("throws for any other database error", async () => {
    const { client } = fakeInsertClient({ data: null, error: { message: "connection reset" } });

    await expect(
      recordNotificationDelivery(client, {
        transitionId: "t1",
        profileId: "p1",
        channel: "email",
        idempotencyKey: "t1:email",
      }),
    ).rejects.toThrow("connection reset");
  });
});

describe("getEnabledChannels", () => {
  it("returns the RPC's channel list", async () => {
    const client = {
      rpc: (_name: string, _args: unknown) => Promise.resolve({ data: ["email", "push"], error: null }),
    } as unknown as SupabaseClient;

    await expect(getEnabledChannels(client, "p1")).resolves.toEqual(["email", "push"]);
  });

  it("returns an empty list rather than null", async () => {
    const client = {
      rpc: (_name: string, _args: unknown) => Promise.resolve({ data: null, error: null }),
    } as unknown as SupabaseClient;

    await expect(getEnabledChannels(client, "p1")).resolves.toEqual([]);
  });

  it("throws with the underlying message on an RPC error", async () => {
    const client = {
      rpc: (_name: string, _args: unknown) => Promise.resolve({ data: null, error: { message: "permission denied" } }),
    } as unknown as SupabaseClient;

    await expect(getEnabledChannels(client, "p1")).rejects.toThrow("permission denied");
  });
});
