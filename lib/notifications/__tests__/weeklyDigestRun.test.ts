import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const deliverMock = vi.hoisted(() => vi.fn());
const emailMock = vi.hoisted(() => vi.fn());
const optedInMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/keyNotice", () => ({ deliverKeyNotice: deliverMock, PORTFOLIO_PATH: "/portfolio" }));
vi.mock("@/lib/notifications/resend-handler", () => ({ sendWeeklyDigestEmail: emailMock }));
vi.mock("@/lib/notifications/email-opt-in", () => ({ emailOptedIn: optedInMock }));
vi.mock("@/lib/data/universeStrength", () => ({ getUniverseStrength: async () => null }));

import { sendWeeklyDigests } from "@/lib/notifications/weeklyDigestRun";

const FRIDAY = new Date("2026-10-30T22:00:00Z");

/** A chainable read that resolves to `rows` for each table. */
function client(rows: Record<string, unknown[]>) {
  const reads: string[] = [];
  const c = {
    from(table: string) {
      reads.push(table);
      const result = { data: rows[table] ?? [], error: null };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "or", "order"]) q[m] = () => q;
      q.limit = async () => result;
      return q;
    },
  };
  return { c: c as unknown as SupabaseClient, reads };
}

describe("sendWeeklyDigests", () => {
  beforeEach(() => {
    deliverMock.mockReset().mockResolvedValue({ bell: true, pushed: false });
    emailMock.mockReset().mockResolvedValue({ success: true });
    optedInMock.mockReset().mockResolvedValue(false);
  });

  it("writes each member's week to the bell, and emails only a member who turned email on", async () => {
    optedInMock.mockImplementation(async (_c: unknown, id: string) => id === "u2");
    const { c } = client({
      trade_logs: [{ exit_timestamp: "2026-10-28T15:00:00Z", outcome: "profit", profit_loss_dollars: 100 }],
      active_monitors: [
        { symbol: "AAPL", state: "EXECUTE", created_at: "2026-10-20T15:00:00Z", updated_at: "2026-10-29T15:00:00Z" },
        // Last touched before Monday: not this week's.
        { symbol: "MSFT", state: "EXPIRED", created_at: "2026-10-20T15:00:00Z", updated_at: "2026-10-23T15:00:00Z" },
      ],
    });
    const result = await sendWeeklyDigests(c, [{ id: "u1", email: "a@x" }, { id: "u2", email: "b@x" }], FRIDAY);

    expect(result).toMatchObject({ weekOf: "2026-10-26", delivered: 2, emailed: 1, alreadySent: 0, failed: 0 });
    const notice = deliverMock.mock.calls[0][1];
    expect(notice).toMatchObject({ verdict: "Summary", title: "Your week on GSPS: week of Oct 26", tag: "weekly-2026-10-26" });
    expect(notice.body).toContain("You closed 1 trade this week (1 with a gain), net +$100.00.");
    expect(notice.body).toContain("Setups you tracked this week: 1. Now 1 at Execute.");
    expect(emailMock).toHaveBeenCalledTimes(1);
    expect(emailMock.mock.calls[0][0]).toMatchObject({ userEmail: "b@x" });
  });

  it("sends nothing twice when the bell already holds this week's digest", async () => {
    const { c } = client({ in_app_notifications: [{ id: "n1" }] });
    const result = await sendWeeklyDigests(c, [{ id: "u1", email: "a@x" }], FRIDAY);
    expect(result).toMatchObject({ alreadySent: 1, delivered: 0 });
    expect(deliverMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();
  });
});
