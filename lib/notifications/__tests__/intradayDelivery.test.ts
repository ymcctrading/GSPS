import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alert } from "@/lib/scanner/intraday";

// Delivery tests for the scheduled intraday scan's email and push (Q1 item 15
// part 2), in the style of the bell's: a fake client, no network. Each test
// names the rule in `notifySubscribedUsers` it holds.

const { sendAlertEmailMock, sendPushMock, vapidMock, policyMock, quietMock } = vi.hoisted(() => ({
  sendAlertEmailMock: vi.fn(),
  sendPushMock: vi.fn(),
  vapidMock: vi.fn(),
  policyMock: vi.fn(),
  quietMock: vi.fn(),
}));
vi.mock("@/lib/notifications/resend-handler", () => ({ sendAlertEmail: sendAlertEmailMock }));
vi.mock("@/lib/notifications/web-push", () => ({ sendPushToProfile: sendPushMock, vapidConfig: vapidMock }));
vi.mock("@/lib/entitlements/policy", () => ({ getUserEntitlementPolicy: policyMock }));
vi.mock("@/lib/entitlements/delivery", () => ({ inQuietHours: quietMock }));

import { alertScore, NOTIFICATION_DEDUP_HOURS, notifySubscribedUsers } from "@/lib/notifications/intradayDelivery";

const NOW = new Date("2026-10-22T15:00:00Z");
const FULL = { intradayScansEnabled: true, proIntradayModuleEnabled: false };
const PRO = { intradayScansEnabled: false, proIntradayModuleEnabled: true };
const NOVICE = { intradayScansEnabled: false, proIntradayModuleEnabled: false };

function alert(over: Partial<Alert> = {}): Alert {
  return {
    symbol: "SPY",
    type: "old_level_cross",
    direction: "up",
    confidence: 100,
    move: { current: 770.12 },
    invalidation: 744.12,
    continuationPlan: { firstTarget: 795.76, masterTarget: 822.83, paysRisk: true },
    ...over,
  } as unknown as Alert;
}

interface Prefs {
  user_id: string;
  email_enabled?: boolean | null;
  push_enabled?: boolean | null;
  min_score?: number | null;
  quiet_hours_enabled?: boolean | null;
}
interface LogRow {
  user_id: string;
  channel: string;
  signal_hash: string;
  triggered_at: string;
}

/**
 * A service client holding notification_preferences, notification_log and
 * the admin user list. Log reads apply every filter the code sends, so the
 * dedupe window is tested against the rows, not against a canned answer.
 */
