/**
 * The part of the push transport worth pinning down is what happens when a
 * send fails, because the two failure modes need opposite responses and
 * getting them backwards is silent either way: a subscription the push
 * service says is *gone* must be deleted (otherwise every future alert
 * retries a dead endpoint forever), and one that merely failed must be kept
 * (otherwise a push service having a bad minute silently unsubscribes a
 * member who never asked to be).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendNotificationMock, setVapidDetailsMock, generateVAPIDKeysMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn(),
  setVapidDetailsMock: vi.fn(),
  generateVAPIDKeysMock: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    sendNotification: sendNotificationMock,
    setVapidDetails: setVapidDetailsMock,
    generateVAPIDKeys: generateVAPIDKeysMock,
  },
}));

import { sendWebPushToProfile, isWebPushConfigured, type PushPayload } from "./webpush";

const PAYLOAD: PushPayload = { title: "T", body: "B", url: "/ticker/SPY", tag: "gsps-SPY" };

type Row = { id: string; endpoint: string; p256dh: string; auth: string };

/** Minimal stand-in for the service-role client: records the deletes and
 * updates the module performs, which is what these tests assert on. */
function fakeService(rows: Row[]) {
  const deleted: string[][] = [];
  const stamped: string[][] = [];

  const service = {
    from(table: string) {
      if (table !== "push_subscriptions") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: async () => ({ data: rows, error: null }) }),
        delete: () => ({
          in: async (_col: string, ids: string[]) => {
            deleted.push(ids);
            return { error: null };
          },
        }),
        update: () => ({
          in: async (_col: string, ids: string[]) => {
            stamped.push(ids);
            return { error: null };
          },
        }),
      };
    },
  };

  // The module only ever uses the three methods above; the cast keeps the
  // test from having to stub the whole SupabaseClient surface.
  return { service: service as never, deleted, stamped };
}

function gone(statusCode: number) {
  return Object.assign(new Error("push service says no"), { statusCode });
}

const ROWS: Row[] = [
  { id: "sub-1", endpoint: "https://push.example/1", p256dh: "k1", auth: "a1" },
  { id: "sub-2", endpoint: "https://push.example/2", p256dh: "k2", auth: "a2" },
];

describe("sendWebPushToProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = "public-key";
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = "private-key";
  });

  afterEach(() => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  });

  it("sends to every registered device and stamps the ones that succeeded", async () => {
    sendNotificationMock.mockResolvedValue({});
    const { service, stamped, deleted } = fakeService(ROWS);

    const result = await sendWebPushToProfile(service, "profile-1", PAYLOAD);

    expect(result).toMatchObject({ sent: 2, failed: 0, pruned: 0 });
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    expect(stamped).toEqual([["sub-1", "sub-2"]]);
    expect(deleted).toEqual([]);
  });

  it.each([404, 410])("deletes a subscription the push service reports gone (%i)", async (status) => {
    sendNotificationMock.mockResolvedValueOnce({}).mockRejectedValueOnce(gone(status));
    const { service, deleted } = fakeService(ROWS);

    const result = await sendWebPushToProfile(service, "profile-1", PAYLOAD);

    expect(result).toMatchObject({ sent: 1, failed: 0, pruned: 1 });
    expect(deleted).toEqual([["sub-2"]]);
  });

  it("keeps a subscription that failed transiently, so a bad minute never unsubscribes anyone", async () => {
    sendNotificationMock.mockRejectedValue(gone(503));
    const { service, deleted, stamped } = fakeService(ROWS);

    const result = await sendWebPushToProfile(service, "profile-1", PAYLOAD);

    expect(result).toMatchObject({ sent: 0, failed: 2, pruned: 0 });
    expect(deleted).toEqual([]);
    expect(stamped).toEqual([]);
  });

  it("reports no devices distinctly from a failed send", async () => {
    const { service } = fakeService([]);

    const result = await sendWebPushToProfile(service, "profile-1", PAYLOAD);

    expect(result.skippedReason).toBe("no_subscriptions");
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("no-ops with a stated reason when the deployment has no VAPID keys", async () => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    expect(isWebPushConfigured()).toBe(false);

    // A module-level `vapidConfigured` latch means an earlier configured test
    // could mask this; asserting the no-send is what actually proves it.
    const { service } = fakeService(ROWS);
    const result = await sendWebPushToProfile(service, "profile-1", PAYLOAD);

    expect(result.sent).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});
