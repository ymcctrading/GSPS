/**
 * GSPS — /api/shared-watchlist/[token] (a viewer)
 *
 * GET  -> { access: "view", symbols, owner } when the viewer may open it, or
 *         { access: "sign_in" | "request" | "pending" | "denied" }.
 * POST -> ask the owner for access to a members-only list (signed in).
 *
 * A token that matches nothing, a share turned off, or a list gone back to
 * the default all answer the same 404, so a link reveals nothing once it is
 * withdrawn. See `lib/watchlist/share.ts`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readSharedList, requestShareAccess } from "@/lib/watchlist/shareServer";
import { isShareToken } from "@/lib/watchlist/share";

const GONE = { error: "This shared list isn't available. Its owner may have stopped sharing it." };

async function viewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) return NextResponse.json(GONE, { status: 404 });
  try {
    const read = await readSharedList(token, await viewer());
    if (!read) return NextResponse.json(GONE, { status: 404 });
    return NextResponse.json(read, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[shared-watchlist] read:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The list could not be read. Try again in a moment." }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) return NextResponse.json(GONE, { status: 404 });
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const result = await requestShareAccess(token, userId);
    if (result === "gone") return NextResponse.json(GONE, { status: 404 });
    if (result === "full") {
      return NextResponse.json({ error: "This list has as many requests as it can take." }, { status: 409 });
    }
    return NextResponse.json({ access: result });
  } catch (err) {
    console.error("[shared-watchlist] request:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The request could not be sent. Try again in a moment." }, { status: 500 });
  }
}
