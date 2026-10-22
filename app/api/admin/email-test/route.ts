/**
 * GSPS — /api/admin/email-test
 *
 * Sends one test email to each address in the body (`{"to": [...]}`, at most
 * three), so an operator can confirm the sender works end to end without
 * waiting for a real alert. Operator only: the same `Authorization: Bearer
 * CRON_SECRET` check as the scheduled routes and `../email-domain`. It sends
 * only to the addresses the operator names, never to members.
 */

import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sendTestEmail } from "@/lib/notifications/resend-handler";

const MAX_RECIPIENTS = 3;
const ADDRESS = /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/;

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { to?: unknown } | null;
  const to = Array.isArray(body?.to) ? body.to : [];
  if (
    to.length === 0 ||
    to.length > MAX_RECIPIENTS ||
    !to.every((t): t is string => typeof t === "string" && ADDRESS.test(t.trim()))
  ) {
    return NextResponse.json({ error: `Send {"to": [address, ...]}, 1 to ${MAX_RECIPIENTS} addresses` }, { status: 400 });
  }
  const results = [];
  for (const address of to) results.push({ to: address.trim(), ...(await sendTestEmail(address.trim())) });
  const ok = results.every((r) => r.success);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 502 });
}
