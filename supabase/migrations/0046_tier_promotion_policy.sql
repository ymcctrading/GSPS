-- Tier Access, Promotion & User Experience — persistence for lib/promotion/*.
--
-- Source: "Tier Access, Promotion & User Experience" spec pack (2026-08-28,
-- draft implementation directives; requires securities/compliance counsel
-- review before live personalized recommendations or execution). That pack
-- is explicit that promotion thresholds must be "remotely configurable
-- policy values with change logs" rather than hard-coded into UI
-- components — the first two tables below are that config store. The rest
-- record a profile's progress toward Pro (STANDARD) eligibility and the
-- outcome of a promotion request. Additive only; nothing here is wired to a
-- route that mutates `profiles.tier` outside `lib/promotion/promote.ts`.
--
-- "Pro" here is the product-facing name for the billing tier `STANDARD`
-- (see lib/entitlements/policy.ts's tier-naming note) — this migration
-- promotes a profile from `PRACTICE` (Novice) to `STANDARD` (Pro) once
-- behavioral eligibility is met. It never touches Stripe, INVESTOR_MODE, or
-- SYSTEM_MASTERY, and per the spec pack, upgrade eligibility is a feature
-- unlock only — it is never itself "permission to risk more capital"; the
-- Novice risk/cooldown engine (0042) is untouched and still cannot be
-- overridden by any tier.
--
-- Same posture as 0036/0042: RLS enabled, a "select own rows" policy on the
-- per-profile tables, and no client insert/update/delete policy anywhere in
-- this file — only service_role (server routes that have already run
-- lib/promotion/* logic) may write. A client writing its own progress or
-- policy row would let it promote itself.
--
-- Rollback: `drop table if exists public.promotion_status,
-- public.promotion_progress, public.promotion_policy_change_log,
-- public.promotion_policy_values cascade;`

-- ============ promotion_policy_values ============
-- One row per configurable threshold (e.g. "pro_min_completed_trades"). The
-- code default in lib/promotion/config.ts is the fallback used when a key
-- has no row here or the table read fails — this table only ever *lowers or
-- raises* a value away from that documented default, it does not supply
-- meaning for keys the code doesn't already know about.
create table public.promotion_policy_values (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.promotion_policy_values enable row level security;

-- No select policy: policy thresholds are a server-side implementation
-- detail (fed into computed readiness the user *does* see via
-- /api/promotion/status), not a table any client reads directly.

-- ============ promotion_policy_change_log ============
-- Append-only history of every change to promotion_policy_values, written
-- by the trigger below rather than by application code, so a change can
-- never be made without being logged.
create table public.promotion_policy_change_log (
  id uuid primary key default gen_random_uuid (),
  key text not null,
  old_value jsonb,
  new_value jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index promotion_policy_change_log_key_idx
  on public.promotion_policy_change_log (key, changed_at desc);

alter table public.promotion_policy_change_log enable row level security;

create function public.log_promotion_policy_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.promotion_policy_change_log (key, old_value, new_value, changed_by)
    values (new.key, null, new.value, new.updated_by);
  elsif tg_op = 'UPDATE' and new.value is distinct from old.value then
    insert into public.promotion_policy_change_log (key, old_value, new_value, changed_by)
    values (new.key, old.value, new.value, new.updated_by);
  end if;
  return new;
end;
$$;

revoke execute on function public.log_promotion_policy_change() from public;

create trigger promotion_policy_values_change_log
  after insert or update on public.promotion_policy_values
  for each row execute function public.log_promotion_policy_change();

-- ============ promotion_progress ============
-- The two spec requirements that are one-time completions rather than
-- rolling metrics computed from trade history: the required education
-- module and the paper-trading/intraday simulation validation period.
create table public.promotion_progress (
  profile_id uuid primary key references auth.users (id) on delete cascade,
  education_completed_at timestamptz,
  practice_validation_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.promotion_progress enable row level security;

create policy "own promotion progress" on public.promotion_progress
  for select using (auth.uid () = profile_id);

-- ============ promotion_status ============
-- One row per profile once it first becomes eligible. Records the
-- eligibility moment, an explicit user request to upgrade, and the future
-- session the upgrade takes effect at — per the spec pack, "Upgrades may
-- take effect at a defined future session after required onboarding — not
-- retroactively to defeat an entry cap." `promoted_at` is set only once
-- `lib/promotion/promote.ts` has actually flipped `profiles.tier`.
create table public.promotion_status (
  profile_id uuid primary key references auth.users (id) on delete cascade,
  eligible_since timestamptz,
  requested_at timestamptz,
  effective_at timestamptz,
  promoted_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.promotion_status enable row level security;

create policy "own promotion status" on public.promotion_status
  for select using (auth.uid () = profile_id);
