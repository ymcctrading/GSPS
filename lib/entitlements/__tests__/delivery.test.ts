import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotificationDelivery, getEnabledChannels, recordNotificationDelivery, sweepStuckDeliveries } from "@/lib/entitlements/delivery";

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

describe("recordNotificationDelivery", () => {
  it("records a pending delivery with its payload and returns its id", async () => {
    const { client, calls } = fakeInsertClient({ data: { id: "d1" }, error: null });

    const result = await recordNotificationDelivery(client, {
      transitionId: "t1",
      profileId: "p1",
      channel: "email",
      idempotencyKey: "t1:email",
      payload: PAYLOAD,
    });

    expect(result).toEqual({ recorded: true, deliveryId: "d1" });
    expect(calls[0]).toMatchObject({
      transition_id: "t1",
      profile_id: "p1",
      channel: "email",
      idempotency_key: "t1:email",
      status: "pending",
      payload: PAYLOAD,
    });
  });

  it("treats a unique-constraint violation as already-recorded, not an error", async () => {
    const { client } = fakeInsertClient({ data: null, error: { code: "23505", message: "duplicate" } });

    const result = await recordNotificationDelivery(client, {
      transitionId: "t1",
      profileId: "p1",
      channel: "email",
      idempotencyKey: "t1:email",
      payload: PAYLOAD,
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
        payload: PAYLOAD,
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

type FakeRow = { id: string; status: string; channel: string; payload?: unknown; attempt_count?: number };

function fakeDeliveryClient(args: { row: FakeRow | null; email?: string | null }) {
  const updates: unknown[] = [];
  const client = {
    from(_table: string) {
      return {
        select() {
          return { eq: () => ({ single: () => Promise.resolve({ data: args.row, error: args.row ? null : { message: "not found" } }) }) };
        },
        update(patch: unknown) {
          updates.push(patch);
          const chain = { eq: () => chain, in: () => chain, then: (r: (v: { data: null; error: null }) => void) => r({ data: null, error: null }) };
          return chain;
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
  const previousVercelEnv = process.env.VERCEL_ENV;
  afterEach(() => {
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
  });

  it("sends and marks the delivery sent on success, using the payload stored on the row", async () => {
    sendAlertEmailMock.mockResolvedValueOnce({ success: true, id: "resend-123" });
    const { client, updates } = fakeDeliveryClient({ row: { id: "d1", status: "pending", channel: "email", payload: PAYLOAD, attempt_count: 0 } });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1" });

    expect(result).toEqual({ dispatched: true, status: "sent" });
    expect(sendAlertEmailMock).toHaveBeenCalledWith(expect.objectContaining({ userEmail: "user@example.com", symbol: "AAPL" }));
    expect(updates[0]).toMatchObject({ status: "sent", provider_ref: "resend-123", attempt_count: 1 });
  });

  it("marks the delivery failed when the provider call fails, without throwing", async () => {
    sendAlertEmailMock.mockResolvedValueOnce({ success: false, error: "provider down" });
    const { client, updates } = fakeDeliveryClient({ row: { id: "d1", status: "pending", channel: "email", payload: PAYLOAD, attempt_count: 2 } });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1" });

    expect(result).toEqual({ dispatched: true, status: "failed" });
    expect(updates[0]).toMatchObject({ status: "failed", provider_ref: null, attempt_count: 3 });
  });

  it("no-ops on a delivery that is no longer pending, and never calls the provider", async () => {
    const { client } = fakeDeliveryClient({ row: { id: "d1", status: "sent", channel: "email", payload: PAYLOAD } });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1" });

    expect(result).toEqual({ dispatched: false, reason: "not_pending" });
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });

  it("no-ops for a channel with no provider implementation yet", async () => {
    const { client } = fakeDeliveryClient({ row: { id: "d1", status: "pending", channel: "sms", payload: PAYLOAD } });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1" });

    expect(result).toEqual({ dispatched: false, reason: "channel_unsupported" });
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });

  it("no-ops when the profile has no resolvable email", async () => {
    const { client } = fakeDeliveryClient({ row: { id: "d1", status: "pending", channel: "email", payload: PAYLOAD }, email: null });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1" });

    expect(result).toEqual({ dispatched: false, reason: "no_email" });
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });

  it("no-ops at the attempt ceiling without reading the row or calling the provider again", async () => {
    const { client } = fakeDeliveryClient({ row: { id: "d1", status: "pending", channel: "email", payload: PAYLOAD, attempt_count: 5 } });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1" });

    expect(result).toEqual({ dispatched: false, reason: "max_attempts" });
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });

  it("never sends a real notification in preview, and leaves the row untouched", async () => {
    process.env.VERCEL_ENV = "preview";
    const { client, updates } = fakeDeliveryClient({ row: { id: "d1", status: "pending", channel: "email", payload: PAYLOAD } });

    const result = await dispatchNotificationDelivery(client, { deliveryId: "d1", profileId: "p1" });

    expect(result).toEqual({ dispatched: false, reason: "preview_suppressed" });
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});

/**
 * Fake covering both query shapes `sweepStuckDeliveries` +
 * `dispatchNotificationDelivery` issue together: a filtered, non-`.single()`
 * list query (the sweep's candidate lookup) and a filtered `.single()` read
 * + `.update()` per row (each dispatch call it triggers).
 */
function fakeSweepClient(rows: FakeRow[]) {
  const store = rows.map((r) => ({ ...r, profile_id: "p1" }));
  const client = {
    from(_table: string) {
      const chain = {
        _filters: [] as ((r: Record<string, unknown>) => boolean)[],
        select() {
          return chain;
        },
        eq(col: string, val: unknown) {
          chain._filters.push((r) => r[col] === val);
          return chain;
        },
        in(col: string, vals: unknown[]) {
          chain._filters.push((r) => vals.includes(r[col]));
          return chain;
        },
        lt(col: string, val: unknown) {
          // attempt_count defaults to 0 in these fixtures; created_at isn't
          // modeled at all -- the sweep's age filter is exercised by
          // scheduled-scan-level tests, not here.
          chain._filters.push((r) => (r[col] as number | undefined) !== undefined ? (r[col] as number) < (val as number) : true);
          return chain;
        },
        limit() {
          return chain;
        },
        single() {
          const found = store.find((r) => chain._filters.every((f) => f(r)));
          return Promise.resolve({ data: found ?? null, error: found ? null : { message: "not found" } });
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              return {
                in(col2: string, vals2: unknown[]) {
                  const row = store.find(
                    (r) => (r as Record<string, unknown>)[col] === val && vals2.includes((r as Record<string, unknown>)[col2]),
                  );
                  if (row) Object.assign(row, patch);
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
        then(resolve: (v: { data: unknown[]; error: null }) => void) {
          resolve({ data: store.filter((r) => chain._filters.every((f) => f(r))), error: null });
        },
      };
      return chain;
    },
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: { email: "user@example.com" } } }) } },
  } as unknown as SupabaseClient;
  return { client, store };
}

describe("sweepStuckDeliveries", () => {
  it("dispatches every pending/failed row under the attempt ceiling and tallies outcomes", async () => {
    sendAlertEmailMock
      .mockResolvedValueOnce({ success: true, id: "r1" })
      .mockResolvedValueOnce({ success: false, error: "down" });
    const { client } = fakeSweepClient([
      { id: "d1", status: "pending", channel: "email", payload: PAYLOAD, attempt_count: 0 },
      { id: "d2", status: "failed", channel: "email", payload: PAYLOAD, attempt_count: 1 },
      { id: "d3", status: "sent", channel: "email", payload: PAYLOAD, attempt_count: 1 },
    ]);

    const summary = await sweepStuckDeliveries(client, { olderThanMs: 0 });

    expect(summary).toEqual({ swept: 2, sent: 1, failed: 1, suppressed: 0 });
  });

  it("does not retry a row already past the attempt ceiling", async () => {
    const { client } = fakeSweepClient([
      { id: "d1", status: "pending", channel: "email", payload: PAYLOAD, attempt_count: 5 },
    ]);

    const summary = await sweepStuckDeliveries(client, { olderThanMs: 0 });

    expect(summary).toEqual({ swept: 0, sent: 0, failed: 0, suppressed: 0 });
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });
});
