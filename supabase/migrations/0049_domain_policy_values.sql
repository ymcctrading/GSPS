-- Generic versioned policy config, extending the pattern 0046 established for
-- tier promotion (promotion_policy_values/promotion_policy_change_log) to
-- every other policy domain named in the "Claude Code Build Roadmap" spec
-- pack's Phase 1 ("Policy/config domain") and its `policy_versions` entity:
-- "Versioned policy tables/config: tier limits, risk bands, cooldown
-- thresholds, universe criteria, strategy parameters. No hard-coded UI
-- policy values."
--
-- One pair of tables, scoped by a `domain` column, rather than a
-- promotion_policy_values-style pair per domain (risk_policy_values,
-- universe_policy_values, ...): the schema and trigger are identical across
-- domains, and a shared table keeps every threshold override queryable and
-- change-logged in one place. Domains seen so far: "risk" (lib/risk/policy.ts),
-- with "universe" and "guided" as documented follow-ups (see
-- docs/CLAUDE_CODE_ROADMAP_TRACKER.md).
--
-- Same posture as 0036/0042/0046: RLS enabled, no client select/insert/update
-- policy anywhere in this file — only service_role (server code that has
-- already resolved a domain's policy resolver) may read or write. A client
-- reading its own risk thresholds ahead of the circuit breaker evaluating
-- them, or writing its own override, would defeat the point of a server-side
-- ceiling.
--
-- Rollback: `drop table if exists public.policy_change_log, public.policy_values cascade;`

-- ============ policy_values ============
-- One row per (domain, key) configurable threshold. The code default in each
-- domain's own config module (e.g. lib/risk/config.ts) is the fallback used
-- when a row is absent or a read fails — this table only ever *overrides* a
-- documented default, it does not supply meaning for a (domain, key) the
-- code doesn't already know about.
create table public.policy_values (
  domain text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (domain, key)
);

alter table public.policy_values enable row level security;

-- No select policy: policy thresholds are a server-side implementation
-- detail, not a table any client reads directly.

-- ============ policy_change_log ============
-- Append-only history of every change to policy_values, written by the
-- trigger below rather than by application code, so a change can never be
-- made without being logged.
create table public.policy_change_log (
  id uuid primary key default gen_random_uuid (),
  domain text not null,
  key text not null,
  old_value jsonb,
  new_value jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index policy_change_log_domain_key_idx
  on public.policy_change_log (domain, key, changed_at desc);

alter table public.policy_change_log enable row level security;

create function public.log_policy_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.policy_change_log (domain, key, old_value, new_value, changed_by)
    values (new.domain, new.key, null, new.value, new.updated_by);
  elsif tg_op = 'UPDATE' and new.value is distinct from old.value then
    insert into public.policy_change_log (domain, key, old_value, new_value, changed_by)
    values (new.domain, new.key, old.value, new.value, new.updated_by);
  end if;
  return new;
end;
$$;

revoke execute on function public.log_policy_change() from public;

create trigger policy_values_change_log
  after insert or update on public.policy_values
  for each row execute function public.log_policy_change();
