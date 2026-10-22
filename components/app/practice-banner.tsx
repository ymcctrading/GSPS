import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { practiceTierFrom } from "@/lib/demo/practice";

/**
 * The strip across every signed-in page while a practice account is open
 * (lib/demo/practice.ts): which tier it previews, that it is paper money
 * traded by GSPS's own signals, and the ways out, to another tier or to an
 * account of one's own. Nothing renders for a member.
 *
 * Reads the tier from the session's access token (`app_metadata.practice_tier`)
 * without a request, so a member's page load costs nothing extra. The token is
 * not verified here: this only decides whether to show a label, and the proxy
 * enforces the practice session's limits from the verified user.
 */
export async function PracticeBanner() {
  let tier = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getSession();
    const payload = data.session?.access_token.split(".")[1];
    const claims = payload ? (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { app_metadata?: { practice_tier?: unknown } }) : null;
    const raw = claims?.app_metadata?.practice_tier;
    tier = typeof raw === "string" ? practiceTierFrom(raw) : null;
  } catch {
    tier = null;
  }
  if (!tier) return null;
  return (
    <div role="status" className="border-b border-border bg-accent/10 px-3 py-2 text-center text-sm">
      <span className="font-medium">{tier.label} practice account.</span> Paper money, traded by GSPS on its own
      signals; look-only, so orders and settings are off.{" "}
      <Link href="/practice" className="font-medium text-accent hover:underline">
        Preview another tier
      </Link>{" "}
      or{" "}
      <Link href="/signup" className="font-medium text-accent hover:underline">
        create your own account
      </Link>
      .
    </div>
  );
}
