#!/usr/bin/env node
// Records a compliance sign-off for the Automated Portfolio Manager's
// autonomous live-trading path (lib/automation/portfolio-manager.ts).
//
// This script exists so a human can run the recording step by hand, exactly
// as lib/compliance/signoff.ts and supabase/migrations/0059_compliance_
// signoffs.sql's own comments require: "an AI coding agent can build the
// controls a review requires... but cannot grant the review." Nothing in
// this codebase calls this script automatically — no deploy step, no cron,
// no UI action. You run it yourself, once, after you've actually made the
// decision it records.
//
// Usage:
//   node scripts/record-autonomous-live-signoff.mjs \
//     --approved-by "Your Name, Role/Title" \
//     --review-reference "docs/AUTOMATED_PORTFOLIO_MANAGER_LIVE_REVIEW.md, reviewed 2026-09-23" \
//     [--notes "Optional free-text context"]
//
// Needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
// SUPABASE_SERVICE_ROLE_KEY in the environment, same as
// scripts/rotate-credentials-key.mjs.
//
// This alone does not activate the loop's live path — the loop also checks
// AUTONOMOUS_LIVE_TRADING_HALTED (an env var, defaults to halted, set
// separately on the deployment). Both gates must clear independently; see
// docs/AUTOMATED_PORTFOLIO_MANAGER_LIVE_REVIEW.md for the full picture.
//
// To undo a sign-off later, use scripts/revoke-autonomous-live-signoff.mjs
// (or call lib/compliance/signoff.ts's revokeSignoff directly) — this
// script only ever adds a row, per the ledger's own "revoked, never
// deleted" design.

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
      "Usage: node scripts/record-autonomous-live-signoff.mjs " +
        '--approved-by "Your Name, Role" --review-reference "what you reviewed" [--notes "..."]',
    );
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: existing, error: checkError } = await supabase
    .from("compliance_signoffs")
    .select("id, approved_by, approved_at")
    .eq("feature", "autonomous_live_trading")
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
    feature: "autonomous_live_trading",
    approved_by: approvedBy,
    review_reference: reviewReference,
    notes: notes ?? null,
  });
  if (error) {
    console.error(`Sign-off not recorded: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Recorded: "autonomous_live_trading" authorized by "${approvedBy}", reference "${reviewReference}".`,
  );
  console.log(
    "Reminder: the loop also requires AUTONOMOUS_LIVE_TRADING_HALTED=false on the deployment — " +
      "this sign-off alone does not enable it.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
