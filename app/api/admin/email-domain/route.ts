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
  const res = await fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function findDomain(name: string) {
  const list = await resend("/domains");
  const domains: { id: string; name: string }[] = list.body?.data ?? [];
  const match = domains.find((d) => d.name === name);
  return match ? match.id : null;
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
  const id = await findDomain(name);
  if (!id) return NextResponse.json({ error: `${name} is not in Resend` }, { status: 404 });
  const detail = await resend(`/domains/${id}`);
  return NextResponse.json(detail.body, { status: detail.status });
}

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const name = req.nextUrl.searchParams.get("domain") ?? "gsps.world";
  const id = await findDomain(name);
  if (!id) return NextResponse.json({ error: `${name} is not in Resend` }, { status: 404 });
  const verify = await resend(`/domains/${id}/verify`, { method: "POST" });
  return NextResponse.json(verify.body, { status: verify.status });
}
