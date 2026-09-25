-- Three-path tier promotion — persistence for the generalized promotion
-- model across all three transitions (Novice->Pro, Pro->Expert,
-- Expert->Wall Street), each clearable by any one of three independent
-- paths: curriculum completion, a demonstrated track record, or payment.
-- See AGENTS.md's "Three-path tier promotion" section and
-- lib/promotion/transitions.ts.
--
-- 0046 (`promotion_policy_values`, `promotion_policy_change_log`,
-- `promotion_progress`, `promotion_status`) remains untouched and
-- immutable, per this repo's convention. This migration does not drop or
-- rewrite it: `promotion_progress`/`promotion_status` continue to exist and
-- (for now) continue to be read for the Novice->Pro transition's Foundations
-- education/practice-validation flags specifically
-- (lib/promotion/curriculumPolicy.ts). The new tables below generalize the
-- *status* half (eligibility tracking, request/effective/promoted
-- timestamps, which path was used) across all three transitions, including
-- Novice->Pro going forward -- `promotion_status` itself is superseded for
-- new writes but its historical rows are left in place rather than migrated,
-- since no profile has been promoted through it yet (no live users).
--
-- Same posture as 0046: RLS enabled, a "select own rows" policy per table,
-- no client insert/update/delete policy -- only service_role (server routes
-- that have already run lib/promotion/* logic) may write.
--
-- Rollback: `drop table if exists public.tier_promotion_purchases,
-- public.tier_promotions_status, public.tier_promotions_progress cascade;`

-- ============ tier_promotions_progress ============
-- One row per (profile, transition) recording the Curriculum path's
-- completion state. novice_to_pro's education/practice-validation flags
-- stay on the existing `promotion_progress` table (unchanged, see above);
-- this table carries the *new* per-transition curriculum flags that table
-- has no room for: pro_to_expert's Academies 4-7 completion. Also carries
-- expert_to_wall_street for schema symmetry, even though that transition's
-- one required field (the Academy 8 capstone) already lives on
-- `live_trading_restrictions.wall_street_school_completed_at` and is read
-- from there, not duplicated here.
create table public.tier_promotions_progress (
  profile_id uuid not null references auth.users (id) on delete cascade,
  transition text not null check (transition in ('novice_to_pro', 'pro_to_expert', 'expert_to_wall_street')),
  curriculum_completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id, transition)
);

alter table public.tier_promotions_progress enable row level security;

create policy "own tier promotion progress" on public.tier_promotions_progress
  for select using (auth.uid () = profile_id);

-- ============ tier_promotions_status ============
-- One row per (profile, transition) once first eligible through any path.
-- Generalizes `promotion_status` (0046) across all three transitions and
-- adds `path_used` so the UI and any future audit can show which of the
-- three paths a promotion actually went through.
create table public.tier_promotions_status (
  profile_id uuid not null references auth.users (id) on delete cascade,
  transition text not null check (transition in ('novice_to_pro', 'pro_to_expert', 'expert_to_wall_street')),
  path_used text check (path_used in ('curriculum', 'track_record', 'pay_your_way')),
  eligible_since timestamptz,
  requested_at timestamptz,
  effective_at timestamptz,
  promoted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id, transition)
);

alter table public.tier_promotions_status enable row level security;

create policy "own tier promotion status" on public.tier_promotions_status
  for select using (auth.uid () = profile_id);

-- ============ tier_promotion_purchases ============
-- Records a Pay Your Way promotion purchase. Additive, Stripe-agnostic
-- schema -- lib/billing/promotionPricing.ts follows the same
-- "not enabled until real Stripe prices exist" posture as lib/billing/stripe.ts,
-- so this table exists ahead of any live payment integration; no row is
-- ever written until that lands.
create table public.tier_promotion_purchases (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references auth.users (id) on delete cascade,
  transition text not null check (transition in ('novice_to_pro', 'pro_to_expert', 'expert_to_wall_street')),
  amount_cents integer not null check (amount_cents > 0),
  stripe_checkout_session_id text,
  status text not null check (status in ('pending', 'completed', 'failed', 'refunded')) default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index tier_promotion_purchases_profile_idx on public.tier_promotion_purchases (profile_id, transition);

alter table public.tier_promotion_purchases enable row level security;

create policy "own tier promotion purchases" on public.tier_promotion_purchases
  for select using (auth.uid () = profile_id);
