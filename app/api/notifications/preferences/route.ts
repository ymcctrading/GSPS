import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabase = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found (expected for first-time users)
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return empty preferences if none exist yet
    return NextResponse.json(
      data || {
        user_id: user.id,
        email_enabled: false,
        sms_enabled: false,
        push_enabled: false,
        min_score: 5,
        notify_on_verdict: "execute",
        quiet_hours_enabled: false,
        user_timezone: "America/New_York",
        entry_lead_minutes: 15,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** The settings a member may save (`notification_preferences`, 0022 and 0125). */
const PREFERENCE_FIELDS = [
  "email_enabled",
  "sms_enabled",
  "push_enabled",
  "min_score",
  "notify_on_verdict",
  "quiet_hours_enabled",
  "quiet_start",
  "quiet_end",
  "user_timezone",
  "phone_number",
  "entry_lead_minutes",
] as const;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabase = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, unknown>;

    // Only the member's own settings, and always under their own id: the
    // service client bypasses row security, so a `user_id` in the body must
    // never reach the upsert (review, 2026-10-28).
    const row: Record<string, unknown> = {};
    for (const key of PREFERENCE_FIELDS) if (key in body) row[key] = body[key];
    const upsert = (values: Record<string, unknown>) =>
      supabase
        .from("notification_preferences")
        .upsert({ ...values, user_id: user.id }, { onConflict: "user_id" })
        .select()
        .single();

    let { data, error } = await upsert(row);
    // Until migration 0125 is applied the lead column does not exist; the
    // rest of the settings still save.
    if (
      error &&
      "entry_lead_minutes" in row &&
      (error.code === "PGRST204" || /could not find the 'entry_lead_minutes' column/i.test(error.message ?? ""))
    ) {
      const { entry_lead_minutes: _lead, ...rest } = row;
      void _lead;
      ({ data, error } = await upsert(rest));
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
