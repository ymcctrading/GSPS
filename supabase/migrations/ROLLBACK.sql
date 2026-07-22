-- GSPS rollback for the 2026-07-21 additive migrations.
-- Run top-to-bottom to fully revert. Safe: only drops objects this batch created.

-- Scheduling
DO $$ BEGIN PERFORM cron.unschedule('gsps-daily-scan'); EXCEPTION WHEN OTHERS THEN null; END $$;

-- Revenue ledger + trigger
DROP TRIGGER IF EXISTS trg_record_trade_revenue ON public.orders;
DROP FUNCTION IF EXISTS public.record_trade_revenue();
DROP TABLE IF EXISTS public.platform_transaction_revenue_ledger;

-- Scan run status
DROP TABLE IF EXISTS public.scan_runs;
DROP TYPE IF EXISTS scan_run_status;

-- Automation profiles
DROP TABLE IF EXISTS public.user_automation_profiles;
DROP TYPE IF EXISTS execution_environment_type;
DROP TYPE IF EXISTS volatility_trigger_type;
DROP TYPE IF EXISTS directional_bias_type;
DROP TYPE IF EXISTS risk_profile_type;

-- Tier column (leave enum if other objects use it; drop explicitly if desired)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS tier;
DROP TYPE IF EXISTS platform_tier;

-- Restore the original asset_class constraint
ALTER TABLE public.watchlist_items DROP CONSTRAINT IF EXISTS watchlist_items_asset_class_check;
ALTER TABLE public.watchlist_items
  ADD CONSTRAINT watchlist_items_asset_class_check
  CHECK (asset_class = ANY (ARRAY['us_equity','crypto']));

-- Edge function must be removed from the dashboard or CLI:
--   supabase functions delete daily-scan
