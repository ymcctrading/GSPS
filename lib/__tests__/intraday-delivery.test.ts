/**
 * Email and push for the scheduled intraday scan (`notifySubscribedUsers`),
 * over an in-memory client: who receives a signal by tier and settings, that
 * each channel dedups on its own, and that quiet hours hold both.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alert } from "@/lib/scanner/intraday";

const { tierByUser, emails, pushes, quiet } = vi.hoisted(() => ({
  tierByUser: new Map<string, "novice" | "pro" | "expert">(),
  emails: [] as string[],
  pushes: [] as { userId: string; title: string }[],
  quiet: new Set<string>(),
}));

vi.mock("@/lib/entitlements/policy", () => ({
  getUserEntitlementPolicy: async (_c: unknown, userId: string) => {
    const tier = tierByUser.get(userId) ?? "novice";
    return { intradayScansEnabled: tier === "expert", proIntradayModuleEnabled: tier === "pro" };
  },
}));
vi.mock("@/lib/entitlements/delivery", () => ({
  inQuietHours: async (_c: unknown, userId: string) => quiet.has(userId),
}));
vi.mock("@/lib/notifications/resend-handler", () => ({
  sendAlertEmail: async (data: { userEmail: string }) => {
    // The sender a blocked or invalid RESEND_FROM gives (resend-handler.ts).
    if (data.userEmail === "expert-nosender@example.com") return { success: false, skipped: true, error: "blocked" };
    emails.push(data.userEmail);
    return { success: true };
  },
}));
vi.mock("@/lib/notifications/web-push", () => ({
  vapidConfig: () => ({ publicKey: "p", privateKey: "k", subject: "mailto:x" }),
  sendPushToProfile: async (_c: unknown, userId: string, message: { title: string }) => {
    if (userId === "expert-nobrowser") return { success: false, skipped: true, error: "none" };
    pushes.push({ userId, title: message.title });
    return { success: true, sent: 1 };
  },
}));

import { notifySubscribedUsers } from "@/lib/notifications/intradayDelivery";

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>, users: string[]) {
  function from(name: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const result = () => ({ data: (tables[name] ??= []).filter((r) => filters.every((f) => f(r))), error: null });
    const chain = {
      select: () => chain,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), chain),
      limit: () => chain,
      then: (resolve: (v: ReturnType<typeof result>) => void) => resolve(result()),
      insert: async (row: Row) => {
        (tables[name] ??= []).push(row);
        return { error: null };
      },
    };
    return chain;
  }
  const auth = {
    admin: {
      listUsers: async ({ page }: { page: number }) => ({
        data: { users: page === 1 ? users.map((id) => ({ id })) : [] },
        error: null,
      }),
      getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.com` } } }),
    },
  };
  return { client: { from, auth } as unknown as SupabaseClient, tables };
}

const alert = (symbol: string, confidence = 80): Alert =>
  ({
    symbol,
    type: "old_level_cross",
    direction: "up",
    confidence,
    move: { current: 100 },
    invalidation: 95,
    continuationPlan: { firstTarget: 110, masterTarget: null, paysRisk: true },
  }) as unknown as Alert;

const now = new Date("2026-10-21T15:30:00Z");

beforeEach(() => {
  process.env.RESEND_API_KEY = "test";
  emails.length = 0;
  pushes.length = 0;
  quiet.clear();
  tierByUser.clear();
  for (const [u, t] of [
    ["expert-a", "expert"],
    ["novice-b", "novice"],
    ["pro-c", "pro"],
    ["expert-nobrowser", "expert"],
  ] as const) {
    tierByUser.set(u, t);
  }
});

const users = ["expert-a", "novice-b", "pro-c", "expert-nobrowser"];
const prefs = () => ({
  notification_preferences: users.map((user_id) => ({
    user_id,
    email_enabled: true,
    push_enabled: true,
    min_score: 5,
    quiet_hours_enabled: true,
  })),
  notification_log: [] as Row[],
});

describe("intraday email and push", () => {
  it("reaches members by tier: Expert on both channels, Novice never, Pro only on a confirmed bar", async () => {
    const db = fakeDb(prefs(), users);
    const sent = await notifySubscribedUsers(db.client, [alert("SPY")], { intervalBySymbol: new Map([["SPY", 1]]), now });
    expect(emails.sort()).toEqual(["expert-a@example.com", "expert-nobrowser@example.com"]);
    expect(pushes.map((p) => p.userId)).toEqual(["expert-a"]);
    expect(pushes[0].title).toContain("SPY intraday, up");
    expect(sent).toEqual({ email: 2, push: 1 });
    // A member with no subscribed browser leaves no push row.
    expect(db.tables.notification_log.filter((r) => r.channel === "push")).toHaveLength(1);

    emails.length = 0;
    await notifySubscribedUsers(fakeDb(prefs(), users).client, [alert("SPY")], {
      intervalBySymbol: new Map([["SPY", 15]]),
      now,
    });
    expect(emails).toContain("pro-c@example.com");
    expect(emails).not.toContain("novice-b@example.com");
  });

  it("dedups each channel on its own, and holds both in quiet hours and under the score floor", async () => {
    const db = fakeDb(prefs(), users);
    const args = { intervalBySymbol: new Map([["SPY", 1]]), now };
    await notifySubscribedUsers(db.client, [alert("SPY")], args);
    expect(await notifySubscribedUsers(db.client, [alert("SPY")], args)).toEqual({ email: 0, push: 0 });

    quiet.add("expert-a");
    expect(await notifySubscribedUsers(fakeDb(prefs(), ["expert-a"]).client, [alert("SPY")], args)).toEqual({
      email: 0,
      push: 0,
    });
    quiet.clear();
    // Confidence 40 reads 4 of 9, under the floor of 5.
    expect(await notifySubscribedUsers(fakeDb(prefs(), ["expert-a"]).client, [alert("SPY", 40)], args)).toEqual({
      email: 0,
      push: 0,
    });
  });

  it("logs no email row when the sender is not deliverable, as for push", async () => {
    tierByUser.set("expert-nosender", "expert");
    const db = fakeDb({ notification_preferences: [], notification_log: [] }, ["expert-nosender"]);
    const sent = await notifySubscribedUsers(db.client, [alert("SPY")], { intervalBySymbol: new Map(), now });
    expect(sent).toEqual({ email: 0, push: 0 });
    expect(db.tables.notification_log).toHaveLength(0);
  });

  it("keeps push off for a member who never saved settings, and email on", async () => {
    const db = fakeDb({ notification_preferences: [], notification_log: [] }, ["expert-a"]);
    const sent = await notifySubscribedUsers(db.client, [alert("SPY")], { intervalBySymbol: new Map(), now });
    expect(sent).toEqual({ email: 1, push: 0 });
  });
});
