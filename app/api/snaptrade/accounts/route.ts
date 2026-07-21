/**
 * GSPS — /api/snaptrade/accounts
 * Lists the user's linked external brokerage accounts (and balances).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSnapTradeEnabled, listAccounts } from "@/lib/brokers/snaptrade";
import { decryptJson } from "@/lib/crypto";

export async function GET() {
  if (!isSnapTradeEnabled()) {
    return NextResponse.json({ enabled: false, accounts: [] });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: conn } = await supabase
    .from("broker_connections")
    .select("credentials")
    .eq("provider", "snaptrade")
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ enabled: true, accounts: [] });
  }

  try {
    const { userSecret } = decryptJson<{ userSecret: string }>(
      (conn.credentials as { enc: string }).enc,
    );
    const accounts = await listAccounts(user.id, userSecret);
    return NextResponse.json({
      enabled: true,
      accounts: (accounts as any[]).map((a) => ({
        id: a.id,
        name: a.name,
        institution: a.institution_name,
        balance: a.balance?.total?.amount ?? null,
        currency: a.balance?.total?.currency ?? "USD",
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
