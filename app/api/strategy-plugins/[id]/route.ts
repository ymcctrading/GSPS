/**
 * GSPS — /api/strategy-plugins/[id]
 *
 * One custom-script Strategy Mode: read (with its version history), edit
 * (`source`/`name`/`active`), or delete. See `../route.ts`'s header for the
 * full context — same gating (Wall Street tier,
 * `isCustomScriptAuthoringAllowedForPolicy`), same private-to-author scoping
 * (every query filtered to `user_id = auth user`, independently enforced by
 * RLS), same compile-before-persist rule for any `source` edit.
 *
 * Editing `source` bumps `version` and appends a new row to
 * `strategy_plugin_versions` rather than overwriting history — this is what
 * makes the registry's "versioned so a script's own history is auditable"
 * property real rather than a comment (AGENTS.md's orphan-module audit
 * outcome 5/8's "can never drift" lesson: a claim like that needs an actual
 * enforcement path). Editing `name`/`active` alone does not bump the
 * version — those aren't the script's logic.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { isCustomScriptAuthoringAllowedForPolicy } from "@/lib/strategies/access";
import { compileCustomScript } from "@/lib/strategies/custom/compile";
import { MAX_SOURCE_LENGTH } from "@/lib/strategies/custom/limits";

const UpdatePluginSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    source: z.string().min(1).max(MAX_SOURCE_LENGTH).optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => body.name !== undefined || body.source !== undefined || body.active !== undefined, {
    message: "At least one of 'name', 'source', or 'active' is required",
  });

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const { data: plugin, error } = await supabase
    .from("strategy_plugins")
    .select("id, name, author, source, version, active, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!plugin) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const { data: versions, error: versionsError } = await supabase
    .from("strategy_plugin_versions")
    .select("version, source, created_at")
    .eq("plugin_id", id)
    .order("version", { ascending: false });
  if (versionsError) {
    return NextResponse.json({ error: versionsError.message }, { status: 500 });
  }

  const compiled = compileCustomScript(plugin.source, {
    scriptId: plugin.id,
    scriptName: plugin.name,
    author: plugin.author,
    version: plugin.version,
  });

  return NextResponse.json({
    plugin,
    versions: versions ?? [],
    compiles: compiled.ok,
    compileErrors: compiled.errors,
  });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const policy = await getUserEntitlementPolicy(supabase, user.id);
  if (!isCustomScriptAuthoringAllowedForPolicy(policy)) {
    return NextResponse.json(
      { error: "Your plan doesn't include custom-script authoring." },
      { status: 403 },
    );
  }

  const parsed = UpdatePluginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, source, active } = parsed.data;

  const { id } = await params;
  const { data: existing, error: fetchError } = await supabase
    .from("strategy_plugins")
    .select("id, name, author, source, version")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) update.name = name;
  if (active !== undefined) update.active = active;

  const sourceChanged = source !== undefined && source !== existing.source;
  if (sourceChanged) {
    const compiled = compileCustomScript(source, {
      scriptId: existing.id,
      scriptName: name ?? existing.name,
      author: existing.author,
      version: existing.version + 1,
    });
    if (!compiled.ok) {
      return NextResponse.json({ error: "Script failed to compile", details: compiled.errors }, { status: 400 });
    }
    update.source = source;
    update.version = existing.version + 1;
  }

  const { data: plugin, error: updateError } = await supabase
    .from("strategy_plugins")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, author, version, active, created_at, updated_at")
    .single();
  if (updateError) {
    if (updateError.code === "23505") {
      return NextResponse.json({ error: `You already have a script named '${name}'.` }, { status: 409 });
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (sourceChanged) {
    const { error: versionError } = await supabase
      .from("strategy_plugin_versions")
      .insert({ plugin_id: id, version: plugin.version, source });
    if (versionError) {
      return NextResponse.json({ error: versionError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ plugin });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const { error, count } = await supabase
    .from("strategy_plugins")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
