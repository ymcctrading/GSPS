-- Order-lifecycle reconciliation and price-increment auditing.
--
-- Why this exists
-- ---------------
-- `orders` rows were written once, at submit time, and never touched again.
-- Two consequences, both visible in the Portfolio tab:
--
--   * The status column froze at whatever the broker returned in the moment
--     after acceptance ("new" / "accepted"), so every order ever placed stayed
--     Pending forever. The Pending panel was an archive, not a live list.
--
--   * An order the broker refused threw before the insert ran, so a rejection
--     left no row at all. The order simply did not exist anywhere in the app,
--     which is why orders submitted on a day full of rejections looked like
--     they were never placed.
--
-- Every column here is nullable and added with `if not exists`, so this
-- migration is safe to apply to a populated table and safe to re-run. Existing
-- rows keep working: the reconciler treats a null `last_synced_at` as
-- "never synced" and chases the row on the next portfolio load.
--
-- Rollback
-- --------
-- `alter table public.orders drop column if exists <col>` for each column
-- below, then drop the two indexes. No existing column is altered and no data
-- is rewritten, so a rollback loses only the reconciliation metadata — the
-- order ledger itself is untouched.

alter table public.orders
  -- When the broker accepted the order. Distinct from `created_at`, which is
  -- when this app recorded it: a queued pre-market order is accepted at the
  -- open, hours later. Pending sorts on the broker's clock.
  add column if not exists broker_submitted_at timestamptz,
  -- The broker's own explanation for a refusal, shown verbatim on the row so
  -- a rejected order can be fixed rather than silently disappearing.
  add column if not exists reject_reason text,
  -- Last time this row was compared against the broker's order list. Drives
  -- the "last synced" stamp in the UI; null means never.
  add column if not exists last_synced_at timestamptz,
  -- The limit price the user actually typed, before it was snapped to the
  -- instrument's minimum increment. Kept alongside `limit_price` (the price
  -- that was submitted) so a corrected order shows both halves of what
  -- happened instead of quietly rewriting the request.
  add column if not exists requested_limit_price numeric,
  -- The increment the price was validated against, and where that increment
  -- came from ('broker' | 'regulatory'). Auditable: a price rejection after
  -- the fact can be traced to the rule that was applied.
  add column if not exists tick_size numeric,
  add column if not exists tick_source text
    check (tick_source is null or tick_source in ('broker', 'regulatory'));

-- The reconciler's read pattern: this user's working orders, newest accepted
-- first. Without it every portfolio poll sequential-scans the ledger.
create index if not exists orders_user_status_idx
  on public.orders (user_id, status, created_at desc);

-- Reconciliation matches local rows to broker orders by broker id.
create index if not exists orders_broker_order_id_idx
  on public.orders (broker_order_id)
  where broker_order_id is not null;
