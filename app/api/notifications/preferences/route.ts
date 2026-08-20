import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPreferences, savePreferences, type PreferencesUpdate } from "@/lib/notifications";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const prefs = await loadPreferences(supabase, user.id);
  return NextResponse.json({
    preferences: prefs ?? {
      userId: user.id,
      email: user.email ?? null,
      phoneNumber: null,
      emailEnabled: true,
      smsEnabled: false,
      dailyScanEnabled: true,
      intradayAlertEnabled: true,
      minScore: 7,
      quietHoursStart: null,
      quietHoursEnd: null,
      timezone: "America/New_York",
    },
  });
}

const MIN_SCORE_RANGE = { min: 0, max: 9 };
const MINUTES_RANGE = { min: 0, max: 1439 };

function inRange(value: unknown, range: { min: number; max: number }): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= range.min && value <= range.max;
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: PreferencesUpdate = {};
  if (typeof body.email === "string" || body.email === null) update.email = body.email;
  if (typeof body.phoneNumber === "string" || body.phoneNumber === null) update.phoneNumber = body.phoneNumber;
  if (typeof body.emailEnabled === "boolean") update.emailEnabled = body.emailEnabled;
  if (typeof body.smsEnabled === "boolean") update.smsEnabled = body.smsEnabled;
  if (typeof body.dailyScanEnabled === "boolean") update.dailyScanEnabled = body.dailyScanEnabled;
  if (typeof body.intradayAlertEnabled === "boolean") update.intradayAlertEnabled = body.intradayAlertEnabled;
  if (body.minScore !== undefined) {
    if (!inRange(body.minScore, MIN_SCORE_RANGE)) {
      return NextResponse.json({ error: "minScore must be between 0 and 9" }, { status: 400 });
    }
    update.minScore = body.minScore;
  }
  if (body.quietHoursStart !== undefined) {
    if (body.quietHoursStart !== null && !inRange(body.quietHoursStart, MINUTES_RANGE)) {
      return NextResponse.json({ error: "quietHoursStart must be between 0 and 1439" }, { status: 400 });
    }
    update.quietHoursStart = body.quietHoursStart as number | null;
  }
  if (body.quietHoursEnd !== undefined) {
    if (body.quietHoursEnd !== null && !inRange(body.quietHoursEnd, MINUTES_RANGE)) {
      return NextResponse.json({ error: "quietHoursEnd must be between 0 and 1439" }, { status: 400 });
    }
    update.quietHoursEnd = body.quietHoursEnd as number | null;
  }
  if (typeof body.timezone === "string") update.timezone = body.timezone;

  // First save with no email specified defaults to the account's own email —
  // SMS has no such default since we don't collect a phone number at signup.
  if (update.email === undefined) {
    const existing = await loadPreferences(supabase, user.id);
    if (!existing) update.email = user.email ?? null;
  }

  const result = await savePreferences(supabase, user.id, update);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
