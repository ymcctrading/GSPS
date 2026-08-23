-- Minimal referral program: a per-user referral link (the user's own
-- username, per `/r/<username>`), a click counter, and signup attribution.
-- No commissions or payouts here — that is a compliance and payout-provider
-- decision for later. This only records who referred whom and how many
-- people clicked a link before signing up, so a payout model can be built on
-- top of real numbers rather than guessed at.
--
-- Q1 (Aug-Oct 2026) is scoped to monetization/retention foundations and does
-- not name an affiliate program; this ships ahead of that roadmap entry at
-- explicit user request, noted here and in ROADMAP.md rather than presented
-- as previously planned work.

-- ============ attribution ============
-- Which user (if any) referred this one. Set once, at signup, from the `ref`
-- query param carried through to auth signup metadata — never editable after
-- the fact, so it can't be gamed retroactively.
alter table public.profiles
  add column referred_by uuid references public.profiles (id) on delete set null;

-- A user cannot be attributed to themselves.
alter table public.profiles
  add constraint profiles_referred_by_not_self check (referred_by is distinct from id);

-- ============ referral_link_clicks ============
-- One row per visit to /r/<code>, before it's known whether that visit ever
-- becomes an account. Deliberately coarse — no IP, no user agent, nothing
-- that turns a click counter into a tracking log.
create table public.referral_link_clicks (
  id uuid primary key default gen_random_uuid (),
  code text not null,
  referrer_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index referral_link_clicks_referrer_idx
  on public.referral_link_clicks (referrer_id);

alter table public.referral_link_clicks enable row level security;

-- Rows are written by the service-role redirect handler (app/r/[code]/route.ts),
-- which bypasses RLS, not by a client insert — so the only policy needed is
-- read access for the referrer checking their own count.
create policy "own referral clicks" on public.referral_link_clicks
  for select using (auth.uid () = referrer_id);

-- ============ signup attribution ============
-- Extends handle_new_user (0001_initial_schema.sql) to resolve an optional
-- `ref` signup-metadata value — the referrer's username — to a profile id.
-- An unresolvable or missing code just leaves referred_by null; a bad code is
-- not a reason to fail the signup.
create or replace function public.handle_new_user () returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ref_code text;
  v_referrer_id uuid;
begin
  v_ref_code := new.raw_user_meta_data ->> 'ref';
  if v_ref_code is not null and v_ref_code <> '' then
    select id into v_referrer_id
    from public.profiles
    where lower(username) = lower(v_ref_code)
    limit 1;
  end if;

  insert into public.profiles (id, display_name, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    v_referrer_id
  );
  return new;
end;
$$;

-- ============ referral_stats() ============
-- `profiles`'s "own profile read" RLS policy (0001_initial_schema.sql) means
-- a user cannot directly select the rows they referred — that's other
-- people's profiles. A SECURITY DEFINER function is the narrow bypass:
-- it only ever counts rows for `auth.uid()`, an argument the caller cannot
-- override, so it exposes a count and nothing about who those referred users
-- are.
create function public.referral_stats () returns table (
  click_count bigint,
  signup_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*) from public.referral_link_clicks where referrer_id = auth.uid ()),
    (select count(*) from public.profiles where referred_by = auth.uid ());
$$;

grant execute on function public.referral_stats () to authenticated;
