/**
 * GSPS — /api/snaptrade/connect
 * Registers the user with SnapTrade (first time) and redirects to the hosted
 * connection portal where they link Webull/Robinhood/Schwab/etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isSnapTradeEnabled,
  registerSnapTradeUser,
  connectionPortalUrl,
} from "@/lib/brokers/snaptrade";
import { encryptJson, decryptJson } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  if (!isSnapTradeEnabled()) {
    return NextResponse.json(
      { error: "External brokerage linking is not enabled yet." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    // Reuse an existing SnapTrade registration or create one
    const { data: existing } = await supabase
      .from("broker_connections")
      .select("id, credentials")
      .eq("provider", "snaptrade")
      .maybeSingle();

    let userSecret: string;
    if (existing) {
      userSecret = decryptJson<{ userSecret: string }>(
        (existing.credentials as { enc: string }).enc,
      ).userSecret;
    } else {
      userSecret = await registerSnapTradeUser(user.id);
      const { error } = await supabase.from("broker_connections").insert({
        user_id: user.id,
        provider: "snaptrade",
        label: "SnapTrade",
        credentials: { enc: encryptJson({ userSecret }) },
      });
      if (error) throw new Error(`Failed to store connection: ${error.message}`);
    }

    const origin = new URL(req.url).origin;
    const portal = await connectionPortalUrl(user.id, userSecret, `${origin}/settings?linked=1`);
    return NextResponse.redirect(portal);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
