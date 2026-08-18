-- Username support: lets users log in with a chosen handle instead of email.
-- profiles.username is optional and unique (case-insensitive); a
-- SECURITY DEFINER function resolves a username to its email at login time
-- since Supabase Auth itself only accepts email/phone for password sign-in.

alter table public.profiles
  add column username text;

create unique index profiles_username_lower_unique_idx
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles
  add constraint profiles_username_format check (
    username is null or username ~ '^[a-zA-Z0-9_]{3,32}$'
  );

create function public.resolve_username_email (p_username text) returns text
language sql stable security definer set search_path = ''
as $$
  select u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(p_username)
  limit 1;
$$;

grant execute on function public.resolve_username_email (text) to anon, authenticated;
