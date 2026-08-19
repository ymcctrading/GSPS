-- Every function 0022/0023 shipped names its `user_id uuid` parameter the
-- same as the table column it filters on (`where user_id = $1` against
-- notification_preferences / trade_logs, both of which have a `user_id`
-- column). Postgres's default `variable_conflict` behavior is to error on
-- that ambiguity rather than silently guess, so every one of these six
-- functions raised `42702: column reference "user_id" is ambiguous` on its
-- first real invocation — caught while verifying 0025's authorization guard
-- actually ran. None of the six could ever have executed successfully.
--
-- The parameter name can't change: PostgREST binds named RPC arguments
-- (`supabase.rpc("is_in_quiet_hours", { user_id: ... })`, used in
-- app/api/portfolio/analytics/route.ts and app/api/intraday-scan/route.ts)
-- by parameter name. `#variable_conflict use_column` is the standard
-- plpgsql pragma for exactly this: a bare `user_id` in a query now resolves
-- to the table column, which is what every `where user_id = $1` already
-- meant — the fix is one line per function, not a rewrite of the queries.

create or replace function public.is_in_quiet_hours(user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  prefs public.notification_preferences;
  local_time time;
  user_tz text;
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> user_id) then
    raise exception 'not authorized to read another user''s notification preferences'
      using errcode = '42501';
  end if;

  select * into prefs from public.notification_preferences where user_id = $1;

  if prefs is null or not prefs.quiet_hours_enabled then
    return false;
  end if;

  user_tz := coalesce(prefs.user_timezone, 'America/New_York');
  local_time := (now() at time zone user_tz)::time;

  if prefs.quiet_start < prefs.quiet_end then
    return local_time >= prefs.quiet_start and local_time < prefs.quiet_end;
  else
    return local_time >= prefs.quiet_start or local_time < prefs.quiet_end;
  end if;
end;
$$;

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
    return '{email}'::notification_channel[];
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

create or replace function public.get_performance_metrics(
  user_id uuid,
  start_date date default current_date - interval '90 days',
  end_date date default current_date
)
returns table (
  total_trades int,
  winning_trades int,
  losing_trades int,
  win_rate numeric,
  avg_win numeric,
  avg_loss numeric,
  expectancy numeric,
  largest_win numeric,
  largest_loss numeric,
  total_pnl numeric,
  total_return_pct numeric,
  sharpe_ratio numeric,
  max_drawdown numeric,
  max_drawdown_pct numeric,
  profit_factor numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> user_id) then
    raise exception 'not authorized to read another user''s performance data'
      using errcode = '42501';
  end if;

  return query
  with trades as (
    select
      outcome,
      profit_loss_dollars,
      profit_loss_percent
    from public.trade_logs
    where user_id = $1
      and exit_timestamp::date >= start_date
      and exit_timestamp::date <= end_date
      and outcome is not null
  ),
  summary as (
    select
      count(*) as total_trades,
      count(*) filter (where outcome = 'profit') as winning_trades,
      count(*) filter (where outcome = 'loss') as losing_trades,
      sum(profit_loss_dollars) as total_pnl,
      sum(profit_loss_dollars) filter (where outcome = 'profit') as total_wins,
      sum(profit_loss_dollars) filter (where outcome = 'loss') as total_losses,
      max(profit_loss_dollars) as largest_win,
      min(profit_loss_dollars) as largest_loss,
      avg(profit_loss_percent) as avg_return_pct
    from trades
  )
  select
    summary.total_trades,
    summary.winning_trades,
    summary.losing_trades,
    case
      when summary.total_trades = 0 then 0
      else round((summary.winning_trades::numeric / summary.total_trades) * 100, 2)
    end,
    case
      when summary.winning_trades = 0 then 0
      else round(summary.total_wins / summary.winning_trades, 2)
    end,
    case
      when summary.losing_trades = 0 then 0
      else round(summary.total_losses / summary.losing_trades, 2)
    end,
    case
      when summary.total_trades = 0 then 0
      else round(
        ((summary.winning_trades::numeric / summary.total_trades) * (summary.total_wins / summary.winning_trades)) -
        ((summary.losing_trades::numeric / summary.total_trades) * abs(summary.total_losses / summary.losing_trades)),
        2
      )
    end,
    summary.largest_win,
    summary.largest_loss,
    round(summary.total_pnl, 2),
    round(summary.avg_return_pct, 2),
    null::numeric,
    null::numeric,
    null::numeric,
    case
      when summary.total_losses = 0 or summary.total_wins = 0 then 0
      else round(summary.total_wins / abs(summary.total_losses), 2)
    end
  from summary;
