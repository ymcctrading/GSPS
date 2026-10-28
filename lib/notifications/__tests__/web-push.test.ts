import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { sendNotificationMock } = vi.hoisted(() => ({ sendNotificationMock: vi.fn() }));
vi.mock("web-push", () => ({ default: { sendNotification: sendNotificationMock } }));

import {
  deliveryPushMessage,
  parseSubscription,
  priceAlertPushMessage,
  sendPushToProfile,
  vapidConfig,
} from "@/lib/notifications/web-push";

const KEYS = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  sendNotificationMock.mockReset();
  for (const k of KEYS) saved[k] = process.env[k];
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
  process.env.VAPID_SUBJECT = "mailto:ops@example.com";
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function fakeSubsClient(rows: { id: string; endpoint: string; p256dh: string; auth: string }[]) {
  const deleted: string[][] = [];
  const touched: string[][] = [];
  const client = {
    from() {
      return {
        select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }),
        delete: () => ({ in: (_c: string, ids: string[]) => (deleted.push(ids), Promise.resolve({ error: null })) }),
        update: () => ({ in: (_c: string, ids: string[]) => (touched.push(ids), Promise.resolve({ error: null })) }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, deleted, touched };
}

const ROW = (id: string) => ({ id, endpoint: `https://push.example/${id}`, p256dh: "k", auth: "a" });
const MSG = { title: "t", body: "b", url: "/dashboard", tag: "x" };

describe("vapidConfig", () => {
  it("is null until all three keys are set", () => {
    delete process.env.VAPID_SUBJECT;
    expect(vapidConfig()).toBeNull();
  });
});

describe("parseSubscription", () => {
  it("accepts an https endpoint with both keys", () => {
    expect(parseSubscription({ endpoint: "https://fcm.example/x", keys: { p256dh: "p", auth: "a" } })).toEqual({
      endpoint: "https://fcm.example/x",
      p256dh: "p",
      auth: "a",
    });
  });

  it("refuses a non-https endpoint, a missing key or an oversized key", () => {
    expect(parseSubscription({ endpoint: "http://x", keys: { p256dh: "p", auth: "a" } })).toBeNull();
    expect(parseSubscription({ endpoint: "https://x", keys: { p256dh: "p" } })).toBeNull();
    expect(parseSubscription({ endpoint: "https://x", keys: { p256dh: "p".repeat(201), auth: "a" } })).toBeNull();
    expect(parseSubscription("nope")).toBeNull();
  });
});

describe("push messages", () => {
  it("words a setup alert as the in-app notification does, with no scorecard detail", () => {
    const msg = deliveryPushMessage({
      symbol: "AAPL",
      direction: "bearish",
      score: 7,
      exactScoreDisplayEnabled: true,
      entry: 100,
      stopLoss: 105,
      takeProfit: 90,
      verdict: "Execute",
      confidence: 0.8,
    });
    expect(msg.title).toBe("AAPL: Execute (7/9)");
    expect(msg.body).toMatch(/^Sell setup confirmed/);
    expect(msg.url).toBe("/ticker/AAPL");
  });

  it("words an invalidation and a price alert", () => {
    expect(deliveryPushMessage({ symbol: "MSFT", verdict: "INVALIDATED" } as never).title).toBe("MSFT invalidated");
    // A position on the member's own levels: the break doesn't move its stop.
    expect(deliveryPushMessage({ symbol: "MSFT", verdict: "INVALIDATED", heldOn: "own" }).body).toMatch(
      /Your MSFT position runs on your own levels, so this doesn't move its stop\.$/,
    );
    expect(deliveryPushMessage({ symbol: "MSFT", verdict: "INVALIDATED" }).body).not.toMatch(/Your MSFT position/);
    expect(priceAlertPushMessage({ symbol: "TSLA", direction: "below", targetPrice: 200, currentPrice: 199 }).title).toMatch(
      /^TSLA fell below \$200/,
    );
  });
});

describe("sendPushToProfile", () => {
  it("is skipped, never sent, while VAPID keys are unset", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const result = await sendPushToProfile(fakeSubsClient([ROW("1")]).client, "p1", MSG);
    expect(result).toMatchObject({ success: false, skipped: true });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("is skipped when no browser is subscribed", async () => {
    const result = await sendPushToProfile(fakeSubsClient([]).client, "p1", MSG);
    expect(result).toMatchObject({ success: false, skipped: true });
  });

  it("sends to every browser, removes ones the push service says are gone, and stamps the rest", async () => {
    sendNotificationMock
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }));
    const { client, deleted, touched } = fakeSubsClient([ROW("1"), ROW("2")]);

    const result = await sendPushToProfile(client, "p1", MSG);

    expect(result).toEqual({ success: true, sent: 1 });
    expect(deleted).toEqual([["2"]]);
    expect(touched).toEqual([["1"]]);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      { endpoint: "https://push.example/1", keys: { p256dh: "k", auth: "a" } },
      JSON.stringify(MSG),
      expect.objectContaining({ TTL: 3600 }),
    );
  });

  it("fails with the push service's reason when no browser accepted it", async () => {
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { statusCode: 403 }));
    const result = await sendPushToProfile(fakeSubsClient([ROW("1")]).client, "p1", MSG);
    expect(result).toEqual({ success: false, error: "403: Unauthorized" });
  });
});

describe("priceAlertPushMessage: the feed's delay (DATA-DELAY-001)", () => {
  it("says an equity's price is delayed, and says nothing for a real-time read", () => {
    const base = { symbol: "TSLA", direction: "below" as const, targetPrice: 200, currentPrice: 199 };
    expect(priceAlertPushMessage({ ...base, delayMinutes: 15 }).body).toContain("Equity prices are delayed by 15 minutes.");
    expect(priceAlertPushMessage({ ...base, delayMinutes: 0 }).body).not.toContain("delayed");
    expect(priceAlertPushMessage(base).body).not.toContain("delayed");
  });
});
