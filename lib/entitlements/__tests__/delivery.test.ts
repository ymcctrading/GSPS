import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotificationDelivery, getEnabledChannels, recordNotificationDelivery } from "@/lib/entitlements/delivery";

const { sendAlertEmailMock } = vi.hoisted(() => ({ sendAlertEmailMock: vi.fn() }));
vi.mock("@/lib/notifications/resend-handler", () => ({ sendAlertEmail: sendAlertEmailMock }));

beforeEach(() => {
  sendAlertEmailMock.mockReset();
});

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

const PAYLOAD = {
  symbol: "AAPL",
  direction: "bullish" as const,
  score: 8,
  entry: 100,
  stopLoss: 95,
  takeProfit: 110,
  verdict: "Execute",
  confidence: 0.89,
};

function fakeDeliveryClient(args: {
  row: { id: string; status: string; channel: string } | null;
  email?: string | null;
}) {
  const updates: unknown[] = [];
  const client = {
    from(_table: string) {
      return {
        select() {
          return { eq: () => ({ single: () => Promise.resolve({ data: args.row, error: args.row ? null : { message: "not found" } }) }) };
        },
        update(patch: unknown) {
          updates.push(patch);
          return { eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
        },
      };
    },
    auth: {
      admin: {
        getUserById: (_id: string) =>
          Promise.resolve({ data: { user: args.email === undefined ? { email: "user@example.com" } : args.email ? { email: args.email } : null } }),
      },
    },
  } as unknown as SupabaseClient;
  return { client, updates };
}

describe("dispatchNotificationDelivery", () => {
  it("sends and marks the delivery sent on success", async () => {
    sendAlertEmailMock.mockResolvedValueOnce({ success: true, id: "resend-123" });
    const { client, updates } = fakeDeliveryClient({ row: { id: "d1", status: "pending", channel: "email" } });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1", payload: PAYLOAD });

    expect(result).toEqual({ dispatched: true, status: "sent" });
    expect(sendAlertEmailMock).toHaveBeenCalledWith(expect.objectContaining({ userEmail: "user@example.com", symbol: "AAPL" }));
    expect(updates[0]).toMatchObject({ status: "sent", provider_ref: "resend-123" });
  });

  it("marks the delivery failed when the provider call fails, without throwing", async () => {
    sendAlertEmailMock.mockResolvedValueOnce({ success: false, error: "provider down" });
    const { client, updates } = fakeDeliveryClient({ row: { id: "d1", status: "pending", channel: "email" } });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1", payload: PAYLOAD });

    expect(result).toEqual({ dispatched: true, status: "failed" });
    expect(updates[0]).toMatchObject({ status: "failed", provider_ref: null });
  });

  it("no-ops on a delivery that is no longer pending, and never calls the provider", async () => {
    const { client } = fakeDeliveryClient({ row: { id: "d1", status: "sent", channel: "email" } });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1", payload: PAYLOAD });

    expect(result).toEqual({ dispatched: false, reason: "not_pending" });
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });

  it("no-ops for a channel with no provider implementation yet", async () => {
    const { client } = fakeDeliveryClient({ row: { id: "d1", status: "pending", channel: "sms" } });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1", payload: PAYLOAD });

    expect(result).toEqual({ dispatched: false, reason: "channel_unsupported" });
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });

  it("no-ops when the profile has no resolvable email", async () => {
    const { client } = fakeDeliveryClient({ row: { id: "d1", status: "pending", channel: "email" }, email: null });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1", payload: PAYLOAD });

    expect(result).toEqual({ dispatched: false, reason: "no_email" });
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });
});
