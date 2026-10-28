/**
 * GSPS — /api/automation-report: emails the owner's ymcctrading account the
 * day's comparison of every account the portfolio manager trades for on paper
 * (owner, 2026-10-28: "Send the results to the ymcctrading account daily at
 * 5pm"). The report is pure (`lib/reports/automationReport.ts`).
 *
 * Run by the database's scheduler at 21:00 and 22:00 UTC on weekdays
 * (migration 0132), so one of the two is 5 PM New York time in either season:
 * a run before 5 PM New York time, or on a day the market is shut, sends
 * nothing, and the report's idempotency key keeps the second run from sending
 * again. `?dry=1` signed in as an owner account returns the text without
 * sending; anyone else gets a 404, so the route discloses nothing.
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { OWNER_EMAILS, ownerOf } from "@/lib/auth/owner";
import { isCronAuthorized } from "@/lib/cron-auth";
import { etDateKey, etParts } from "@/lib/market/session";
import { isTradingDay } from "@/lib/market/calendar";
import { fromHeader, sandboxBlockReason } from "@/lib/notifications/resend-handler";
import { emailBudgetHold } from "@/lib/notifications/email-budget";
import {
  automationReportEmail,
  buildAccountSections,
  type AccountSettings,
  type ActivationRow,
  type OrderRow,
  type PositionRow,
  type TradeRow,
} from "@/lib/reports/automationReport";

/** The one account the report goes to (owner, 2026-10-28), held to the owner pair. */
const REPORT_TO = ["ymcctrading@gmail.com"].filter((e) => OWNER_EMAILS.includes(e));
const SEND_FROM_MINUTES = 17 * 60;
const PAGE = 1000;

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

export async function GET(req: NextRequest) {
  const cron = isCronAuthorized(req.headers.get("authorization"));
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  if (!cron) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!ownerOf(user) || !dry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  const day = etDateKey(now);
  if (!dry) {
    if (!isTradingDay(now)) return NextResponse.json({ sent: false, reason: `${day} is not a trading day.` }, { status: 202 });
    if (etParts(now).minutes < SEND_FROM_MINUTES) return NextResponse.json({ sent: false, reason: "Before 5 PM New York time." }, { status: 202 });
  }

  const service = createServiceClient();
  try {
    const { data: profiles, error } = await service
      .from("user_automation_profiles")
      .select("user_id, risk_profile, directional_bias, execution_mode, updated_at, created_at")
      .eq("is_automation_enabled", true);
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p) => p.user_id as string);

    const emails = new Map<string, string>();
    for (let page = 1; ; page++) {
      const { data, error: listError } = await service.auth.admin.listUsers({ page, perPage: 200 });
      if (listError) throw new Error(listError.message);
      for (const u of data.users) emails.set(u.id, u.email ?? u.id);
      if (data.users.length < 200) break;
    }

    const accounts: AccountSettings[] = (profiles ?? [])
      .map((p) => ({
        userId: p.user_id as string,
        email: emails.get(p.user_id as string) ?? (p.user_id as string),
        riskProfile: (p.risk_profile as string | null) ?? null,
        directionalBias: (p.directional_bias as string | null) ?? null,
        executionMode: (p.execution_mode as string | null) ?? null,
        // The row's last change: when its settings, including the switch, were last set.
        enabledSince: (p.updated_at as string | null) ?? (p.created_at as string | null) ?? null,
      }))
      .sort((a, b) => a.email.localeCompare(b.email));

    const dayStart = new Date(now.getTime() - 36 * 3_600_000).toISOString();
    const earliest = accounts.reduce((m, a) => (a.enabledSince && a.enabledSince < m ? a.enabledSince : m), dayStart);
    const [cashRows, orders, trades, positions, activations] = ids.length
      ? await Promise.all([
          readAll<{ user_id: string; cash: number }>((f, t) => service.from("paper_accounts").select("user_id, cash").in("user_id", ids).range(f, t)),
          readAll<OrderRow>((f, t) => service.from("orders").select("user_id, symbol, side, status, qty, filled_avg_price, created_at, mode").in("user_id", ids).eq("mode", "paper").gte("created_at", dayStart).range(f, t)),
          readAll<TradeRow>((f, t) => service.from("trade_logs").select("user_id, symbol, direction, outcome, profit_loss_dollars, exit_timestamp, mode").in("user_id", ids).eq("mode", "paper").gte("exit_timestamp", earliest).range(f, t)),
          readAll<PositionRow>((f, t) => service.from("positions").select("user_id, symbol, side, qty, avg_entry_price, stop_loss").in("user_id", ids).eq("closed", false).eq("mode", "paper").range(f, t)),
          readAll<ActivationRow>((f, t) => service.from("automation_profiles").select("user_id, activated_at").in("user_id", ids).gte("activated_at", dayStart).range(f, t)),
        ])
      : [[], [], [], [], []];

    const sections = buildAccountSections({
      day,
      accounts,
      cash: new Map(cashRows.map((r) => [r.user_id, Number(r.cash)])),
      orders,
      trades,
      positions,
      activations,
    });
    const mail = automationReportEmail(day, sections);
    if (dry) return NextResponse.json({ day, accounts: sections.length, text: mail.text }, { headers: { "cache-control": "private, no-store" } });

    if (!process.env.RESEND_API_KEY) return NextResponse.json({ sent: false, reason: "RESEND_API_KEY is not set." }, { status: 503 });
    const to = REPORT_TO.filter((e) => !sandboxBlockReason(e));
    if (to.length === 0) return NextResponse.json({ sent: false, reason: "The recipient is blocked by the sender's sandbox." }, { status: 503 });
    const held = await emailBudgetHold("ops");
    if (held) return NextResponse.json({ sent: false, reason: held }, { status: 202 });
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send(
      { from: fromHeader("GSPS Portfolio Manager"), to, subject: mail.subject, html: mail.html, text: mail.text },
      { idempotencyKey: `automation-report-${day}` },
    );
    if (result.error) return NextResponse.json({ sent: false, error: result.error.message }, { status: 502 });
    return NextResponse.json({ sent: true, day, accounts: sections.length, id: result.data?.id ?? null });
  } catch (err) {
    console.error(`[automation-report] ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "Report not built" }, { status: 500 });
  }
}
