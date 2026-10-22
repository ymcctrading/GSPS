/**
 * GSPS — practice accounts, one per tier.
 *
 * Owner direction (2026-10-22): "each tier should have their own 'practice
 * account' so that either level can be previewed by a potential new user,
 * investor, or current user, weighing, whether or not they want to pay
 * for/upgrade (and/or graduate) to the next tier."
 *
 * Each tier (Novice, Pro, Expert, Wall Street) has one paper account
 * (`profiles.is_demo`, one per `profiles.tier`, migration 0106). GSPS trades
 * each on its own signals through Guided Mode's pipeline
 * (`lib/demo/auto-trade.ts`), under that tier's own entitlements and risk
 * rules, so a visitor sees what that tier actually gets and what it actually
 * did, losses included ("Only the real"). Anyone can open one from
 * `/practice` without signing up: `/api/demo/open` signs the browser in as
 * that account with a one-time link generated on the server, so no password
 * is shared and none can be changed to lock others out.
 *
 * A practice session is read-mostly. The session carries the tier in
 * `app_metadata.practice_tier` (only the service role can set it), so
 * `proxy.ts` refuses its API writes without a database read, and migration
 * 0106's restrictive row policies refuse the writes a browser makes straight
 * to the database (settings, automation, broker connections, the profile,
 * watchlists and the rest). It can look and scan, but it cannot place or
 * cancel orders, change settings, switch on automation, connect a broker,
 * pay, promote the account, rename it or delete it. The account's
 * record is GSPS's own trading and nothing a visitor typed.
 *
 * Three questions (AGENTS.md mandate):
 * 1. Gann: none to cite for an access feature. What the accounts show is
 *    Gann's method as built; the auto-trader relaxes none of it.
 * 2. Cycles: the accounts trade on the scheduled cadence the single demo
 *    account already used (a returning cycle, pg_cron), one call per tier so
 *    each run fits its 60-second budget.
 * 3. Hermetic: Correspondence. The same method, seen at four depths, each
 *    account the tier's mirror; and Polarity, the novice and expert poles
 *    side by side so a visitor can weigh them. Law of Creation: tier ⊗ record
 *    — a tier's feature list and a live record interact into a preview that
 *    neither a pricing table nor a backtest gives alone.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { TIER_ORDER, type PlatformTier } from "@/lib/tiers";

export type PracticeSlug = "novice" | "pro" | "expert" | "wall-street";

export interface PracticeTier {
  tier: PlatformTier;
  slug: PracticeSlug;
  /** The product name a person reads (lib/entitlements/policy.ts's mapping). */
  label: string;
  /**
   * Sign-in address for an account this module creates. `.invalid` is
   * reserved (RFC 2606) and can never be registered, so nobody can receive a
   * reset link for it. An account that already exists (the original
   * Wall Street demo) keeps its own address.
   */
  email: string;
}

export const PRACTICE_TIERS: readonly PracticeTier[] = [
  { tier: "PRACTICE", slug: "novice", label: "Novice", email: "practice-novice@gsps.invalid" },
  { tier: "STANDARD", slug: "pro", label: "Pro", email: "practice-pro@gsps.invalid" },
  { tier: "INVESTOR_MODE", slug: "expert", label: "Expert", email: "practice-expert@gsps.invalid" },
  { tier: "SYSTEM_MASTERY", slug: "wall-street", label: "Wall Street", email: "practice-wall-street@gsps.invalid" },
];

/** Paper cash a new practice account starts with, as the original demo did. */
export const PRACTICE_STARTING_CASH = 100_000;

/** Accepts a slug ("wall-street") or the enum ("SYSTEM_MASTERY"). */
export function practiceTierFrom(value: string | null | undefined): PracticeTier | null {
  if (!value) return null;
  const v = value.trim();
  return PRACTICE_TIERS.find((t) => t.slug === v.toLowerCase() || t.tier === v.toUpperCase()) ?? null;
}

/** The tier a signed-in practice session previews, or null for a member. */
export function practiceTierOfUser(user: Pick<User, "app_metadata"> | null | undefined): PracticeTier | null {
  const raw = (user?.app_metadata as Record<string, unknown> | undefined)?.practice_tier;
  return typeof raw === "string" && (TIER_ORDER as string[]).includes(raw) ? practiceTierFrom(raw) : null;
}

/**
 * Writes a practice session may make: looking things up, nothing that
 * changes the shared account's record, money, settings or identity. A run of
 * the market scan, the tour's progress and marking a notice read are all a
 * visitor needs to look around, and switching to another tier's account.
 */
const PRACTICE_WRITE_ALLOWED: readonly RegExp[] = [
  // Switching to another tier's practice account.
  /^\/api\/demo\/open$/,
  /^\/api\/market-scan$/,
  /^\/api\/onboarding$/,
  /^\/api\/notifications\/inbox\/(read-all|[^/]+\/read)$/,
];

