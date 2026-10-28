/**
 * NOTIFY-FRESHNESS-001's delivery paths (owner, 2026-10-28): the bell, push
 * and the queued deliveries each read one freshness check at the dispatch
 * clock, and the other gates (tier, channel, quiet hours, deduplication) stay
 * independent of it. Each test asserts what was sent and what was not.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alert } from "@/lib/scanner/intraday";
import { alertTimeliness } from "@/lib/__tests__/fixtures/alertTimeliness";

const { sendPushMock, policyMock, quietMock } = vi.hoisted(() => ({
  sendPushMock: vi.fn(),
  policyMock: vi.fn(),
  quietMock: vi.fn(),
}));
vi.mock("@/lib/notifications/web-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications/web-push")>()),
  sendPushToProfile: sendPushMock,
  vapidConfig: () => ({ publicKey: "p", privateKey: "k", subject: "mailto:x" }),
}));
vi.mock("@/lib/entitlements/policy", () => ({ getUserEntitlementPolicy: policyMock }));
vi.mock("@/lib/entitlements/delivery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entitlements/delivery")>()),
  inQuietHours: quietMock,
}));

import { recordIntradayBells } from "@/lib/notifications/intradayBell";
import { notifySubscribedUsers } from "@/lib/notifications/intradayDelivery";
import { supersededHold } from "@/lib/entitlements/delivery";

// 10:45 ET on Wednesday 2026-10-28: the 10:15-10:30 candle is just usable.
const EVAL = new Date("2026-10-28T14:45:00.000Z");
const FULL = { intradayScansEnabled: true, proIntradayModuleEnabled: false };
const NOVICE = { intradayScansEnabled: false, proIntradayModuleEnabled: false };

type Row = Record<string, unknown>;

function alert(over: Partial<Alert> = {}): Alert {
  return {
    symbol: "SPY",
    kind: "equity",
    type: "old_level_cross",
    direction: "up",
    confidence: 100,
    move: { current: 770 },
    invalidation: 760,
    continuationPlan: { entry: 768, firstTarget: 790, masterTarget: 800, paysRisk: true },
    timeliness: alertTimeliness(EVAL),
    ...over,
  } as unknown as Alert;
}

const realtimeAlert = (over: Partial<Alert> = {}) =>
  alert({
    timeliness: alertTimeliness(EVAL, { feed: "realtime", delayMs: 0, heldForDelay: false, actionable: true, authorizationId: "auth-1" }),
    ...over,
  });

/** One in-memory database for both paths: watchers, bell rows, push prefs and log. */
function db(opts: { users?: string[]; push?: boolean; logError?: boolean } = {}) {
  const users = opts.users ?? ["u1"];
  const tables: Record<string, Row[]> = {
    watchlists: users.map((u) => ({ id: `wl-${u}`, user_id: u })),
    watchlist_items: users.map((u) => ({ watchlist_id: `wl-${u}`, symbol: "SPY" })),
    active_monitors: [],
    in_app_notifications: [],
    notification_preferences: users.map((user_id) => ({ user_id, push_enabled: opts.push ?? true, min_score: 0 })),
    notification_log: [],
  };
  function from(name: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let columns = "";
    const result = () => {
      if (name === "notification_log" && opts.logError) return { data: null, error: { message: "down" } };
      let data = tables[name].filter((r) => filters.every((f) => f(r)));
      if (name === "watchlist_items" && columns.includes("watchlists!inner")) {
        data = data.map((r) => ({ ...r, watchlists: tables.watchlists.find((w) => w.id === r.watchlist_id) }));
      }
      return { data, error: null };
    };
    const chain = {
      select: (c = "") => ((columns = c), chain),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), chain),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), chain),
      then: (resolve: (v: ReturnType<typeof result>) => void) => resolve(result()),
      insert: (input: Row | Row[]) => {
        for (const r of Array.isArray(input) ? input : [input]) tables[name].push({ created_at: EVAL.toISOString(), ...r });
        return Promise.resolve({ error: null });
      },
    };
    return chain;
  }
  const auth = {
    admin: {
      listUsers: async ({ page }: { page: number }) => ({ data: { users: page === 1 ? users.map((id) => ({ id })) : [] }, error: null }),
    },
  };
  return { client: { from, auth } as unknown as SupabaseClient, tables };
}

