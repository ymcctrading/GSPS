-- GSPS — 0111: automated pyramid adds on one exit line
--
-- Q2 item 3 (SYNTHESIZED_ROADMAP): the portfolio manager places Gann's
-- pyramid adds (lib/automation/pyramid-adds.ts; lib/gann/pyramid.ts, 100/50/
-- 30/20/10 shares on each crossed swing top, *Truth of the Stock Tape* Ch. IX,
-- W006 p.47 Rule 5). The replay walks a pyramided trade as one position with
-- one stop on the whole line (`walkGannExit`), so an add joins the line's own
-- exit row instead of running as a second, separately stopped trade:
--
--   lots            each lot on the line, oldest first: [{qty, price, date}],
--                   date the New York session it filled. Null on a line with
--                   one lot (every row written before this, and every row a
--                   person's ticket writes), read as that one lot.
--   merged_into     on the add's own exit row, which placement writes at the
--                   fill: the line it joined. That row is closed at once.
--   add_claimed_at  the claim one pass takes before it places an add, so two
--                   overlapping passes never both buy the same lot.
--
-- Server-written like the rest of the ledger (0095). Additive, nullable.
-- Applied to production 2026-10-22, before the code that reads it merges.
--
-- Rollback:
--   alter table public.protocol_exits
--     drop column if exists add_claimed_at,
--     drop column if exists merged_into,
--     drop column if exists lots;

alter table public.protocol_exits
  add column if not exists lots jsonb,
  add column if not exists merged_into uuid references public.protocol_exits(id) on delete set null,
  add column if not exists add_claimed_at timestamptz;
