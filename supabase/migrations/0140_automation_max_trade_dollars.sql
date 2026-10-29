-- The most a single automated trade may cost, in dollars, set by the member on
-- the Automation page. Null means no cap (the engine sizes by its own rules).
-- Read at every automated placement and pyramid add, so it also binds
-- activations made before it was set. A cap only takes shares away; Gann's
-- capital rules and placement's own checks still apply on top of it.
alter table public.user_automation_profiles
  add column if not exists max_trade_dollars numeric
    check (max_trade_dollars is null or max_trade_dollars > 0);

comment on column public.user_automation_profiles.max_trade_dollars is
  'Most an automated trade may cost in dollars (entry x shares); null = no cap. Owner request 2026-10-29.';
