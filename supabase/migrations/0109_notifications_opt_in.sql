-- Notifications are opt-in (owner, 2026-10-22: "turn the notifications off
-- for everyone besides icharles and ymcctrading. It can be a feature that
-- they toggle on or off for themselves").
--
-- A member with no notification_preferences row was sent email
-- (0022/0026 answered a missing row with '{email}', and the column defaulted
-- to true). Now a missing row means no channel and a new row starts with
-- email off; each member turns email or push on in Settings. The owner's own
-- accounts were given rows with email on, by a separate data update, so no
-- address is kept in this file.

alter table public.notification_preferences alter column email_enabled set default false;

create or replace function public.get_enabled_notification_channels(user_id uuid)
returns notification_channel[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  channels notification_channel[];
  prefs public.notification_preferences;
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> user_id) then
    raise exception 'not authorized to read another user''s notification preferences'
      using errcode = '42501';
  end if;

  select * into prefs from public.notification_preferences where user_id = $1;

  if prefs is null then
    return '{}'::notification_channel[];
  end if;

  select array_agg(channel) into channels
  from (
    select 'email'::notification_channel as channel where prefs.email_enabled
    union all
    select 'sms'::notification_channel as channel where prefs.sms_enabled
    union all
    select 'push'::notification_channel as channel where prefs.push_enabled
  ) c;

  return coalesce(channels, '{}'::notification_channel[]);
end;
$$;

revoke execute on function public.get_enabled_notification_channels(uuid) from public, anon, authenticated;
grant execute on function public.get_enabled_notification_channels(uuid) to service_role;
