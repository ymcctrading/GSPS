/**
 * GSPS — /api/saved-setups
 * GET:  every saved setup for the signed-in user, newest first, each carrying
 *       its folder name.
 * POST: snapshot a ranked dashboard setup into a folder. Creates the user's
 *       default folder ("Saved setups") on first use if none is given.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const SaveSetupSchema = z.object({
  folderId: z.string().uuid().optional(),
  folderName: z.string().min(1).max(60).optional(),
  symbol: z.string().min(1).max(20),
  direction: z.enum(["bullish", "bearish"]),
  score: z.number().optional(),
  outputState: z.string().optional(),
  entry: z.number().nullable().optional(),
  stopLoss: z.number().nullable().optional(),
  takeProfit1: z.number().nullable().optional(),
  masterProfit: z.number().nullable().optional(),
  patternName: z.string().nullable().optional(),
  setupKind: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = SaveSetupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid setup data" }, { status: 400 });
  }
  const input = parsed.data;

  try {
    let folderId = input.folderId ?? null;

    if (folderId) {
      const { data: folder, error: folderErr } = await supabase
        .from("setup_folders")
        .select("id")
        .eq("id", folderId)
        .maybeSingle();
      if (folderErr) throw folderErr;
      if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    } else if (input.folderName) {
      const { data: created, error: createErr } = await supabase
        .from("setup_folders")
        .insert({ user_id: user.id, name: input.folderName })
        .select("id")
        .single();
      if (createErr) throw createErr;
      folderId = created.id;
    } else {
      const { data: existing, error: existingErr } = await supabase
        .from("setup_folders")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (existingErr) throw existingErr;
      if (existing) {
        folderId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("setup_folders")
          .insert({ user_id: user.id, name: "Saved setups" })
          .select("id")
          .single();
        if (createErr) throw createErr;
        folderId = created.id;
      }
    }

    const { data, error } = await supabase
      .from("saved_setups")
      .insert({
        folder_id: folderId,
        user_id: user.id,
        symbol: input.symbol.toUpperCase(),
        direction: input.direction,
        score: input.score ?? null,
        output_state: input.outputState ?? null,
        entry: input.entry ?? null,
        stop_loss: input.stopLoss ?? null,
        take_profit1: input.takeProfit1 ?? null,
        master_profit: input.masterProfit ?? null,
        pattern_name: input.patternName ?? null,
        setup_kind: input.setupKind ?? null,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, savedSetup: data });
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
      .from("saved_setups")
      .select("*, setup_folders(id, name)")
      .order("saved_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ savedSetups: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
