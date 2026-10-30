/**
 * GSPS — the daily email budget (owner, 2026-10-28, item 6: "send only the
 * most pertinent notifications via email….everything else should be a
 * mobile/in platform notification").
 *
 * Measured before it was built: the provider refused sends once about 200 had
 * gone out in a UTC day (10-23 and 10-26), and intraday signals were about 90%
 * of them. Intraday signals now go by push and the bell only. This is the
 * backstop for what is still emailed: every send reserves a slot first
 * (`reserve_email_send`, migration 0126), and a send over its kind's ceiling is
 * skipped with a reason, never retried. The bell already holds every alert, so
 * a skipped email loses nothing the member can't see in the app.
 *
 * Ceilings (engineering choices, labelled): 60 a day for the evening digest,
 * 80 for alerts, 95 for a member's own trades and orders and for operator
 * notices. A kind spends only up to its own ceiling, counted on the day's
 * shared total, so what a member must act on still goes out after the
 * alerts have spent theirs, and the alerts still go out after the digest
 * (2026-10-29: at 100 members the digest alone would take the whole day's
 * 100). The total stays under the free plan's 100 a day and 3,000 a month.
 * `EMAIL_DAILY_BUDGET` moves the alert ceiling; the others keep their
 * distance from it.
 *
 * A skip is never the end of a notice: what is skipped is already in the
 * bell, and the digest and a member's own trade notices are written there
 * and pushed whatever the email does (`lib/notifications/keyNotice.ts`).
 *
 * Fails open: if the ledger can't be read the email goes out, since the
 * provider's own quota is the last line and a missed stop-loss notice costs
 * more than one email over budget.
 *
 * October's overage (notification_log and notification_deliveries, read
 * 2026-10-29): 10-23 and 10-26 sent 212 each before the provider refused 21
 * and 60 more, 189 and 186 of them per-member intraday signal emails to three
 * members, which now go by push and the bell. 10-22's 222 log rows were 12
 * sends and 210 network failures, retried.
 *
 * Mandate: no market content (a delivery channel), Dewey N/A. Cause and
 * Effect: what a member must act on (their own trade) is the cause that earns
 * the scarce channel. Law of Creation: budget ⊗ priority orders the sends;
 * neither alone would.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { USAGE_METERS, holdDecision, periodOf } from "@/lib/ops/usageLimits";

/** What an email is about, which decides its ceiling. */
export type EmailKind = "trade" | "ops" | "alert" | "digest";

export const DEFAULT_EMAIL_DAILY_BUDGET = 80;
const PRIORITY_HEADROOM = 15;
/** How far under the alerts' ceiling the digest stops. */
const DIGEST_YIELD = 20;

/** The day's ceiling for this kind of email. */
export function emailCeiling(kind: EmailKind, raw: string | undefined = process.env.EMAIL_DAILY_BUDGET): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EMAIL_DAILY_BUDGET;
  if (kind === "trade" || kind === "ops") return base + PRIORITY_HEADROOM;
  if (kind === "digest") return Math.max(1, base - DIGEST_YIELD);
  return base;
}

export const BUDGET_SKIP_REASON = "Today's email budget is spent; the notice is in the app.";

/**
 * The order a daily mailing goes out in, shuffled by the day: when the budget
 * runs out part-way, a different set of members falls to the bell each day
 * rather than the same ones every evening. Deterministic (FNV-1a of the id and
 * the day), so a rerun the same day sends in the same order.
 */
export function dayRotation<T extends { id: string }>(items: readonly T[], dayKey: string): T[] {
  const rank = (id: string) => {
    let h = 0x811c9dc5;
    for (const ch of `${dayKey}:${id}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  };
  return items
    .map((item) => ({ item, r: rank(item.id) }))
    .sort((a, b) => a.r - b.r || (a.item.id < b.item.id ? -1 : 1))
    .map((x) => x.item);
}

/**
 * Takes one slot of today's budget for this kind, or returns why not. Null
 * means send.
 */
export async function emailBudgetHold(kind: EmailKind): Promise<string | null> {
  try {
    const monthly = await monthlyHold();
    if (monthly) return monthly;
    const { data, error } = await createServiceClient().rpc("reserve_email_send", { p_limit: emailCeiling(kind) });
    if (error) {
      console.error("[email-budget] ledger unread, sending anyway:", error.message);
      return null;
    }
    return data === false ? BUDGET_SKIP_REASON : null;
  } catch (err) {
    console.error("[email-budget] ledger unread, sending anyway:", err);
    return null;
  }
}

/**
 * The month's 99% hold (owner, 2026-10-28: "never allow us to use all 100% of
 * our limits unless it is within the last two days of the allotted month";
 * `lib/ops/usageLimits.ts`). The daily ceilings above already stay under the
 * free plan's 100 a day; this keeps the month's sends under 99% of its 3,000
 * until its last two days. Fails open, as the daily budget does.
 */
async function monthlyHold(now: Date = new Date()): Promise<string | null> {
  const meter = USAGE_METERS.email_monthly;
  const { start, end } = periodOf(meter, now);
  const { data, error } = await createServiceClient()
    .from("email_daily_budget")
    .select("sent")
    .gte("day", start.toISOString().slice(0, 10))
    .lt("day", end!.toISOString().slice(0, 10));
  if (error) return null;
  const used = (data ?? []).reduce((sum, row) => sum + Number(row.sent ?? 0), 0);
  const decision = holdDecision(meter, used, now, null);
  return decision.hold ? `This month's email allowance is at 99%; the notice is in the app.` : null;
}
