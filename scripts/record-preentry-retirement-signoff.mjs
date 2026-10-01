#!/usr/bin/env node
// Records the compliance sign-off that switches on pre-entry plan retirement
// (lib/lifecycle/retire.ts, feature "preentry_plan_retirement").
//
// Until a row exists the transition is dormant: the scan still retires a broken
// plan (monitors, lists, chart, ticket), but no stored `trade_plans` row is
// moved to INVALIDATED. The spec pack behind lib/lifecycle/ defines INVALIDATED
// for open positions only and requires securities/compliance counsel review
// before the lifecycle changes, so this is the human, out-of-band act that
// records that the review happened. Nothing in the codebase calls this script
// (see lib/compliance/signoff.ts: "an AI coding agent can build the controls a
// review requires, but cannot grant the review"). Run it yourself, once, after
// you have actually made the decision it records.
//
// Usage:
//   node scripts/record-preentry-retirement-signoff.mjs \
//     --approved-by "Your Name, Role/Title" \
//     --review-reference "what was reviewed, and when" \
//     [--notes "Optional free-text context"]
//
// Needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
// To switch it off again, call revokeSignoff(supabase, "preentry_plan_retirement",
// ...) from lib/compliance/signoff.ts: a sign-off is revoked, never deleted.

import { createClient } from "@supabase/supabase-js";

const FEATURE = "preentry_plan_retirement";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--approved-by") out.approvedBy = argv[++i];
    else if (arg === "--review-reference") out.reviewReference = argv[++i];
    else if (arg === "--notes") out.notes = argv[++i];
  }
  return out;
}

async function main() {
  const { approvedBy, reviewReference, notes } = parseArgs(process.argv.slice(2));
  if (!approvedBy || !reviewReference) {
    console.error(
      "Usage: node scripts/record-preentry-retirement-signoff.mjs " +
        '--approved-by "Your Name, Role" --review-reference "what you reviewed" [--notes "..."]',
    );
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? requireEnv("SUPABASE_URL");
  const supabase = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: existing, error: checkError } = await supabase
    .from("compliance_signoffs")
    .select("id, approved_by, approved_at")
    .eq("feature", FEATURE)
    .is("revoked_at", null)
    .maybeSingle();
  if (checkError) {
    console.error(`Could not check for an existing sign-off: ${checkError.message}`);
    process.exitCode = 1;
    return;
  }
  if (existing) {
    console.log(
      `An active sign-off already exists (id=${existing.id}, approved by "${existing.approved_by}" ` +
        `at ${existing.approved_at}). Revoke it first if you mean to replace it.`,
    );
    return;
  }

  const { error } = await supabase.from("compliance_signoffs").insert({
    feature: FEATURE,
    approved_by: approvedBy,
    review_reference: reviewReference,
    notes: notes ?? null,
  });
  if (error) {
    console.error(`Sign-off not recorded: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Recorded: "${FEATURE}" authorized by "${approvedBy}", reference "${reviewReference}".`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
