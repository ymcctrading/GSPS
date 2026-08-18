-- The position-reconciliation job needs to know direction (long vs short) to
-- compute realized P/L sign, and the originating scan to label the
-- trade_logs entry it derives on close.
alter table public.positions
  add column side text not null default 'long' check (side in ('long', 'short')),
  add column scan_result_id uuid references public.scan_results (id) on delete set null;
