/**
 * GSPS — /api/admin/large-cap-universe-check
 *
 * One-off diagnostic for lib/scan/large-cap-universe.ts: reports which
 * committed symbols Alpaca does not carry as an active, tradable us_equity.
 * Exists because the list is transcribed from a third-party market-cap
 * export (see that file's header) and was never checked against what Alpaca
 * itself will actually return bars for — a symbol it can't resolve is a
 * wasted coarse-pass slot on every scan, forever.
 *
 * Browser-triggerable on purpose: the person who needs this doesn't
 * necessarily have a terminal, and the app's own ALPACA_API_KEY/SECRET env
 * vars already exist for live scanning, so there is nothing to configure —
 * just visit this path while signed in. Read-only (GET, no request body,
 * hits only /v2/assets), so a plain link is enough; gated on sign-in the
 * same way the manual market-scan refresh is, so it isn't a public,
 * unauthenticated way to spend the app's Alpaca quota.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { envCreds, listActiveUsEquityAssets } from "@/lib/brokers/alpaca";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const creds = envCreds("paper");
  if (!creds) {
    return NextResponse.json(
      { error: "ALPACA_API_KEY/ALPACA_API_SECRET are not configured on this deployment" },
      { status: 503 },
    );
  }

  let assets;
  try {
    assets = await listActiveUsEquityAssets(creds);
  } catch (err) {
    return NextResponse.json(
      { error: `Alpaca /v2/assets request failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const bySymbol = new Map(assets.map((a) => [a.symbol, a]));

  const missing: string[] = [];
  const notTradable: { symbol: string; status?: string; exchange?: string }[] = [];
  const ok: string[] = [];

  for (const symbol of LARGE_CAP_UNIVERSE) {
    const asset = bySymbol.get(symbol.toUpperCase());
    if (!asset) {
      missing.push(symbol);
    } else if (!asset.tradable) {
      notTradable.push({ symbol, status: asset.status, exchange: asset.exchange });
    } else {
      ok.push(symbol);
    }
  }

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    universeSize: LARGE_CAP_UNIVERSE.length,
    alpacaActiveAssetCount: assets.length,
    summary: { ok: ok.length, notTradable: notTradable.length, missing: missing.length },
    notTradable,
    missing,
  });
}
