/**
 * GSPS — /api/notifications/preferences
 * GET: the signed-in user's notification preferences (creating sane defaults
 *      on first read) plus which channels are actually usable server-side —
 *      the settings UI uses `channelsEnabled` to show "not configured"
 *      rather than assuming every toggle works.
 * PUT: upsert the preferences row.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isEmailEnabled } from "@/lib/notifications/providers/email";
import { isSmsEnabled } from "@/lib/notifications/providers/sms";
import { isPushEnabled } from "@/lib/notifications/providers/push";

const TIME_OF_DAY = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

const PreferencesSchema = z.object({
  emailEnabled: z.boolean().default(false),
  smsEnabled: z.boolean().default(false),
  pushEnabled: z.boolean().default(false),
  quietHoursEnabled: z.boolean().default(false),
  quietHoursStart: TIME_OF_DAY.default("22:00"),
  quietHoursEnd: TIME_OF_DAY.default("07:00"),
  timezone: z.string().min(1).max(64).default("America/New_York"),
  phoneNumber: z.string().max(32).nullable().optional(),
  minScore: z.number().int().min(0).max(9).default(7),
});

function channelsEnabled() {
  return {
    email: isEmailEnabled(),
    sms: isSmsEnabled(),
    push: isPushEnabled(),
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not load preferences" }, { status: 500 });
  }

  return NextResponse.json({
    preferences: data ?? defaultPreferences(user.id),
    channelsEnabled: channelsEnabled(),
    // The VAPID public key is designed to be public (it's how the browser
    // verifies pushes came from this server) — safe to hand to the client so
    // it can call subscribeToPush() without needing its own env vars.
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid preferences" }, { status: 400 });
  }
  const p = parsed.data;

  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        user_id: user.id,
        email_enabled: p.emailEnabled,
        sms_enabled: p.smsEnabled,
        push_enabled: p.pushEnabled,
        quiet_hours_enabled: p.quietHoursEnabled,
        quiet_hours_start: p.quietHoursStart,
        quiet_hours_end: p.quietHoursEnd,
        timezone: p.timezone,
        phone_number: p.phoneNumber ?? null,
        min_score: p.minScore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not save preferences" }, { status: 500 });
  }

  return NextResponse.json({ preferences: data, channelsEnabled: channelsEnabled() });
}

function defaultPreferences(userId: string) {
  return {
    user_id: userId,
    email_enabled: false,
    sms_enabled: false,
    push_enabled: false,
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    timezone: "America/New_York",
    phone_number: null,
    push_subscription: null,
    min_score: 7,
    updated_at: null,
  };
}