end;
$$;

create or replace function public.get_pnl_by_period(
  user_id uuid,
  period text default 'daily',
  start_date date default current_date - interval '90 days'
)
returns table (
  period_start date,
  period_end date,
  trade_count int,
  winning_trades int,
  total_pnl numeric,
  win_rate numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> user_id) then
    raise exception 'not authorized to read another user''s performance data'
      using errcode = '42501';
  end if;

  if period = 'weekly' then
    return query
    select
      date_trunc('week', exit_timestamp)::date as period_start,
      (date_trunc('week', exit_timestamp)::date + interval '6 days')::date as period_end,
      count(*)::int,
      count(*) filter (where outcome = 'profit')::int,
      sum(profit_loss_dollars),
      case
        when count(*) = 0 then 0
        else round((count(*) filter (where outcome = 'profit')::numeric / count(*)) * 100, 2)
      end
    from public.trade_logs
    where user_id = $1
      and exit_timestamp::date >= start_date
      and outcome is not null
    group by date_trunc('week', exit_timestamp)
    order by period_start desc;

  elsif period = 'monthly' then
    return query
    select
      date_trunc('month', exit_timestamp)::date as period_start,
      (date_trunc('month', exit_timestamp) + interval '1 month' - interval '1 day')::date as period_end,
      count(*)::int,
      count(*) filter (where outcome = 'profit')::int,
      sum(profit_loss_dollars),
      case
        when count(*) = 0 then 0
        else round((count(*) filter (where outcome = 'profit')::numeric / count(*)) * 100, 2)
      end
    from public.trade_logs
    where user_id = $1
      and exit_timestamp::date >= start_date
      and outcome is not null
    group by date_trunc('month', exit_timestamp)
    order by period_start desc;

  else
    return query
    select
      exit_timestamp::date as period_start,
      exit_timestamp::date as period_end,
      count(*)::int,
      count(*) filter (where outcome = 'profit')::int,
      sum(profit_loss_dollars),
      case
        when count(*) = 0 then 0
        else round((count(*) filter (where outcome = 'profit')::numeric / count(*)) * 100, 2)
      end
    from public.trade_logs
    where user_id = $1
      and exit_timestamp::date >= start_date
      and outcome is not null
    group by exit_timestamp::date
    order by period_start desc;
  end if;
end;
$$;

create or replace function public.get_performance_by_pattern(
  user_id uuid,
  start_date date default current_date - interval '90 days'
)
returns table (
  pattern text,
  trade_count int,
  winning_trades int,
  win_rate numeric,
  total_pnl numeric,
  avg_pnl numeric,
  largest_win numeric,
  largest_loss numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> user_id) then
    raise exception 'not authorized to read another user''s performance data'
      using errcode = '42501';
  end if;

  return query
  select
    signal_called,
    count(*)::int,
    count(*) filter (where outcome = 'profit')::int,
    case
      when count(*) = 0 then 0
      else round((count(*) filter (where outcome = 'profit')::numeric / count(*)) * 100, 2)
    end,
    sum(profit_loss_dollars),
    round(avg(profit_loss_dollars), 2),
    max(profit_loss_dollars),
    min(profit_loss_dollars)
  from public.trade_logs
  where user_id = $1
    and exit_timestamp::date >= start_date
    and outcome is not null
  group by signal_called
  order by trade_count desc;
end;
$$;

create or replace function public.get_equity_curve(
  user_id uuid,
  starting_capital numeric default 10000
)
returns table (
  trade_number int,
  trade_date timestamptz,
  symbol text,
  pnl numeric,
  cumulative_pnl numeric,
  equity numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> user_id) then
    raise exception 'not authorized to read another user''s performance data'
      using errcode = '42501';
  end if;

  return query
  with ordered_trades as (
    select
      row_number() over (order by exit_timestamp asc) as trade_num,
      exit_timestamp,
      symbol,
      profit_loss_dollars,
      sum(profit_loss_dollars) over (order by exit_timestamp asc rows between unbounded preceding and current row) as cum_pnl
    from public.trade_logs
    where user_id = $1 and outcome is not null
    order by exit_timestamp asc
  )
  select
    trade_num::int,
    exit_timestamp,
    symbol,
    profit_loss_dollars,
    cum_pnl,
    starting_capital + cum_pnl
  from ordered_trades;
end;
$$;
