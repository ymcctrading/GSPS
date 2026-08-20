import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const requested = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;

  const { data, error } = await supabase
    .from("notification_log")
    .select("id, channel, source, symbols, subject, status, error, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}
