/**
 * GSPS — /api/trade-journal/daily-email
 *
 * Fires 2 hours after the market close (see `vercel.json`'s cron schedule)
 * and emails every user with at least one closed trade their journal
 * spreadsheet — see `lib/journal/build-workbook.ts` for what's in it and why
 * it reads straight from `trade_logs` rather than keeping a second copy of
 * the trade history.
 *
 * Runs across every user, not one — unlike the rest of this app's API
 * routes, which act on the signed-in caller — so it needs the service-role
 * client (bypasses RLS) and the admin API to enumerate accounts. Same
 * CRON_SECRET pattern as `/api/market-scan`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { buildJournalWorkbook, closedTrades, type JournalTrade } from "@/lib/journal/build-workbook";
import { sendJournalEmail } from "@/lib/notifications/resend-handler";
import { etDateKey } from "@/lib/market/session";

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("trade-journal: CRON_SECRET is not set — the scheduled digest cannot run");
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return sendDailyJournals();
}

async function sendDailyJournals(): Promise<NextResponse> {
  const supabase = createServiceClient();
  const now = new Date();
  const dateLabel = etDateKey(now);

  const users: { id: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error(`trade-journal: listing users — ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const u of data.users) if (u.email) users.push({ id: u.id, email: u.email });
    if (data.users.length < 200) break;
  }

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];
  // Resend's sandbox sender (onboarding@resend.dev) can only deliver to this
  // account's own verified address until a domain is verified — see the
  // guard in lib/notifications/resend-handler.ts. Recording these separately
  // from `failures` keeps "Resend rejected the send" distinct from "expected,
  // pending domain verification".
  const sandboxBlocked: string[] = [];

  for (const user of users) {
    const { data: rows, error } = await supabase
      .from("trade_logs")
      .select(
        "symbol, direction, quantity, entry_timestamp, entry_price, exit_timestamp, exit_price, outcome, profit_loss_dollars, profit_loss_percent, exit_condition, signal_called, signal_adherence",
      )
      .eq("user_id", user.id)
      .not("exit_timestamp", "is", null)
      .order("exit_timestamp", { ascending: false })
      .limit(5000);

    if (error) {
      failures.push(`${user.email}: ${error.message}`);
      continue;
    }

    const trades = (rows ?? []) as JournalTrade[];
    const closed = closedTrades(trades);
    if (closed.length === 0) {
      skipped++;
      continue;
    }

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const exitedAt = (t: JournalTrade) => new Date(t.exit_timestamp as string).getTime();

    const attachment = await buildJournalWorkbook(trades, now);
    const result = await sendJournalEmail({
      userEmail: user.email,
      dateLabel,
      todayCount: closed.filter((t) => exitedAt(t) >= startOfDay.getTime()).length,
      weekCount: closed.filter((t) => exitedAt(t) >= startOfWeek.getTime()).length,
      monthCount: closed.filter((t) => exitedAt(t) >= startOfMonth.getTime()).length,
      allTimeCount: closed.length,
      attachment,
      attachmentFilename: `gsps-trade-journal-${dateLabel}.xlsx`,
    });

    if (result.success) sent++;
    else if (result.error?.startsWith("Resend sandbox sender")) sandboxBlocked.push(user.email);
    else failures.push(`${user.email}: ${result.error}`);
  }

  return NextResponse.json({
    date: dateLabel,
    usersChecked: users.length,
    sent,
    skipped,
    sandboxBlocked: sandboxBlocked.length,
    sandboxBlockedUsers: sandboxBlocked,
    failed: failures.length,
    failures,
  });
}
