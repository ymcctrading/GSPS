/**
 * GSPS — /api/saved-setups/folders
 * GET:  the user's folders, oldest first (so the default folder sorts first).
 * POST: create a new folder.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(60),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from("setup_folders")
      .select("id, name, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ folders: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = CreateFolderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("setup_folders")
      .insert({ user_id: user.id, name: parsed.data.name })
      .select("id, name, created_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, folder: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
