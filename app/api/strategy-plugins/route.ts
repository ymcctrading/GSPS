/**
 * GSPS — /api/strategy-plugins
 *
 * CRUD for custom-script Strategy Modes (`lib/strategies/custom/`,
 * `docs/STRATEGY_MODES.md`'s "Custom-script / plugin system" section;
 * AGENTS.md's "Strategy Modes" section). Phase 2 of that design: the plugin
 * registry (`supabase/migrations/0080_strategy_plugins.sql`) and this CRUD
 * API. Never wired into scanning, scoring, `SignalGates`, or Automation — a
 * saved script exists only to be compiled and evaluated on demand by a
 * future chart hook (Phase 3, not built here).
 *
 * Gated to Wall Street tier only
 * (`lib/entitlements/policy.ts#customScriptAuthoringEnabled`, checked via
 * `lib/strategies/access.ts#isCustomScriptAuthoringAllowedForPolicy`),
 * resolved server-side on every read and write — no client component
 * computes its own idea of who may author a script (hard rule 6). Private
 * to the authoring user in v1: every query is scoped to `user_id = auth
 * user`, and RLS enforces the same boundary independently.
 *
 * `GET` lists the signed-in user's own scripts. `POST` creates a new one —
 * `source` is compiled through `compileCustomScript` before it is ever
 * persisted, so an invalid script is rejected with a 400 and the parser's
 * own error message, never stored half-valid.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { isCustomScriptAuthoringAllowedForPolicy } from "@/lib/strategies/access";
import { compileCustomScript } from "@/lib/strategies/custom/compile";
import { MAX_SOURCE_LENGTH } from "@/lib/strategies/custom/limits";

const CreatePluginSchema = z.object({
  name: z.string().trim().min(1).max(100),
  source: z.string().min(1).max(MAX_SOURCE_LENGTH),
});

async function resolveAuthorName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  email: string | null | undefined,
): Promise<string> {
  const { data } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
  const username = (data as { username: string | null } | null)?.username;
  if (username) return username;
  if (email) return email.split("@")[0];
  return "Anonymous";
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
    .from("strategy_plugins")
    .select("id, name, author, version, active, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // An empty `plugins` list is ambiguous on its own (no scripts yet vs. a
  // tier that can't author them) — `authoringEnabled` disambiguates for any
  // UI (e.g. the settings scripts manager) that needs to decide whether to
  // even offer script authoring, without duplicating the tier check
  // client-side.
  const policy = await getUserEntitlementPolicy(supabase, user.id);
  return NextResponse.json({
    plugins: data ?? [],
    authoringEnabled: isCustomScriptAuthoringAllowedForPolicy(policy),
  });
}

export async function POST(req: NextRequest) {
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

  const parsed = CreatePluginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, source } = parsed.data;

  const author = await resolveAuthorName(supabase, user.id, user.email);
  const compiled = compileCustomScript(source, { scriptId: "pending", scriptName: name, author, version: 1 });
  if (!compiled.ok) {
    return NextResponse.json({ error: "Script failed to compile", details: compiled.errors }, { status: 400 });
  }

  const { data: plugin, error: insertError } = await supabase
    .from("strategy_plugins")
    .insert({ user_id: user.id, name, author, source, version: 1, active: true })
    .select("id, name, author, version, active, created_at, updated_at")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: `You already have a script named '${name}'.` }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: versionError } = await supabase
    .from("strategy_plugin_versions")
    .insert({ plugin_id: plugin.id, version: 1, source });
  if (versionError) {
    return NextResponse.json({ error: versionError.message }, { status: 500 });
  }

  return NextResponse.json({ plugin }, { status: 201 });
}
