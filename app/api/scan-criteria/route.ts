/**
 * GSPS — /api/scan-criteria
 * GET:  every saved scan-criteria preset for the signed-in user, newest first.
 * POST: save the current Universe-tab search (selected industries + custom
 *       symbols) under a name, so it can be reloaded and re-run later.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SECTORS } from "@/lib/sectors";

const SaveCriteriaSchema = z.object({
  name: z.string().min(1).max(60),
  sectorKeys: z.array(z.string()).max(50).default([]),
  customSymbols: z.string().max(2000).default(""),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = SaveCriteriaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid scan criteria" }, { status: 400 });
  }
  const input = parsed.data;

  const sectorKeys = input.sectorKeys.filter((key) => key in SECTORS);
  if (sectorKeys.length === 0 && input.customSymbols.trim() === "") {
    return NextResponse.json(
      { error: "Pick at least one industry or enter a symbol before saving." },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await supabase
      .from("scan_criteria_presets")
      .insert({
        user_id: user.id,
        name: input.name,
        sector_keys: sectorKeys,
        custom_symbols: input.customSymbols,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, preset: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

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
      .from("scan_criteria_presets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ presets: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
