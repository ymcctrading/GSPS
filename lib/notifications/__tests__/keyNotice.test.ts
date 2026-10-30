import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

const pushMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/web-push", () => ({ sendPushToProfile: pushMock }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => { throw new Error("no service key in tests"); } }));

import { deliverKeyNotice, type KeyNotice } from "@/lib/notifications/keyNotice";
import { dayRotation } from "@/lib/notifications/email-budget";

const NOTICE: KeyNotice = {
  verdict: "Your trade",
  symbol: "AAPL",
  title: "AAPL: resting order cancelled",
  body: "Your resting buy order for 10 AAPL was cancelled.",
  url: "/portfolio",
  tag: "order-cancelled-1",
};

/** A client whose bell insert, preference read and quiet-hours call return what is given. */
function client(opts: { insertError?: string; push?: boolean | null; quiet?: boolean }) {
  const inserts: unknown[] = [];
  const prefs = {
    select: () => prefs,
    eq: () => prefs,
    maybeSingle: async () => ({ data: opts.push == null ? null : { push_enabled: opts.push }, error: null }),
  };
  const c = {
    from: (table: string) =>
      table === "in_app_notifications"
        ? { insert: async (row: unknown) => { inserts.push(row); return { error: opts.insertError ? { message: opts.insertError } : null }; } }
        : prefs,
    rpc: async () => ({ data: opts.quiet === true, error: null }),
  };
  return { c: c as unknown as SupabaseClient, inserts };
}

describe("deliverKeyNotice", () => {
  it("writes the bell and pushes a member's own trade notice, even in quiet hours", async () => {
    pushMock.mockReset().mockResolvedValue({ success: true });
    const { c, inserts } = client({ push: true, quiet: true });
    const result = await deliverKeyNotice("u1", NOTICE, c);
    expect(result).toEqual({ bell: true, pushed: true });
    expect(inserts[0]).toMatchObject({ profile_id: "u1", verdict: "Your trade", symbol: "AAPL" });
    expect(pushMock).toHaveBeenCalledWith(c, "u1", { title: NOTICE.title, body: NOTICE.body, url: "/portfolio", tag: NOTICE.tag });
  });

  it("holds the summary's push in quiet hours but still writes the bell", async () => {
    pushMock.mockReset().mockResolvedValue({ success: true });
    const { c, inserts } = client({ push: true, quiet: true });
    const result = await deliverKeyNotice("u1", { ...NOTICE, verdict: "Summary", symbol: "" }, c);
    expect(result).toEqual({ bell: true, pushed: false });
    expect(inserts).toHaveLength(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("sends no push to a member with push off", async () => {
    pushMock.mockReset();
    const { c } = client({ push: false });
    expect(await deliverKeyNotice("u1", NOTICE, c)).toEqual({ bell: true, pushed: false });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("still pushes when the bell write fails, and never throws", async () => {
    pushMock.mockReset().mockResolvedValue({ success: true });
    const { c } = client({ push: true, insertError: "boom" });
    expect(await deliverKeyNotice("u1", NOTICE, c)).toEqual({ bell: false, pushed: true });
  });

  it("returns quietly when no service client can be made", async () => {
    expect(await deliverKeyNotice("u1", NOTICE)).toEqual({ bell: false, pushed: false });
  });
});

describe("dayRotation", () => {
  const users = Array.from({ length: 40 }, (_, i) => ({ id: `user-${i}` }));

  it("keeps every member, once", () => {
    const order = dayRotation(users, "2026-10-29");
    expect(new Set(order.map((u) => u.id)).size).toBe(users.length);
  });

  it("is the same on a rerun the same day and different the next day", () => {
    const a = dayRotation(users, "2026-10-29").map((u) => u.id);
    expect(dayRotation(users, "2026-10-29").map((u) => u.id)).toEqual(a);
    expect(dayRotation(users, "2026-10-30").map((u) => u.id)).not.toEqual(a);
  });

  it("puts different members at the back on different days", () => {
    const tail = (day: string) => dayRotation(users, day).slice(-10).map((u) => u.id).sort();
    expect(tail("2026-10-29")).not.toEqual(tail("2026-10-30"));
  });
});

describe("the bell accepts every notice kind the app writes", () => {
  it("lists the bell component's verdicts in the latest check", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0139_bell_trade_and_summary.sql"), "utf8");
    const check = sql.match(/add constraint in_app_notifications_verdict_check\s+check \(verdict in \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const allowed = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    const bell = readFileSync(join(process.cwd(), "components/notifications/notification-bell.tsx"), "utf8");
    const typed = bell.match(/verdict: ((?:"[^"]+"(?: \| )?)+);/);
    const listed = [...typed![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
    expect(allowed).toEqual(listed);
  });
});
