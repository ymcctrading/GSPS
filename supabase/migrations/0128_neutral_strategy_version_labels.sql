-- 0128: rules-version labels, not names, in the tables a member can read.
--
-- The owner's confidential-sources rule (2026-10-28, AGENTS.md): a member
-- reads their own orders, trade plans and trade logs, and every daily scan,
-- straight through the API, and `strategy_version` held names that describe
-- the rule each change built. Since this change the app writes the label
-- instead (`lib/backtest/publicVersion.ts`: the version's date and a 5-letter
-- FNV-1a tag, e.g. "2026-10-28 · k3f9a"). This relabels the rows written
-- before it with the same function, so old and new rows still compare.
-- `shadow_signals` and `backtest_run` have no member read policy and keep the
-- names. Apply after the code that writes labels has deployed.
--
-- Rollback: none needed for behaviour (nothing reads the name back from these
-- tables); the names are recorded in AGENTS.md and the commit history.

create or replace function pg_temp.gsps_version_label(v text) returns text
language plpgsql immutable as $$
declare
  h bigint := 2166136261;
  i int;
  n bigint;
  digits text := '0123456789abcdefghijklmnopqrstuvwxyz';
  b36 text := '';
  d text;
begin
  if v is null then return null; end if;
  if v ~ '^(\d{4}-\d{2}-\d{2} · |v-)[0-9a-z]{5}$' then return v; end if;
  for i in 1..length(v) loop
    h := (h # ascii(substr(v, i, 1))) * 16777619 % 4294967296;
  end loop;
  n := h;
  if n = 0 then b36 := '0'; end if;
  while n > 0 loop
    b36 := substr(digits, (n % 36)::int + 1, 1) || b36;
    n := n / 36;
  end loop;
  b36 := right(lpad(b36, 7, '0'), 5);
  d := substring(v from '^\d{4}-\d{2}-\d{2}');
  return case when d is null then 'v-' || b36 else d || ' · ' || b36 end;
end;
$$;

update public.daily_scans set strategy_version = pg_temp.gsps_version_label(strategy_version)
  where strategy_version is not null and strategy_version <> pg_temp.gsps_version_label(strategy_version);
update public.orders set strategy_version = pg_temp.gsps_version_label(strategy_version)
  where strategy_version is not null and strategy_version <> pg_temp.gsps_version_label(strategy_version);
-- A plan whose labelled twin already exists (same user, instrument,
-- timeframe and fingerprint, the 0053 unique index) is the older copy of one
-- signal: it is kept, not relabelled, so the update can't fail on the index.
-- The app looks up the named copy first, so no such twin is expected.
update public.trade_plans p set strategy_version = pg_temp.gsps_version_label(p.strategy_version)
  where p.strategy_version is not null and p.strategy_version <> pg_temp.gsps_version_label(p.strategy_version)
    and not exists (
      select 1 from public.trade_plans t
      where t.user_id = p.user_id and t.instrument = p.instrument and t.timeframe = p.timeframe
        and t.signal_fingerprint = p.signal_fingerprint
        and t.strategy_version = pg_temp.gsps_version_label(p.strategy_version)
    );
update public.trade_logs set strategy_version = pg_temp.gsps_version_label(strategy_version)
  where strategy_version is not null and strategy_version <> pg_temp.gsps_version_label(strategy_version);

-- The strategy-mode preference's default id was 'gann'; the app writes and
-- reads 'gsps' (a stored 'gann' already read as the default). Members read
-- their own row, so the old id goes too.
update public.strategy_mode_preferences set mode = 'gsps' where mode = 'gann';
alter table public.strategy_mode_preferences alter column mode set default 'gsps';
