-- Compliance sign-off ledger — the durable, auditable record that gates any
-- feature this codebase itself cannot authorize into live use.
--
-- First consumer: the Automated Portfolio Manager's autonomous live-trading
-- path (lib/automation/portfolio-manager.ts, docs/
-- AUTOMATED_PORTFOLIO_MANAGER_LIVE_REVIEW.md). That review document lays out
-- the risk register and control checklist a qualified compliance/legal
-- reviewer must actually work through -- an AI coding agent can build the
-- controls the review requires, and can prepare the review document itself,
-- but cannot grant the review. `isAutonomousLiveTradingAuthorized`
-- (lib/compliance/signoff.ts) checks for an active row in this table before
-- any code path may treat autonomous (non-human-clicked) live execution as
-- authorized; absent one, that path stays refused. There is currently no row
-- in this table and no code that inserts one outside a human running the
-- helper directly against the service-role client -- inserting the first row
-- is a deliberate, out-of-band, recorded human action, not something either
-- this migration or a future deploy performs on its own.
--
-- Deliberately not scoped to a single user or feature-specific column set:
-- future gated features (a new autonomous execution surface, a materially
-- changed risk profile on an existing one) reuse this same ledger keyed by
-- `feature`, rather than each growing its own ad hoc "is this allowed yet"
-- table.
--
-- Same posture as the learning-instrumentation tables (migration 0005, see
-- supabase/AGENTS.md): RLS enabled, no policy at all -- intentional deny-all.
-- There is no per-user ownership concept for a global authorization ledger;
-- every read and write goes through the service-role client from trusted
-- server code only.
--
-- Rollback: drop table if exists public.compliance_signoffs cascade;

create table public.compliance_signoffs (
  id uuid primary key default gen_random_uuid (),

  -- What this sign-off authorizes, e.g. 'autonomous_live_trading'. Free text
  -- rather than an enum -- this ledger is meant to outlive any one feature
  -- list, and a check constraint here would need a migration every time a
  -- new gated feature is added.
  feature text not null,

  -- Free-text identity of the actual human/firm reviewer -- this table
  -- records that a sign-off happened and by whom, it is not an
  -- authentication system. Never a `user_id` / `auth.users` reference: the
  -- reviewer is a compliance officer or outside counsel, not necessarily a
  -- member of this app's own user base.
  approved_by text not null,
  approved_at timestamptz not null default now(),

  -- Pointer to the actual review artifact (e.g. a path in this repo, a doc
  -- link, a matter/engagement reference) -- the record of *what* was
  -- reviewed, kept alongside the record that it *was*.
  review_reference text not null,

  notes text,

  -- A sign-off is revoked, never deleted -- deleting the row would erase the
  -- fact that authorization once existed and was later pulled, which matters
  -- exactly when an incident review needs to reconstruct what was
  -- authorized and when.
  revoked_at timestamptz,
  revoked_by text,
  revoked_reason text,

  constraint compliance_signoffs_revocation_fields_consistent check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  )
);

create index compliance_signoffs_feature_active_idx
  on public.compliance_signoffs (feature)
  where revoked_at is null;

alter table public.compliance_signoffs enable row level security;