function fakeService(opts: {
  users: { id: string; email?: string | null }[];
  prefs?: Prefs[];
  prefsError?: boolean;
  log?: LogRow[];
}) {
  const log: LogRow[] = [...(opts.log ?? [])];
  const inserted: Record<string, unknown>[] = [];
  const pages: number[] = [];
  const client = {
    auth: {
      admin: {
        listUsers: ({ page, perPage }: { page: number; perPage: number }) => {
          pages.push(page);
          const users = opts.users.slice((page - 1) * perPage, page * perPage).map((u) => ({ id: u.id }));
          return Promise.resolve({ data: { users }, error: null });
        },
        getUserById: (id: string) => {
          const u = opts.users.find((x) => x.id === id);
          return Promise.resolve({ data: { user: u ? { id, email: u.email ?? null } : null }, error: null });
        },
      },
    },
    from(table: string) {
      if (table === "notification_preferences") {
        return {
          select: () =>
            Promise.resolve(opts.prefsError ? { data: null, error: { message: "down" } } : { data: opts.prefs ?? [], error: null }),
        };
      }
      if (table === "notification_log") {
        const filters: Record<string, string> = {};
        let since = "";
        const q = {
          select: () => q,
          eq: (col: string, v: string) => ((filters[col] = v), q),
          gte: (col: string, v: string) => {
            if (col !== "triggered_at") throw new Error(`window read on ${col}`);
            since = v;
            return q;
          },
          limit: () =>
            Promise.resolve({
              data: log
                .filter((r) => Object.entries(filters).every(([k, v]) => (r as unknown as Record<string, string>)[k] === v))
                .filter((r) => r.triggered_at >= since)
                .map((_, i) => ({ id: i })),
              error: null,
            }),
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            log.push(row as unknown as LogRow);
            return Promise.resolve({ error: null });
          },
        };
        return q;
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
  return { client, inserted, pages };
}

const intervals = new Map<string, number>([["SPY", 15]]);
const run = (client: SupabaseClient, alerts: Alert[], map = intervals) =>
  notifySubscribedUsers(client, alerts, { intervalBySymbol: map, now: NOW });

let savedResend: string | undefined;
beforeEach(() => {
  for (const m of [sendAlertEmailMock, sendPushMock, vapidMock, policyMock, quietMock]) m.mockReset();
  savedResend = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  vapidMock.mockReturnValue({ publicKey: "p", privateKey: "k", subject: "mailto:x" });
  policyMock.mockResolvedValue(FULL);
  quietMock.mockResolvedValue(false);
  sendAlertEmailMock.mockResolvedValue({ success: true, id: "em_1" });
  sendPushMock.mockResolvedValue({ success: true });
});
afterEach(() => {
  if (savedResend === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = savedResend;
});

describe("notifySubscribedUsers: opt-in", () => {
  it("sends nothing to a member with no saved row (email and push are opt-in, migration 0109)", async () => {
    const { client, inserted } = fakeService({ users: [{ id: "u1", email: "a@x.test" }] });
    expect(await run(client, [alert()])).toEqual({ email: 0, push: 0 });
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("sends each channel only to the members who turned it on", async () => {
    const { client } = fakeService({
      users: [
        { id: "mail", email: "m@x.test" },
        { id: "push", email: "p@x.test" },
        { id: "both", email: "b@x.test" },
        { id: "off", email: "o@x.test" },
      ],
      prefs: [
        { user_id: "mail", email_enabled: true, push_enabled: false },
        { user_id: "push", email_enabled: false, push_enabled: true },
        { user_id: "both", email_enabled: true, push_enabled: true },
        { user_id: "off", email_enabled: false, push_enabled: false },
      ],
    });
    expect(await run(client, [alert()])).toEqual({ email: 2, push: 2 });
    expect(sendAlertEmailMock.mock.calls.map((c) => c[0].userEmail).sort()).toEqual(["b@x.test", "m@x.test"]);
    expect(sendPushMock.mock.calls.map((c) => c[1]).sort()).toEqual(["both", "push"]);
  });

  it("leaves push off while VAPID keys are unset, and email off without a Resend key", async () => {
    const prefs = [{ user_id: "u1", email_enabled: true, push_enabled: true }];
    vapidMock.mockReturnValue(null);
    const a = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    expect(await run(a.client, [alert()])).toEqual({ email: 1, push: 0 });
    expect(sendPushMock).not.toHaveBeenCalled();

    delete process.env.RESEND_API_KEY;
    const b = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    expect(await run(b.client, [alert()])).toEqual({ email: 0, push: 0 });
    expect(b.pages).toHaveLength(0); // nothing to send on: no member is even listed
  });

  it("sends nothing when the preferences cannot be read", async () => {
    const { client } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefsError: true });
    expect(await run(client, [alert()])).toEqual({ email: 0, push: 0 });
  });

  it("reads every page of members, not only the first", async () => {
    const users = Array.from({ length: 201 }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.test` }));
    const { client, pages } = fakeService({ users, prefs: [{ user_id: "u200", email_enabled: true }] });
    expect(await run(client, [alert()])).toEqual({ email: 1, push: 0 });
    expect(pages).toEqual([1, 2]);
    expect(sendAlertEmailMock.mock.calls[0][0].userEmail).toBe("u200@x.test");
  });
});

describe("notifySubscribedUsers: tier", () => {
  const prefs = [{ user_id: "u1", email_enabled: true, push_enabled: true }];

  it("sends a Novice nothing, since their plan has no intraday signals", async () => {
    policyMock.mockResolvedValue(NOVICE);
    const { client } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    expect(await run(client, [alert()])).toEqual({ email: 0, push: 0 });
  });

  it("sends Pro only the bar lengths its module confirms on", async () => {
    policyMock.mockResolvedValue(PRO);
    const { client } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    const map = new Map([["SPY", 15], ["TSLA", 1]]);
    expect(await run(client, [alert(), alert({ symbol: "TSLA" })], map)).toEqual({ email: 1, push: 1 });
    expect(sendAlertEmailMock.mock.calls[0][0].symbol).toBe("SPY");
  });

  it("sends no one a signal the replay measured losing", async () => {
    const { client } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    expect(await run(client, [alert({ type: "plan_level_held" } as Partial<Alert>)])).toEqual({ email: 0, push: 0 });
  });
});

describe("notifySubscribedUsers: score floor and quiet hours", () => {
  it("maps the 0-100 confidence onto 0-9 and holds alerts under the member's floor", async () => {
    expect(alertScore(alert({ confidence: 55 }))).toBe(5);
    expect(alertScore(alert({ confidence: 50 }))).toBe(5);
    expect(alertScore(alert({ confidence: 40 }))).toBe(4);
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs: [{ user_id: "u1", email_enabled: true, min_score: 7 }],
    });
    expect(await run(client, [alert({ confidence: 70 }), alert({ symbol: "QQQ", confidence: 80 })], new Map())).toEqual({
      email: 1,
      push: 0,
    });
    expect(sendAlertEmailMock.mock.calls[0][0].symbol).toBe("QQQ");
  });

  it("uses a floor of 5 when the member saved none", async () => {
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs: [{ user_id: "u1", email_enabled: true, min_score: null }],
    });
    expect(await run(client, [alert({ confidence: 40 })])).toEqual({ email: 0, push: 0 });
    expect(await run(client, [alert({ confidence: 60 })])).toEqual({ email: 1, push: 0 });
  });

  it("holds every channel inside quiet hours the member turned on, and only then asks", async () => {
    quietMock.mockResolvedValue(true);
    const on = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs: [{ user_id: "u1", email_enabled: true, push_enabled: true, quiet_hours_enabled: true }],
    });
    expect(await run(on.client, [alert()])).toEqual({ email: 0, push: 0 });
    expect(quietMock).toHaveBeenCalledTimes(1);

    quietMock.mockClear();
    const off = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs: [{ user_id: "u1", email_enabled: true, push_enabled: true, quiet_hours_enabled: false }],
    });
    expect(await run(off.client, [alert()])).toEqual({ email: 1, push: 1 });
    expect(quietMock).not.toHaveBeenCalled();
  });
});

describe("notifySubscribedUsers: dedupe and the log", () => {
  const prefs = [{ user_id: "u1", email_enabled: true, push_enabled: true }];
  const hash = "SPY-bullish-9";

  it("logs each send per channel with the signal's hash", async () => {
    const { client, inserted } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    await run(client, [alert()]);
    expect(inserted.map((r) => [r.channel, r.status, r.signal_hash, r.recipient])).toEqual([
      ["email", "sent", hash, "a@x.test"],
      ["push", "sent", hash, null],
    ]);
  });

  it("does not resend on a channel inside the window, and an email does not hold back the push", async () => {
    const recent = new Date(NOW.getTime() - 3600_000).toISOString();
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs,
      log: [{ user_id: "u1", channel: "email", signal_hash: hash, triggered_at: recent }],
    });
    expect(await run(client, [alert()])).toEqual({ email: 0, push: 1 });
  });

  it("sends again once the earlier send is older than the window", async () => {
    const old = new Date(NOW.getTime() - (NOTIFICATION_DEDUP_HOURS + 1) * 3600_000).toISOString();
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs,
      log: [{ user_id: "u1", channel: "email", signal_hash: hash, triggered_at: old }],
    });
    expect(await run(client, [alert()])).toEqual({ email: 1, push: 1 });
  });

  it("sends a second run of the same signal nowhere, and a new score again", async () => {
    const { client } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    expect(await run(client, [alert()])).toEqual({ email: 1, push: 1 });
    expect(await run(client, [alert()])).toEqual({ email: 0, push: 0 });
    expect(await run(client, [alert({ confidence: 80 })])).toEqual({ email: 1, push: 1 });
  });

  it("does not hold another member's send on one member's log", async () => {
    const recent = new Date(NOW.getTime() - 60_000).toISOString();
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }, { id: "u2", email: "b@x.test" }],
      prefs: [...prefs, { user_id: "u2", email_enabled: true }],
      log: [{ user_id: "u1", channel: "email", signal_hash: hash, triggered_at: recent }],
    });
    expect(await run(client, [alert()])).toEqual({ email: 1, push: 1 });
    expect(sendAlertEmailMock.mock.calls[0][0].userEmail).toBe("b@x.test");
  });

  it("logs a failed send as failed with the provider's reason, and counts it nowhere", async () => {
    sendAlertEmailMock.mockResolvedValue({ success: false, error: "daily quota" });
    const { client, inserted } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    expect(await run(client, [alert()])).toEqual({ email: 0, push: 1 });
    expect(inserted[0]).toMatchObject({ channel: "email", status: "failed", error_message: "daily quota", sent_at: null });
    // A refused send is not retried on the next 15-minute run: it would only fail again.
    sendAlertEmailMock.mockResolvedValue({ success: true });
    expect(await run(client, [alert()])).toEqual({ email: 0, push: 0 });
  });

  it("still counts a send made exactly at the window's edge", async () => {
    const edge = new Date(NOW.getTime() - NOTIFICATION_DEDUP_HOURS * 3600_000).toISOString();
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs,
      log: [{ user_id: "u1", channel: "email", signal_hash: hash, triggered_at: edge }],
    });
    expect(await run(client, [alert()])).toEqual({ email: 0, push: 1 });
  });

  it("logs nothing for a push with no subscribed browser", async () => {
    sendPushMock.mockResolvedValue({ success: false, skipped: true, error: "no subscription" });
    const { client, inserted } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    expect(await run(client, [alert()])).toEqual({ email: 1, push: 0 });
    expect(inserted.map((r) => r.channel)).toEqual(["email"]);
  });

  it("skips email for a member with no address, and still pushes", async () => {
    const { client, inserted } = fakeService({ users: [{ id: "u1", email: null }], prefs });
    expect(await run(client, [alert()])).toEqual({ email: 0, push: 1 });
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
    expect(inserted.map((r) => r.channel)).toEqual(["push"]);
  });

  it("keeps going for the next member when one member's sends throw", async () => {
    policyMock.mockImplementation((_s: unknown, id: string) =>
      id === "u1" ? Promise.reject(new Error("boom")) : Promise.resolve(FULL),
    );
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }, { id: "u2", email: "b@x.test" }],
      prefs: [...prefs, { user_id: "u2", email_enabled: true }],
    });
    expect(await run(client, [alert()])).toEqual({ email: 1, push: 0 });
  });
});

describe("notifySubscribedUsers: the message", () => {
  it("emails the alert's own levels and whole-number score, and pushes to the ticker page", async () => {
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs: [{ user_id: "u1", email_enabled: true, push_enabled: true }],
    });
    await run(client, [alert({ direction: "down", confidence: 67 } as Partial<Alert>)]);
    expect(sendAlertEmailMock.mock.calls[0][0]).toMatchObject({
      symbol: "SPY",
      direction: "bearish",
      score: 6,
      exactScoreDisplayEnabled: true,
      entry: 770.12,
      stopLoss: 744.12,
      takeProfit: 795.76,
    });
    const push = sendPushMock.mock.calls[0][2];
    expect(push.tag).toBe("intraday-SPY");
    expect(push.url).toContain("SPY");
    expect(push.body).toContain("no measured record yet");
  });

  it("does nothing at all for an empty list of alerts", async () => {
    const { client, pages } = fakeService({ users: [{ id: "u1" }], prefs: [{ user_id: "u1", email_enabled: true }] });
    expect(await run(client, [])).toEqual({ email: 0, push: 0 });
    expect(pages).toHaveLength(0);
  });
});
