import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alert } from "@/lib/scanner/intraday";

// Delivery tests for the scheduled intraday scan's browser push (Q1 item 15
// part 2), in the style of the bell's: a fake client, no network. Each test
// names the rule in `notifySubscribedUsers` it holds. Intraday signals go by
// push and the bell only, never email (owner, 2026-10-28).

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
        let keys: string[] | null = null;
        let since = "";
        const q = {
          select: () => q,
          eq: (col: string, v: string) => ((filters[col] = v), q),
          in: (col: string, v: string[]) => {
            if (col !== "signal_hash") throw new Error(`in() on ${col}`);
            keys = v;
            return q;
          },
          gte: (col: string, v: string) => {
            if (col !== "triggered_at") throw new Error(`window read on ${col}`);
            since = v;
            return q;
          },
          then: (resolve: (v: { data: LogRow[]; error: null }) => void) =>
            resolve({
              data: log
                .filter((r) => Object.entries(filters).every(([k, v]) => (r as unknown as Record<string, string>)[k] === v))
                .filter((r) => keys === null || keys.includes(r.signal_hash))
                .filter((r) => r.triggered_at >= since),
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

beforeEach(() => {
  for (const m of [sendAlertEmailMock, sendPushMock, vapidMock, policyMock, quietMock]) m.mockReset();
  vapidMock.mockReturnValue({ publicKey: "p", privateKey: "k", subject: "mailto:x" });
  policyMock.mockResolvedValue(FULL);
  quietMock.mockResolvedValue(false);
  sendAlertEmailMock.mockResolvedValue({ success: true, id: "em_1" });
  sendPushMock.mockResolvedValue({ success: true });
});
afterEach(() => {
  // Email is never a channel here, whatever the member saved.
  expect(sendAlertEmailMock).not.toHaveBeenCalled();
});

describe("notifySubscribedUsers: opt-in", () => {
  it("sends nothing to a member with no saved row (push is opt-in, migration 0109)", async () => {
    const { client, inserted } = fakeService({ users: [{ id: "u1", email: "a@x.test" }] });
    expect(await run(client, [alert()])).toEqual({ push: 0 });
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("pushes only to the members who turned push on, and emails no one", async () => {
    const { client, inserted } = fakeService({
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
    expect(await run(client, [alert()])).toEqual({ push: 2 });
    expect(sendPushMock.mock.calls.map((c) => c[1]).sort()).toEqual(["both", "push"]);
    expect(inserted.every((r) => r.channel === "push")).toBe(true);
  });

  it("sends nothing while VAPID keys are unset, and lists no member", async () => {
    vapidMock.mockReturnValue(null);
    const a = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs: [{ user_id: "u1", push_enabled: true }] });
    expect(await run(a.client, [alert()])).toEqual({ push: 0 });
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(a.pages).toHaveLength(0);
  });

  it("sends nothing when the preferences cannot be read", async () => {
    const { client } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefsError: true });
    expect(await run(client, [alert()])).toEqual({ push: 0 });
  });

  it("reads every page of members, not only the first", async () => {
    const users = Array.from({ length: 201 }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.test` }));
    const { client, pages } = fakeService({ users, prefs: [{ user_id: "u200", push_enabled: true }] });
    expect(await run(client, [alert()])).toEqual({ push: 1 });
    expect(pages).toEqual([1, 2]);
    expect(sendPushMock.mock.calls[0][1]).toBe("u200");
  });
});

describe("notifySubscribedUsers: tier", () => {
  const prefs = [{ user_id: "u1", push_enabled: true }];

  it("sends a Novice nothing, since their plan has no intraday signals", async () => {
    policyMock.mockResolvedValue(NOVICE);
    const { client } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    expect(await run(client, [alert()])).toEqual({ push: 0 });
  });

  it("sends Pro only the bar lengths its module confirms on", async () => {
    policyMock.mockResolvedValue(PRO);
    const { client } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    const map = new Map([["SPY", 15], ["TSLA", 1]]);
    expect(await run(client, [alert(), alert({ symbol: "TSLA" })], map)).toEqual({ push: 1 });
    expect(sendPushMock.mock.calls[0][2].title).toContain("SPY");
  });

  it("sends no one a signal the replay measured losing", async () => {
    const { client } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    expect(await run(client, [alert({ type: "plan_level_held" } as Partial<Alert>)])).toEqual({ push: 0 });
  });
});

describe("notifySubscribedUsers: score floor and quiet hours", () => {
  it("maps the 0-100 confidence onto 0-9 and holds alerts under the member's floor", async () => {
    expect(alertScore(alert({ confidence: 55 }))).toBe(5);
    expect(alertScore(alert({ confidence: 50 }))).toBe(5);
    expect(alertScore(alert({ confidence: 40 }))).toBe(4);
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs: [{ user_id: "u1", push_enabled: true, min_score: 7 }],
    });
    expect(await run(client, [alert({ confidence: 70 }), alert({ symbol: "QQQ", confidence: 80 })], new Map())).toEqual({
      push: 1,
    });
    expect(sendPushMock.mock.calls[0][2].title).toContain("QQQ");
  });

  it("uses a floor of 5 when the member saved none", async () => {
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs: [{ user_id: "u1", push_enabled: true, min_score: null }],
    });
    expect(await run(client, [alert({ confidence: 40 })])).toEqual({ push: 0 });
    expect(await run(client, [alert({ confidence: 60 })])).toEqual({ push: 1 });
  });

  it("holds the push inside quiet hours the member turned on, and only then asks", async () => {
    quietMock.mockResolvedValue(true);
    const on = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs: [{ user_id: "u1", push_enabled: true, quiet_hours_enabled: true }],
    });
    expect(await run(on.client, [alert()])).toEqual({ push: 0 });
    expect(quietMock).toHaveBeenCalledTimes(1);

    quietMock.mockClear();
    const off = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs: [{ user_id: "u1", push_enabled: true, quiet_hours_enabled: false }],
    });
    expect(await run(off.client, [alert()])).toEqual({ push: 1 });
    expect(quietMock).not.toHaveBeenCalled();
  });
});

describe("notifySubscribedUsers: dedupe and the log", () => {
  const prefs = [{ user_id: "u1", push_enabled: true }];
  const hash = "SPY-old_level_cross-bullish";

  it("logs each push with the signal's hash", async () => {
    const { client, inserted } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    await run(client, [alert()]);
    expect(inserted.map((r) => [r.channel, r.status, r.signal_hash, r.recipient])).toEqual([["push", "sent", hash, null]]);
  });

  it("does not resend inside the window, and an earlier email does not hold back the push", async () => {
    const recent = new Date(NOW.getTime() - 3600_000).toISOString();
    const pushed = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs,
      log: [{ user_id: "u1", channel: "push", signal_hash: hash, triggered_at: recent }],
    });
    expect(await run(pushed.client, [alert()])).toEqual({ push: 0 });
    const emailed = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs,
      log: [{ user_id: "u1", channel: "email", signal_hash: hash, triggered_at: recent }],
    });
    expect(await run(emailed.client, [alert()])).toEqual({ push: 1 });
  });

  it("sends a signal again on a new New York day", async () => {
    const old = new Date(NOW.getTime() - (NOTIFICATION_DEDUP_HOURS + 1) * 3600_000).toISOString();
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs,
      log: [{ user_id: "u1", channel: "push", signal_hash: hash, triggered_at: old }],
    });
    expect(await run(client, [alert()])).toEqual({ push: 1 });
  });

  it("sends a standing signal once a move: not on a new score, again after it turns", async () => {
    const { client } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    // One scheduled scan every 15 minutes.
    let scan = 0;
    const next = (alerts: Alert[]) =>
      notifySubscribedUsers(client, alerts, { intervalBySymbol: intervals, now: new Date(NOW.getTime() + scan++ * 15 * 60_000) });
    expect(await next([alert()])).toEqual({ push: 1 });
    expect(await next([alert()])).toEqual({ push: 0 });
    // 10-27 sent 150 emails for 63 member-symbol-direction pairs, every repeat a new score.
    expect(await next([alert({ confidence: 80 })])).toEqual({ push: 0 });
    expect(await next([alert({ direction: "down" })])).toEqual({ push: 1 });
    expect(await next([alert()])).toEqual({ push: 1 });
    // A different signal on the same symbol is its own move.
    expect(await next([alert({ type: "trend_continuation" } as Partial<Alert>)])).toEqual({ push: 1 });
  });

  it("does not hold another member's send on one member's log", async () => {
    const recent = new Date(NOW.getTime() - 60_000).toISOString();
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }, { id: "u2", email: "b@x.test" }],
      prefs: [...prefs, { user_id: "u2", push_enabled: true }],
      log: [{ user_id: "u1", channel: "push", signal_hash: hash, triggered_at: recent }],
    });
    expect(await run(client, [alert()])).toEqual({ push: 1 });
    expect(sendPushMock.mock.calls[0][1]).toBe("u2");
  });

  it("logs a failed push as failed with the reason, counts it nowhere, and does not retry it", async () => {
    sendPushMock.mockResolvedValue({ success: false, error: "gone" });
    const { client, inserted } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    expect(await run(client, [alert()])).toEqual({ push: 0 });
    expect(inserted[0]).toMatchObject({ channel: "push", status: "failed", error_message: "gone", sent_at: null });
    sendPushMock.mockResolvedValue({ success: true });
    expect(await run(client, [alert()])).toEqual({ push: 0 });
  });

  it("counts a signal sent at the New York day's first minute", async () => {
    // 00:00 New York on 2026-10-22 is 04:00 UTC (EDT).
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs,
      log: [{ user_id: "u1", channel: "push", signal_hash: hash, triggered_at: "2026-10-22T04:00:00.000Z" }],
    });
    expect(await run(client, [alert()])).toEqual({ push: 0 });
  });

  it("still counts a notice sent exactly at the window's edge", async () => {
    const edge = new Date(NOW.getTime() - NOTIFICATION_DEDUP_HOURS * 3600_000).toISOString();
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs,
      log: [{ user_id: "u1", channel: "push", signal_hash: "SPY-entry_reached-bullish", triggered_at: edge }],
    });
    expect(await run(client, [alert({ type: "entry_reached" } as Partial<Alert>)])).toEqual({ push: 0 });
  });

  it("logs nothing for a push with no subscribed browser", async () => {
    sendPushMock.mockResolvedValue({ success: false, skipped: true, error: "no subscription" });
    const { client, inserted } = fakeService({ users: [{ id: "u1", email: "a@x.test" }], prefs });
    expect(await run(client, [alert()])).toEqual({ push: 0 });
    expect(inserted).toHaveLength(0);
  });

  it("keeps going for the next member when one member's sends throw", async () => {
    policyMock.mockImplementation((_s: unknown, id: string) =>
      id === "u1" ? Promise.reject(new Error("boom")) : Promise.resolve(FULL),
    );
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }, { id: "u2", email: "b@x.test" }],
      prefs: [...prefs, { user_id: "u2", push_enabled: true }],
    });
    expect(await run(client, [alert()])).toEqual({ push: 1 });
  });
});

describe("notifySubscribedUsers: the message", () => {
  it("pushes the bell's wording to the ticker page", async () => {
    const { client } = fakeService({
      users: [{ id: "u1", email: "a@x.test" }],
      prefs: [{ user_id: "u1", email_enabled: true, push_enabled: true }],
    });
    await run(client, [alert({ direction: "down", confidence: 67 } as Partial<Alert>)]);
    const push = sendPushMock.mock.calls[0][2];
    expect(push.title).toContain("SPY intraday, down");
    expect(push.tag).toBe("intraday-SPY");
    expect(push.url).toContain("SPY");
    expect(push.body).toContain("no measured record yet");
  });

  it("does nothing at all for an empty list of alerts", async () => {
    const { client, pages } = fakeService({ users: [{ id: "u1" }], prefs: [{ user_id: "u1", push_enabled: true }] });
    expect(await run(client, [])).toEqual({ push: 0 });
    expect(pages).toHaveLength(0);
  });
});
