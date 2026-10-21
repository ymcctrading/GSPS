import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { parseSubscription, sendPushToProfile, vapidConfig } from "@/lib/notifications/web-push";

/**
 * Browser push subscriptions for the signed-in member (lib/notifications/web-push.ts).
 *
 * GET    — whether push is configured, the public key to subscribe with, and
 *          how many browsers this account has subscribed.
 * POST   — `{ subscription: PushSubscriptionJSON }` saves this browser and turns
 *          `push_enabled` on; `{ test: true }` sends a test push instead.
 * DELETE — `{ endpoint }` removes this browser; push_enabled goes off when no
 *          browser is left.
 *
 * Writes run on the service role and always name the session's own user, so
 * a member can't file or remove another account's subscription (migration 0098).
 */

async function sessionUser(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const {
    data: { user },
    error,
  } = await createServiceClient().auth.getUser(authHeader.slice(7));
  return error ? null : user;
}

export async function GET(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = vapidConfig();
  const { count } = await createServiceClient()
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id);
  return NextResponse.json({
    configured: config !== null,
    publicKey: config?.publicKey ?? null,
    subscriptions: count ?? 0,
  });
}

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { subscription?: unknown; test?: unknown };
  const service = createServiceClient();

  if (body.test === true) {
    const result = await sendPushToProfile(service, user.id, {
      title: "GSPS test notification",
      body: "Browser push is working on this device.",
      url: "/settings",
      tag: "gsps-test",
    });
    return result.success
      ? NextResponse.json({ success: true, message: `Sent to ${result.sent} browser${result.sent === 1 ? "" : "s"}.` })
      : NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  if (!vapidConfig()) {
    return NextResponse.json({ error: "Browser push is not configured on this deployment yet." }, { status: 503 });
  }
  const sub = parseSubscription(body.subscription);
  if (!sub) return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });

  const { error } = await service.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: prefError } = await service
    .from("notification_preferences")
    .upsert({ user_id: user.id, push_enabled: true }, { onConflict: "user_id" });
  if (prefError) return NextResponse.json({ error: prefError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
  const service = createServiceClient();

  if (typeof body.endpoint === "string") {
    await service.from("push_subscriptions").delete().eq("profile_id", user.id).eq("endpoint", body.endpoint);
  }
  const { count } = await service
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id);
  if ((count ?? 0) === 0) {
    await service
      .from("notification_preferences")
      .upsert({ user_id: user.id, push_enabled: false }, { onConflict: "user_id" });
  }
  return NextResponse.json({ success: true, subscriptions: count ?? 0 });
}
