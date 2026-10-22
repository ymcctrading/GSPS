/**
 * GSPS — /api/demo/open
 *
 * Opens a tier's practice account (lib/demo/practice.ts) in this browser:
 * the account is created on first use, then the server generates a one-time
 * sign-in link for it and redeems it at once, so the session cookies are set
 * here and no email is sent and no password is shared. The browser lands on
 * the dashboard, signed in as that practice account; any session it held
 * before is replaced, which `/practice` says before the button is pressed.
 *
 * POST only, from `/practice`'s form, so a link preview or crawler can't open
 * sessions, and only from this site (Origin, or Sec-Fetch-Site), so another
 * site can't swap a member's session for a practice one. Rate-limited per
 * address in the `credential` bucket.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ensurePracticeAccount, practiceTierFrom } from "@/lib/demo/practice";

/** True when the POST came from this site's own page. */
function sameOrigin(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  return origin !== null && origin === req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Open a practice account from /practice." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const practice = practiceTierFrom(String(form?.get("tier") ?? req.nextUrl.searchParams.get("tier") ?? ""));
  const back = new URL("/practice", req.url);
  if (!practice) {
    back.searchParams.set("error", "unknown-tier");
    return NextResponse.redirect(back, 303);
  }

  try {
    const service = createServiceClient();
    const { email } = await ensurePracticeAccount(service, practice);
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    // A link is one per account: a second visitor opening the same tier at the
    // same moment replaces this one's, so a failed redeem gets one fresh link.
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email });
      const tokenHash = link?.properties?.hashed_token;
      if (linkError || !tokenHash) throw new Error(linkError?.message ?? "no sign-in link");
      const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
      if (!verifyError) {
        lastError = "";
        break;
      }
      lastError = verifyError.message;
    }
    if (lastError) throw new Error(lastError);
  } catch (err) {
    console.error(`demo/open: ${practice.slug} — ${err instanceof Error ? err.message : String(err)}`);
    back.searchParams.set("error", "unavailable");
    return NextResponse.redirect(back, 303);
  }

  return NextResponse.redirect(new URL("/dashboard", req.url), 303);
}
