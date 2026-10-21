/**
 * GSPS — /api/auth/password-breach
 *
 * GET ?prefix=XXXXX → the Have I Been Pwned range for that five-character
 * SHA-1 prefix, as plain text ("SUFFIX:COUNT" per line, padded).
 *
 * Relays the k-anonymity lookup in `lib/auth/breached-password.ts` so the
 * visitor's browser talks only to GSPS. It receives a hash prefix, never a
 * password, and stores nothing. Public, since sign-up has no session.
 */

import { NextRequest, NextResponse } from "next/server";

const PREFIX = /^[0-9A-F]{5}$/;

export async function GET(req: NextRequest) {
  const prefix = (req.nextUrl.searchParams.get("prefix") ?? "").toUpperCase();
  if (!PREFIX.test(prefix)) {
    return NextResponse.json({ error: "prefix must be five hex characters" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "GSPS" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "breach lookup unavailable" }, { status: 502 });
    }
    return new NextResponse(await res.text(), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "breach lookup unavailable" }, { status: 502 });
  }
}
