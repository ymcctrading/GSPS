-- Renumbered from 0003_positions_side.sql: it originally shared the 0003
-- prefix with 0003_order_greeks_and_targets.sql, an ambiguous apply order
-- that a lexicographic sort resolves by luck rather than intent. Content
-- unchanged; already-applied databases are unaffected by the rename.
--
-- The position-reconciliation job needs to know direction (long vs short) to
-- compute realized P/L sign, and the originating scan to label the
-- trade_logs entry it derives on close.
alter table public.positions
  add column side text not null default 'long' check (side in ('long', 'short')),
  add column scan_result_id uuid references public.scan_results (id) on delete set null;