/** True when a practice session must not make this request. */
export function practiceWriteRefused(path: string, method: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  if (!path.startsWith("/api")) return false;
  return !PRACTICE_WRITE_ALLOWED.some((re) => re.test(path));
}

export const PRACTICE_WRITE_REFUSAL =
  "This is a practice account, shown so you can preview the tier. It trades on GSPS's own signals only, so orders, settings and account changes are off. Create your own account to trade.";

/** The practice account's user id for a tier, oldest first; null if none yet. */
export async function findPracticeUserId(service: SupabaseClient, tier: PlatformTier): Promise<string | null> {
  const { data } = await service
    .from("profiles")
    .select("id")
    .eq("is_demo", true)
    .eq("tier", tier)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** Every practice account, in tier order. */
export async function listPracticeAccounts(
  service: SupabaseClient,
): Promise<{ userId: string; tier: PracticeTier }[]> {
  const { data } = await service
    .from("profiles")
    .select("id, tier, created_at")
    .eq("is_demo", true)
    .order("created_at", { ascending: true });
  const seen = new Set<PlatformTier>();
  const out: { userId: string; tier: PracticeTier }[] = [];
  for (const row of (data ?? []) as { id: string; tier: string }[]) {
    const tier = practiceTierFrom(row.tier);
    if (!tier || seen.has(tier.tier)) continue;
    seen.add(tier.tier);
    out.push({ userId: row.id, tier });
  }
  return out.sort((a, b) => TIER_ORDER.indexOf(a.tier.tier) - TIER_ORDER.indexOf(b.tier.tier));
}

/** An auth user's id by email; the admin API has no lookup by email. */
async function findAuthUserIdByEmail(service: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`practice account lookup: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * The tier's practice account, created on first use: an auth user with a
 * random password nobody holds, its profile marked `is_demo` at the tier, and
 * a paper account at the starting cash. An existing account is only stamped
 * with its tier in `app_metadata`; its cash and record are never touched.
 * Needs the service-role client. Returns the account's id and sign-in email.
 */
export async function ensurePracticeAccount(
  service: SupabaseClient,
  practice: PracticeTier,
): Promise<{ userId: string; email: string }> {
  let userId = await findPracticeUserId(service, practice.tier);
  let email: string;

  if (userId) {
    const { data, error } = await service.auth.admin.getUserById(userId);
    if (error || !data.user?.email) throw new Error(`practice account ${practice.slug}: ${error?.message ?? "no email"}`);
    email = data.user.email;
    if (practiceTierOfUser(data.user)?.tier !== practice.tier) {
      const { error: metaError } = await service.auth.admin.updateUserById(userId, {
        app_metadata: { ...data.user.app_metadata, practice_tier: practice.tier },
      });
      if (metaError) throw new Error(`practice account ${practice.slug}: ${metaError.message}`);
    }
  } else {
    // A first open that stopped half way (or a second visitor opening the
    // same tier at the same moment) leaves the auth user without its profile
    // mark; pick that user up rather than failing on "already registered".
    userId = (await findAuthUserIdByEmail(service, practice.email)) ?? null;
    if (!userId) {
      const password = crypto.randomUUID() + crypto.randomUUID();
      const { data, error } = await service.auth.admin.createUser({
        email: practice.email,
        password,
        email_confirm: true,
        app_metadata: { practice_tier: practice.tier },
        user_metadata: { full_name: `${practice.label} practice account` },
      });
      userId = data.user?.id ?? (await findAuthUserIdByEmail(service, practice.email));
      if (!userId) throw new Error(`practice account ${practice.slug}: ${error?.message ?? "not created"}`);
    } else {
      const { error: metaError } = await service.auth.admin.updateUserById(userId, {
        app_metadata: { practice_tier: practice.tier },
      });
      if (metaError) throw new Error(`practice account ${practice.slug}: ${metaError.message}`);
    }
    email = practice.email;
    // handle_new_user() makes the profile row; upsert covers a missing one.
    const { error: profileError } = await service
      .from("profiles")
      .upsert(
        { id: userId, display_name: `PRACTICE ACCOUNT · ${practice.label.toUpperCase()}`, is_demo: true, tier: practice.tier },
        { onConflict: "id" },
      );
    if (profileError) throw new Error(`practice account ${practice.slug}: ${profileError.message}`);
  }

  // Never overwrites an existing balance: a conflict leaves the row alone.
  const { error: accountError } = await service
    .from("paper_accounts")
    .upsert({ user_id: userId, cash: PRACTICE_STARTING_CASH }, { onConflict: "user_id", ignoreDuplicates: true });
  if (accountError) throw new Error(`practice account ${practice.slug}: ${accountError.message}`);

  return { userId, email };
}
