/**
 * Push for the scheduled intraday scan (`notifySubscribedUsers`), over an
 * in-memory client: who receives a signal by tier and settings, that it is
 * never emailed (owner, 2026-10-28), its dedupe, and that quiet hours hold it.
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

import { notifySubscribedUsers as notify } from "@/lib/notifications/intradayDelivery";
import { alertTimeliness } from "@/lib/__tests__/fixtures/alertTimeliness";

/** Push at the scan's own clock: dispatch is the moment the alert was evaluated. */
const notifySubscribedUsers = (client: SupabaseClient, alerts: Alert[], args: { intervalBySymbol: Map<string, number>; now: Date }) =>
  notify(client, alerts, { ...args, clock: () => args.now });

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>, users: string[]) {
  function from(name: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const result = () => ({ data: (tables[name] ??= []).filter((r) => filters.every((f) => f(r))), error: null });
    const chain = {
      select: () => chain,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), chain),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), chain),
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
    timeliness: alertTimeliness(now),
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

describe("intraday push", () => {
  it("reaches members by tier: Expert, Novice never, Pro only on a confirmed bar; never by email", async () => {
    const db = fakeDb(prefs(), users);
    const sent = await notifySubscribedUsers(db.client, [alert("SPY")], { intervalBySymbol: new Map([["SPY", 1]]), now });
    expect(emails).toEqual([]);
    expect(pushes.map((p) => p.userId)).toEqual(["expert-a"]);
    expect(pushes[0].title).toContain("SPY intraday, up");
    expect(sent).toEqual({ push: 1 });
    // A member with no subscribed browser leaves no row; no email row at all.
    expect(db.tables.notification_log.map((r) => r.channel)).toEqual(["push"]);

    pushes.length = 0;
    await notifySubscribedUsers(fakeDb(prefs(), users).client, [alert("SPY")], {
      intervalBySymbol: new Map([["SPY", 15]]),
      now,
    });
    expect(pushes.map((p) => p.userId).sort()).toEqual(["expert-a", "pro-c"]);
    expect(emails).toEqual([]);
  });

  it("dedups the move, and holds it in quiet hours and under the score floor", async () => {
    const db = fakeDb(prefs(), users);
    const args = { intervalBySymbol: new Map([["SPY", 1]]), now };
    await notifySubscribedUsers(db.client, [alert("SPY")], args);
    expect(await notifySubscribedUsers(db.client, [alert("SPY")], args)).toEqual({ push: 0 });

    quiet.add("expert-a");
    expect(await notifySubscribedUsers(fakeDb(prefs(), ["expert-a"]).client, [alert("SPY")], args)).toEqual({ push: 0 });
    quiet.clear();
    // Confidence 40 reads 4 of 9, under the floor of 5.
    expect(await notifySubscribedUsers(fakeDb(prefs(), ["expert-a"]).client, [alert("SPY", 40)], args)).toEqual({ push: 0 });
  });

  it("sends nothing to a member who never saved settings (push is opt-in)", async () => {
    const db = fakeDb({ notification_preferences: [], notification_log: [] }, ["expert-a"]);
    const sent = await notifySubscribedUsers(db.client, [alert("SPY")], { intervalBySymbol: new Map(), now });
    expect(sent).toEqual({ push: 0 });
  });
});
