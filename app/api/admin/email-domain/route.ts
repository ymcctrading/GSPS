/**
 * GSPS — /api/admin/email-domain
 *
 * Reads the sending domain's DNS records from Resend (GET) and asks Resend to
 * verify it (POST), so the records can be read in full and checked without
 * the Resend dashboard, which shortens long values on screen. Operator only:
 * the same `Authorization: Bearer CRON_SECRET` check as the scheduled routes.
 * The domain is `?domain=`, default gsps.world. DKIM and SPF values are public
 * once published in DNS, so returning them reveals nothing secret; the API
 * key never leaves the server.
 */

import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";

const RESEND_API = "https://api.resend.com";

async function resend(path: string, init?: RequestInit) {
  try {
    const res = await fetch(`${RESEND_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    return { status: 504, body: { error: "Resend did not answer within 10 seconds" } };
  }
}

/** The domain's Resend id, or the response to return when it can't be found:
 *  Resend's own error (a revoked key, a rate limit) passes through rather than
 *  reading as a missing domain. */
async function findDomain(name: string): Promise<{ id: string } | { response: NextResponse }> {
  const list = await resend("/domains");
  if (list.status < 200 || list.status >= 300) {
    return { response: NextResponse.json(list.body, { status: list.status }) };
  }
  const domains: { id: string; name: string }[] = list.body?.data ?? [];
  const match = domains.find((d) => d.name === name);
  if (!match) return { response: NextResponse.json({ error: `${name} is not in Resend` }, { status: 404 }) };
  return { id: match.id };
}

async function guard(req: NextRequest) {
  if (!process.env.CRON_SECRET || !process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "CRON_SECRET or RESEND_API_KEY is not configured" }, { status: 503 });
  }
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const name = req.nextUrl.searchParams.get("domain") ?? "gsps.world";
  const found = await findDomain(name);
  if ("response" in found) return found.response;
  const detail = await resend(`/domains/${found.id}`);
  return NextResponse.json(detail.body, { status: detail.status });
}

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const name = req.nextUrl.searchParams.get("domain") ?? "gsps.world";
  const found = await findDomain(name);
  if ("response" in found) return found.response;
  const verify = await resend(`/domains/${found.id}/verify`, { method: "POST" });
  return NextResponse.json(verify.body, { status: verify.status });
}
