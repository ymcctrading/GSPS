import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stopAutomationProfile } from "@/lib/automation/service";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { profileId } = await params;
  const result = await stopAutomationProfile(supabase, user.id, profileId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
