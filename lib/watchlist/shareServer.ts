/**
 * The server half of shared watchlists: reading a shared list for a viewer and
 * filing a viewer's request, through the service role, only after
 * `viewerAccess` (lib/watchlist/share.ts) has allowed it. Server-only: it
 * reads the service key.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { getDashboardWatchlist } from "@/lib/dashboard/watchlist";
import { SHARE_MEMBER_LIMIT, viewerAccess, type MemberStatus, type ShareAccess } from "@/lib/watchlist/share";

interface Share {
  id: string;
  user_id: string;
  access: ShareAccess;
}

export type SharedListRead =
  | { access: "view"; owner: boolean; symbols: string[] }
  | { access: "sign_in" | "request" | "pending" | "denied" };

async function findShare(service: SupabaseClient, token: string): Promise<Share | null> {
  const { data, error } = await service.from("watchlist_shares").select("id, user_id, access").eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Share | null) ?? null;
}

async function memberStatus(service: SupabaseClient, shareId: string, memberId: string): Promise<MemberStatus | null> {
  const { data, error } = await service
    .from("watchlist_share_members")
    .select("status")
    .eq("share_id", shareId)
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return ((data as { status: MemberStatus } | null)?.status as MemberStatus | undefined) ?? null;
}

/** The shared list as this viewer may see it, or null when the link leads nowhere. */
export async function readSharedList(
  token: string,
  viewerId: string | null,
  service: SupabaseClient = createServiceClient(),
): Promise<SharedListRead | null> {
  const share = await findShare(service, token);
  if (!share) return null;
  // A list gone back to the platform default is no longer the member's.
  const list = await getDashboardWatchlist(service, share.user_id);
  if (list.isDefault) return null;

  const status =
    viewerId && viewerId !== share.user_id && share.access === "members" ? await memberStatus(service, share.id, viewerId) : null;
  const access = viewerAccess({ access: share.access, ownerId: share.user_id }, viewerId, status);
  if (access.kind === "view") return { access: "view", owner: access.owner, symbols: list.symbols };
  return { access: access.kind };
}

/**
 * File a signed-in viewer's request. Answers what the viewer may now do, or
 * "gone" (no such share) or "full" (the share holds `SHARE_MEMBER_LIMIT`).
 */
export async function requestShareAccess(
  token: string,
  userId: string,
  service: SupabaseClient = createServiceClient(),
): Promise<"view" | "pending" | "denied" | "gone" | "full"> {
  const share = await findShare(service, token);
  if (!share) return "gone";
  const list = await getDashboardWatchlist(service, share.user_id);
  if (list.isDefault) return "gone";
  if (share.access === "link" || share.user_id === userId) return "view";

  const existing = await memberStatus(service, share.id, userId);
  if (existing === "approved") return "view";
  if (existing) return existing;

  const { count, error: countError } = await service
    .from("watchlist_share_members")
    .select("member_id", { count: "exact", head: true })
    .eq("share_id", share.id)
    .in("status", ["pending", "approved"]);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= SHARE_MEMBER_LIMIT) return "full";

  const { error } = await service
    .from("watchlist_share_members")
    .upsert({ share_id: share.id, member_id: userId, status: "pending" }, { onConflict: "share_id,member_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return "pending";
}
