/**
 * GSPS — /api/watchlist-share (the list's owner)
 *
 * GET   -> { available, share: { access, token } | null, members: [...] }
 * PUT   -> { access: "off" | "link" | "members", rotate?: boolean }: turn the
 *          share off, on, change who may open it, or issue a new link (the
 *          old one stops working at once).
 * PATCH -> { memberId, decision: "approve" | "deny" | "remove" } on a request.
 *
 * Shares the owner's Dashboard list (`lib/dashboard/watchlist.ts`) and only a
 * saved one: the platform default is GSPS's, not the member's. See
 * `lib/watchlist/share.ts` for what is shared and why.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DASHBOARD_WATCHLIST_NAME, getDashboardWatchlist } from "@/lib/dashboard/watchlist";
import { newShareToken, requesterLabel, type MemberStatus, type ShareAccess } from "@/lib/watchlist/share";

const PutSchema = z.object({ access: z.enum(["off", "link", "members"]), rotate: z.boolean().optional() });
const PatchSchema = z.object({ memberId: z.string().uuid(), decision: z.enum(["approve", "deny", "remove"]) });

type Client = Awaited<ReturnType<typeof createClient>>;

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function dashboardListId(supabase: Client, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("watchlists")
    .select("id")
    .eq("user_id", userId)
    .eq("name", DASHBOARD_WATCHLIST_NAME)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string } | null)?.id ?? null;
}

interface ShareRow {
  id: string;
  access: ShareAccess;
  token: string;
}

async function readShare(supabase: Client, userId: string, listId: string): Promise<ShareRow | null> {
  const { data, error } = await supabase
    .from("watchlist_shares")
    .select("id, access, token")
    .eq("user_id", userId)
    .eq("watchlist_id", listId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ShareRow | null) ?? null;
}

async function readMembers(supabase: Client, shareId: string) {
  const { data, error } = await supabase
    .from("watchlist_share_members")
    .select("member_id, status, requested_at, decided_at")
    .eq("share_id", shareId)
    .order("requested_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { member_id: string; status: MemberStatus; requested_at: string; decided_at: string | null }[];
  if (!rows.length) return [];
  // A requester's name or email is not the owner's to read under row
  // security; the server reads it to show the masked label only.
  const service = createServiceClient();
  const { data: profiles } = await service.from("profiles").select("id, display_name").in("id", rows.map((r) => r.member_id));
  const names = new Map(((profiles ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name]));
  return Promise.all(
    rows.map(async (r) => {
      let email: string | null = null;
      if (!names.get(r.member_id)?.trim()) {
        const { data: u } = await service.auth.admin.getUserById(r.member_id);
        email = u?.user?.email ?? null;
      }
      return {
        memberId: r.member_id,
        label: requesterLabel(names.get(r.member_id), email),
        status: r.status,
        requestedAt: r.requested_at,
        decidedAt: r.decided_at,
      };
    }),
  );
}

function fail(where: string, err: unknown) {
  console.error(`[watchlist-share] ${where}:`, err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "The share could not be read or changed. Try again in a moment." }, { status: 500 });
}

export async function GET() {
  const { supabase, user } = await signedIn();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const list = await getDashboardWatchlist(supabase, user.id);
    const listId = await dashboardListId(supabase, user.id);
    const share = listId ? await readShare(supabase, user.id, listId) : null;
    return NextResponse.json({
      available: !list.isDefault && listId != null,
      share: share ? { access: share.access, token: share.token } : null,
      members: share && share.access === "members" ? await readMembers(supabase, share.id) : [],
    });
  } catch (err) {
    return fail("read", err);
  }
}

export async function PUT(req: NextRequest) {
  const { supabase, user } = await signedIn();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { access, rotate } = parsed.data;

  try {
    const listId = await dashboardListId(supabase, user.id);
    const share = listId ? await readShare(supabase, user.id, listId) : null;

    if (access === "off") {
      if (share) {
        const { error } = await supabase.from("watchlist_shares").delete().eq("id", share.id).eq("user_id", user.id);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ share: null, members: [] });
    }

    const list = await getDashboardWatchlist(supabase, user.id);
    if (!listId || list.isDefault) {
      return NextResponse.json({ error: "Save your own list first: the default list isn't yours to share." }, { status: 409 });
    }

    const now = new Date().toISOString();
    if (!share) {
      const token = newShareToken();
      const { error } = await supabase
        .from("watchlist_shares")
        .insert({ watchlist_id: listId, user_id: user.id, token, access, updated_at: now });
      if (error) throw new Error(error.message);
      return NextResponse.json({ share: { access, token }, members: [] });
    }

    const token = rotate ? newShareToken() : share.token;
    const { error } = await supabase
      .from("watchlist_shares")
      .update({ access, token, updated_at: now })
      .eq("id", share.id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({
      share: { access, token },
      members: access === "members" ? await readMembers(supabase, share.id) : [],
    });
  } catch (err) {
    return fail("change", err);
  }
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await signedIn();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { memberId, decision } = parsed.data;

  try {
    const listId = await dashboardListId(supabase, user.id);
    const share = listId ? await readShare(supabase, user.id, listId) : null;
    if (!share) return NextResponse.json({ error: "Not shared" }, { status: 404 });

    const rows = supabase.from("watchlist_share_members");
    const { error } =
      decision === "remove"
        ? await rows.delete().eq("share_id", share.id).eq("member_id", memberId)
        : await rows
            .update({ status: decision === "approve" ? "approved" : "denied", decided_at: new Date().toISOString() })
            .eq("share_id", share.id)
            .eq("member_id", memberId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ members: await readMembers(supabase, share.id) });
  } catch (err) {
    return fail("decide", err);
  }
}
