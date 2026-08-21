-- Applied directly to production on 2026-08-20 (Supabase migration version
-- `20260820140029`, name `account_status_lookup`) without ever landing as a
-- file in this repo — captured here after the fact so the schema this file
-- claims to describe matches what's actually running. See `0030`, applied
-- immediately after this one, for why the grant below doesn't stay as
-- written.
--
-- Recreated verbatim from `pg_get_functiondef` against the live database,
-- not rewritten — this migration's job is to be an honest record of what
-- was applied, not to fix it in the same breath.

create or replace function public.find_auth_user_by_email(p_email text)
returns table (id uuid, email_confirmed_at timestamptz)
language sql
stable security definer
set search_path = ''
as $$
  select u.id, u.email_confirmed_at
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

grant execute on function public.find_auth_user_by_email (text) to anon, authenticated;
