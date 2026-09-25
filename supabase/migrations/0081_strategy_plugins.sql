-- Custom-script Strategy Modes — Phase 2 plugin registry
-- (lib/strategies/custom/, docs/STRATEGY_MODES.md's "Custom-script / plugin
-- system" section; AGENTS.md's "Strategy Modes" section). Phase 1
-- (lib/strategies/custom/{lexer,parser,interpret,compile}.ts) built the DSL
-- and sandboxed evaluator; this is the durable registry a script's identity
-- and edit history live in, parallel in spirit to migration 0048's
-- strategy_modules (module identity queryable independent of a deploy) per
-- AGENTS.md's orphan-module audit outcome 5/8 and its "can never drift"
-- lesson — unlike strategy_modules (a static, GSPS-owned list seeded by the
-- migration itself), strategy_plugins is user-authored, so its "can never
-- drift" property is enforced differently: not by a registry-vs-code
-- equality test, but by every read path recompiling `source` through
-- lib/strategies/custom/compile.ts rather than trusting any cached/derived
-- column — there is no compiled-AST or evaluator column here to drift from
-- the source of truth in the first place.
--
-- Authoring is gated to Wall Street tier only
-- (lib/entitlements/policy.ts#customScriptAuthoringEnabled,
-- lib/strategies/access.ts#isCustomScriptAuthoringAllowedForPolicy),
-- checked server-side in the /api/strategy-plugins CRUD routes — never
-- enforced here via RLS tier checks, matching how every other
-- entitlement-gated table in this schema is enforced (server route checks
-- policy first, RLS only ever narrows "which rows can this user's own
-- request see/touch", never "is this tier allowed to do this at all").
--
-- Private to the authoring user only in v1 — no marketplace/sharing (see
-- AGENTS.md's "Strategy Modes" section for the full reasoning). RLS is
-- therefore a strict owner-only policy, the same shape migration 0079's
-- strategy_mode_preferences uses.
--
-- strategy_plugins holds each script's current state; strategy_plugin_versions
-- is an append-only history of every saved source edit, so a script's
-- evolution is auditable (docs/STRATEGY_MODES.md's own "versioned so a
-- script's own history is auditable" requirement) — every edit that changes
-- `source` inserts a new version row rather than overwriting history.
--
-- Rollback: `drop table if exists public.strategy_plugin_versions; drop
-- table if exists public.strategy_plugins;`. Additive only.

create table if not exists public.strategy_plugins (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  author text not null check (char_length(author) between 1 and 100),
  source text not null check (char_length(source) between 1 and 4000),
  version integer not null default 1 check (version >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists strategy_plugins_user_idx
  on public.strategy_plugins (user_id);

alter table public.strategy_plugins enable row level security;

create policy "own strategy plugins" on public.strategy_plugins
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create table if not exists public.strategy_plugin_versions (
  id uuid primary key default gen_random_uuid (),
  plugin_id uuid not null references public.strategy_plugins (id) on delete cascade,
  version integer not null check (version >= 1),
  source text not null check (char_length(source) between 1 and 4000),
  created_at timestamptz not null default now(),
  unique (plugin_id, version)
);

create index if not exists strategy_plugin_versions_plugin_idx
  on public.strategy_plugin_versions (plugin_id);

alter table public.strategy_plugin_versions enable row level security;

-- No direct FK to auth.users on this table (matching 0048's evaluation
-- tables' own reasoning for signal_id) — ownership is resolved through
-- plugin_id -> strategy_plugins.user_id instead, so a version row is never
-- orphaned from the ownership check its parent plugin already enforces.
create policy "own strategy plugin versions" on public.strategy_plugin_versions
  for select using (
    exists (
      select 1 from public.strategy_plugins p
      where p.id = plugin_id and p.user_id = auth.uid ()
    )
  );

create policy "insert own strategy plugin versions" on public.strategy_plugin_versions
  for insert with check (
    exists (
      select 1 from public.strategy_plugins p
      where p.id = plugin_id and p.user_id = auth.uid ()
    )
  );