const at = (minutesAfterEval: number) => () => new Date(EVAL.getTime() + minutesAfterEval * 60_000);
const intervals = new Map([["SPY", 15]]);
const both = async (client: SupabaseClient, alerts: Alert[], clock: () => Date) => ({
  bell: await recordIntradayBells(client, alerts, { intervalBySymbol: intervals, now: EVAL, clock }),
  push: (await notifySubscribedUsers(client, alerts, { intervalBySymbol: intervals, now: EVAL, clock })).push,
});

beforeEach(() => {
  for (const m of [sendPushMock, policyMock, quietMock]) m.mockReset();
  policyMock.mockResolvedValue(FULL);
  quietMock.mockResolvedValue(false);
  sendPushMock.mockResolvedValue({ success: true });
});

describe("freshness on every delivery path", () => {
  it("1. suppression: an alert with no provenance is neither written nor pushed nor logged", async () => {
    const d = db();
    expect(await both(d.client, [alert({ timeliness: undefined })], at(1))).toEqual({ bell: 0, push: 0 });
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(d.tables.in_app_notifications).toHaveLength(0);
    expect(d.tables.notification_log).toHaveLength(0);
  });

  it("2. informational: a delayed observation goes out with its as-of time and no instruction to act", async () => {
    const d = db();
    expect(await both(d.client, [alert({ type: "entry_reached" } as Partial<Alert>)], at(1))).toEqual({ bell: 1, push: 1 });
    const bell = String(d.tables.in_app_notifications[0].body);
    const push = sendPushMock.mock.calls[0][2].body as string;
    for (const body of [bell, push]) {
      expect(body).toContain("Delayed observation: price reached the entry in the 10:15–10:30 AM ET candle.");
      expect(body).toContain("Current entry status has not been verified.");
      expect(body).not.toMatch(/\bnow\b/i);
    }
    expect(bell).toBe(push);
  });

  it("3. actionable: a current real-time authorization may say the price is at the entry now", async () => {
    const d = db();
    await both(d.client, [realtimeAlert({ type: "entry_reached" } as Partial<Alert>)], at(1));
    expect(String(d.tables.in_app_notifications[0].body)).toContain("Price is at the entry now");
    expect(sendPushMock.mock.calls[0][2].body).toContain("Price is at the entry now");
  });

  it("4. queue aging: dispatched more than one scan after evaluation, nothing goes", async () => {
    const d = db();
    expect(await both(d.client, [alert()], at(15))).toEqual({ bell: 1, push: 1 });
    const later = db();
    expect(await both(later.client, [alert()], at(16))).toEqual({ bell: 0, push: 0 });
    expect(later.tables.notification_log).toHaveLength(0);
  });

  it("5. retry aging: a push whose clock passes the limit mid-run is not sent, earlier ones are", async () => {
    const d = db({ users: ["u1", "u2"] });
    const times = [at(14)(), at(14)(), at(20)(), at(20)()];
    let i = 0;
    const clock = () => times[Math.min(i++, times.length - 1)];
    const sent = await notifySubscribedUsers(d.client, [alert()], { intervalBySymbol: intervals, now: EVAL, clock });
    expect(sent.push).toBe(1);
    expect(sendPushMock.mock.calls.map((c) => c[1])).toEqual(["u1"]);
  });

  it("6. state change: a queued alert whose monitor moved on is held; an invalidation never is", async () => {
    const svc = (state: string | null) =>
      ({
        from: () => {
          const q = {
            select: () => q,
            eq: () => q,
            in: () => q,
            maybeSingle: async () => ({ data: state ? { state } : null, error: null }),
          };
          return q;
        },
      }) as unknown as SupabaseClient;
    const payload = { symbol: "AAPL", direction: "bullish", score: 8, exactScoreDisplayEnabled: true, entry: 1, stopLoss: 0.9, takeProfit: 1.2, verdict: "Execute", confidence: 1 } as const;
    expect(await supersededHold(svc("EXECUTE"), "p1", payload)).toBeNull();
    expect(await supersededHold(svc("WATCH"), "p1", payload)).toMatch(/changed since/);
    expect(await supersededHold(svc(null), "p1", payload)).toMatch(/no open plan/);
    expect(await supersededHold(svc(null), "p1", { symbol: "AAPL", verdict: "INVALIDATED" })).toBeNull();
  });

  it("7. dependency freshness: data not yet usable when the scan evaluated it is suppressed", async () => {
    const d = db();
    const early = alert({ timeliness: alertTimeliness(EVAL, { dataAsOf: new Date(EVAL.getTime() - 10 * 60_000).toISOString() }) });
    expect(await both(d.client, [early], at(1))).toEqual({ bell: 0, push: 0 });
  });

  it("8. independent permissions: an actionable alert still reaches no one without access or the channel", async () => {
    policyMock.mockResolvedValue(NOVICE);
    expect(await both(db().client, [realtimeAlert()], at(1))).toEqual({ bell: 0, push: 0 });
    policyMock.mockResolvedValue(FULL);
    const off = db({ push: false });
    expect((await notifySubscribedUsers(off.client, [realtimeAlert()], { intervalBySymbol: intervals, now: EVAL, clock: at(1) })).push).toBe(0);
    quietMock.mockResolvedValue(true);
    const quiet = db();
    quiet.tables.notification_preferences[0].quiet_hours_enabled = true;
    expect((await notifySubscribedUsers(quiet.client, [realtimeAlert()], { intervalBySymbol: intervals, now: EVAL, clock: at(1) })).push).toBe(0);
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("9. deduplication stays its own gate: a fresh repeat is held, a suppressed one leaves no record", async () => {
    const d = db();
    await both(d.client, [alert({ timeliness: undefined })], at(1));
    expect(await both(d.client, [alert()], at(1))).toEqual({ bell: 1, push: 1 });
    expect(await both(d.client, [alert()], at(2))).toEqual({ bell: 0, push: 0 });
    expect(sendPushMock).toHaveBeenCalledTimes(1);
  });

  it("10. a held entry is told, never as a trade", async () => {
    const d = db();
    const held = alert({ type: "entry_reached", continuationPlan: { entry: 768, firstTarget: 769, paysRisk: false } } as Partial<Alert>);
    await both(d.client, [realtimeAlert({ ...held, timeliness: realtimeAlert().timeliness })], at(1));
    expect(String(d.tables.in_app_notifications[0].body)).toContain("This plan is held");
    expect(String(d.tables.in_app_notifications[0].body)).not.toContain("Price is at the entry now");
  });

  it("11. clock: the log is stamped when the push went, not when the scan started", async () => {
    const d = db();
    await notifySubscribedUsers(d.client, [alert()], { intervalBySymbol: intervals, now: new Date("2026-10-28T13:00:00Z"), clock: at(3) });
    expect(d.tables.notification_log[0].triggered_at).toBe(at(3)().toISOString());
  });

  it("12. failure isolation: one alert's bad provenance or a failed send does not stop the next", async () => {
    sendPushMock.mockResolvedValueOnce({ success: false, error: "gone" }).mockResolvedValue({ success: true });
    const d = db();
    const alerts = [alert({ symbol: "QQQ", timeliness: undefined }), alert({ type: "trend_continuation" } as Partial<Alert>), alert()];
    d.tables.watchlist_items.push({ watchlist_id: "wl-u1", symbol: "QQQ" });
    const out = await both(d.client, alerts, at(1));
    expect(out.bell).toBe(2);
    expect(out.push).toBe(1);
    expect(sendPushMock).toHaveBeenCalledTimes(2);
    expect(d.tables.notification_log.map((r) => r.status)).toEqual(["failed", "sent"]);
  });
});
