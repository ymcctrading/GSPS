#!/usr/bin/env node
// Provisions (or re-marks) the showcase demo profile shown to investors,
// partners, teammates, and prospective users — see supabase/migrations/
// 0032_demo_showcase_profile.sql, lib/demo/reset.ts, and
// lib/demo/auto-trade.ts for what the flag this sets actually does
// (always-on tour, automated trading that compounds real profit).
//
// Usage (needs SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL, or
// the same defaults lib/supabase/server.ts falls back to):
//   DEMO_EMAIL=demo@yourdomain.com DEMO_PASSWORD='...' node scripts/create-demo-profile.mjs
//
// Safe to re-run: if the email already has an account, this just flips
// `is_demo` on for it instead of failing on a duplicate signup.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vebhpmmzxixlhujlptue.supabase.co";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const email = requireEnv("DEMO_EMAIL");
const password = requireEnv("DEMO_PASSWORD");
const displayName = process.env.DEMO_DISPLAY_NAME ?? "Demo";

const supabase = createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

async function findExistingUserByEmail(targetEmail) {
  // admin.listUsers is paginated; the demo account is a one-off so a linear
  // scan over a handful of pages is fine rather than reaching for a filter
  // API that doesn't exist on this SDK version.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  let userId = (await findExistingUserByEmail(email))?.id;

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created auth user ${userId} (${email})`);
  } else {
    // Keep the shared demo password in sync with whatever was passed in,
    // since it's handed out to prospective investors/partners and needs to
    // be easy to rotate.
    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
    console.log(`Found existing auth user ${userId} (${email}); password reset`);
  }

  // `handle_new_user()` (0001_initial_schema.sql) creates the profiles row on
  // signup; upsert here so this script is also correct for a pre-existing
  // account that predates the trigger, or one whose profile row was deleted.
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: userId, display_name: displayName, is_demo: true }, { onConflict: "id" });
  if (profileError) throw profileError;

  // Seed the starting balance only if this account has never had one — the
  // account's cash compounds with real trading from here on, so re-running
  // this script (to rotate the password, say) must never stomp on profit or
  // loss the auto-trader has already produced.
  const { data: existingAccount } = await supabase
    .from("paper_accounts")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!existingAccount) {
    const { error: accountError } = await supabase
      .from("paper_accounts")
      .insert({ user_id: userId, cash: 100000 });
    if (accountError) throw accountError;
  }

  console.log(`${email} is now the showcase demo profile (is_demo = true).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
