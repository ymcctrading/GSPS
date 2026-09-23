#!/usr/bin/env node
// Emergency-stop counterpart to scripts/record-autonomous-live-signoff.mjs:
// revokes the active compliance sign-off for the Automated Portfolio
// Manager's autonomous live-trading path. lib/compliance/signoff.ts's
// isFeatureAuthorized() checks `revoked_at is null`, so this alone puts the
// loop's live path back to refused — no code change, no redeploy needed.
//
// The row is never deleted (see 0059_compliance_signoffs.sql's own
// comment): revoking keeps the fact that authorization once existed and was
// later pulled, which matters for reconstructing what was authorized and
// when during an incident review.
//
// Usage:
//   node scripts/revoke-autonomous-live-signoff.mjs \
//     --revoked-by "Your Name, Role/Title" \
//     --reason "Why you're pulling this"
//
// Needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
// SUPABASE_SERVICE_ROLE_KEY in the environment.

import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--revoked-by") out.revokedBy = argv[++i];
    else if (arg === "--reason") out.reason = argv[++i];
  }
  return out;
}

async function main() {
  const { revokedBy, reason } = parseArgs(process.argv.slice(2));
  if (!revokedBy || !reason) {
    console.error(
      'Usage: node scripts/revoke-autonomous-live-signoff.mjs --revoked-by "Your Name, Role" --reason "..."',
    );
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("compliance_signoffs")
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy, revoked_reason: reason })
    .eq("feature", "autonomous_live_trading")
    .is("revoked_at", null)
    .select("id");
  if (error) {
    console.error(`Revoke failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (!data || data.length === 0) {
    console.log("No active sign-off found for \"autonomous_live_trading\" — nothing to revoke.");
    return;
  }

  console.log(`Revoked ${data.length} active sign-off(s) for "autonomous_live_trading".`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
