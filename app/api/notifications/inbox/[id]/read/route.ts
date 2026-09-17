/**
 * GSPS — POST /api/notifications/inbox/[id]/read
 *
 * Marks one in-app notification read. `in_app_notifications` carries no
 * update policy in its RLS (read-only for the owner — see migration 0067's
 * own comment), so this goes through the service-role client after
 * verifying the caller's identity itself, same pattern every other
 * server-authoritative write in this codebase uses. The `.eq("profile_id",
 * user.id)` on the update is what actually enforces ownership here — the
 * service client bypasses RLS, so this line is not a redundant belt-and-
 * suspenders check, it is the only check.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("in_app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", user.id)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
