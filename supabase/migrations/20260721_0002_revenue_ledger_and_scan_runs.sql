-- GSPS: per-trade micro-fee revenue ledger + daily-scan run status
-- Applied 2026-07-21. Additive & reversible. (Mirror for source control.)

-- 1. Platform transaction revenue ledger (per executed trade)
CREATE TABLE IF NOT EXISTS public.platform_transaction_revenue_ledger (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  associated_order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gross_trade_volume NUMERIC(18,4) NOT NULL,
  platform_fee_percentage NUMERIC(6,6) NOT NULL DEFAULT 0.000500, -- 0.05% default micro-fee
  calculated_revenue_collected NUMERIC(12,4) NOT NULL,
  cleared_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revenue_user_clearing
  ON public.platform_transaction_revenue_ledger(user_id, cleared_at);

ALTER TABLE public.platform_transaction_revenue_ledger ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "own revenue ledger - select" ON public.platform_transaction_revenue_ledger
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Fee trigger: on order fill, record the micro-fee revenue
CREATE OR REPLACE FUNCTION public.record_trade_revenue()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fee_pct NUMERIC(6,6) := 0.000500; -- 0.05%
  fill_price NUMERIC; fill_qty NUMERIC; gross NUMERIC;
BEGIN
  IF NEW.status = 'filled' AND (OLD.status IS DISTINCT FROM 'filled') THEN
    fill_price := COALESCE(NEW.filled_avg_price, NEW.limit_price, NEW.stop_price);
    fill_qty   := COALESCE(NEW.filled_qty, NEW.qty);
    IF fill_price IS NOT NULL AND fill_qty IS NOT NULL THEN
      gross := ABS(fill_price * fill_qty);
      INSERT INTO public.platform_transaction_revenue_ledger
        (associated_order_id, user_id, gross_trade_volume, platform_fee_percentage, calculated_revenue_collected)
      VALUES (NEW.id, NEW.user_id, gross, fee_pct, ROUND(gross * fee_pct, 4));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- Trigger function is invoked by the trigger only; not exposed via PostgREST RPC.
REVOKE ALL ON FUNCTION public.record_trade_revenue() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_record_trade_revenue ON public.orders;
CREATE TRIGGER trg_record_trade_revenue
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.record_trade_revenue();

-- 3. Daily-scan run status (drives the dashboard "running / complete" state)
DO $$ BEGIN CREATE TYPE scan_run_status AS ENUM ('PENDING','RUNNING','COMPLETE','FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_date DATE NOT NULL,
  status scan_run_status NOT NULL DEFAULT 'PENDING',
  bullish_count INTEGER NOT NULL DEFAULT 0,
  bearish_count INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_date)
);

ALTER TABLE public.scan_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "scan runs - read for authenticated" ON public.scan_runs
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN null; END $$;
