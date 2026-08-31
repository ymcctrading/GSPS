/**
 * GSPS — /api/alpaca/connect-live
 *
 * POST: store a user's own live Alpaca API key/secret, verified against
 * Alpaca's own `/v2/account` before anything is saved — a typo'd or
 * paper-only key fails here, not on the first real order.
 * DELETE: disable the connection. Soft (status='disabled', not a row
 * delete): every `orders`/`positions`/`protocol_exits` row already written
 * against it keeps a valid `connection_id` to join back to.
 *
 * This is the credential half of the seam `lib/trade/place-order.ts`'s
 * `mode: "live"` branch and `lib/risk/live-account.ts` were built against —
 * see their headers. Nothing before this route existed for a user to
 * actually reach either.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { encryptJson } from "@/lib/crypto";
import { getAccount, type AlpacaCreds } from "@/lib/brokers/alpaca";

const ConnectSchema = z.object({
  apiKey: z.string().min(1).max(200),
  apiSecret: z.string().min(1).max(200),
});

const LABEL = "Alpaca Live";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = ConnectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const creds: AlpacaCreds = { key: parsed.data.apiKey, secret: parsed.data.apiSecret, mode: "live" };

  let equity: number;
  try {
    const account = await getAccount(creds);
    equity = Number(account.equity);
  } catch (err) {
    return NextResponse.json(
      {
        error: `These keys couldn't be verified against Alpaca's live account API: ${
          err instanceof Error ? err.message : String(err)
        }`,
        code: "verification_failed",
      },
      { status: 422 },
    );
  }

  const { error } = await supabase.from("broker_connections").upsert(
    {
      user_id: user.id,
      provider: "alpaca_live",
      label: LABEL,
      status: "active",
      credentials: { enc: encryptJson({ key: creds.key, secret: creds.secret }) },
    },
    { onConflict: "user_id,provider,label" },
  );
  if (error) {
    return NextResponse.json({ error: `Connection couldn't be saved — ${error.message}` }, { status: 502 });
  }

  return NextResponse.json({ connected: true, equity });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { error } = await supabase
    .from("broker_connections")
    .update({ status: "disabled" })
    .eq("user_id", user.id)
    .eq("provider", "alpaca_live")
    .eq("label", LABEL);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json({ disconnected: true });
}
