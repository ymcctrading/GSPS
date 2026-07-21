-- GSPS: 4-tier subscription model + per-user automation control dials
-- Applied to project vebhpmmzxixlhujlptue on 2026-07-21. Additive & reversible.
-- (Mirror of the applied migration for source control.)

-- 1. Platform tier enum + column on profiles
DO $$ BEGIN
  CREATE TYPE platform_tier AS ENUM ('PRACTICE', 'STANDARD', 'INVESTOR_MODE', 'SYSTEM_MASTERY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier platform_tier NOT NULL DEFAULT 'PRACTICE';

-- 2. Automation control-dial enums
DO $$ BEGIN CREATE TYPE risk_profile_type AS ENUM ('PASSIVE','MODERATE','AGGRESSIVE');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE directional_bias_type AS ENUM ('BULLISH_ONLY','BEARISH_ONLY','BOTH');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE volatility_trigger_type AS ENUM ('PERCENTAGE','DOLLAR_AMOUNT');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE execution_environment_type AS ENUM ('SIMULATION','LIVE_BROKERAGE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Per-user automation profile (System Mastery dials)
CREATE TABLE IF NOT EXISTS public.user_automation_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_automation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  risk_profile risk_profile_type NOT NULL DEFAULT 'MODERATE',
  directional_bias directional_bias_type NOT NULL DEFAULT 'BOTH',
  volatility_trigger_type volatility_trigger_type NOT NULL DEFAULT 'PERCENTAGE',
  volatility_trigger_value NUMERIC(10,4) NOT NULL DEFAULT 2.0000,
  execution_environment execution_environment_type NOT NULL DEFAULT 'SIMULATION',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_automation_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "own automation profile - select" ON public.user_automation_profiles
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "own automation profile - insert" ON public.user_automation_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "own automation profile - update" ON public.user_automation_profiles
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "own automation profile - delete" ON public.user_automation_profiles
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 4. Extend multi-asset support beyond us_equity/crypto (keep lowercase convention)
ALTER TABLE public.watchlist_items DROP CONSTRAINT IF EXISTS watchlist_items_asset_class_check;
ALTER TABLE public.watchlist_items
  ADD CONSTRAINT watchlist_items_asset_class_check
  CHECK (asset_class = ANY (ARRAY['us_equity','crypto','option','future','forex','commodity']));
