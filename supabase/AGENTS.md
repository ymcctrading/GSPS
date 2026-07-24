# supabase — Migrations & Schema

## Tables (as of migration `0002`)

`profiles`, `watchlists`, `watchlist_items`, `scan_results`, `daily_scans`,
`broker_connections`, `orders`, `positions`, `settings`, `trade_logs`.

`daily_scans` is what `/api/market-scan` writes to and what the dashboard
reads for its 15 bullish/15 bearish signals — see `app/api/AGENTS.md`.

## Conventions established by existing migrations

- **Numbered, sequential migration files**: `0001_initial_schema.sql`,
  `0002_trade_logging.sql`. Keep this pattern — `000N_short_description.sql`
  — rather than timestamp-based names.
- **Row Level Security is on for every user-scoped table**, with a policy
  restricting rows to `auth.uid()`. Any new table holding per-user data
  must enable RLS and add an equivalent policy in the same migration that
  creates the table — don't leave a table open and plan to lock it down
  later.
- **Foreign keys to `auth.users(id)`** use `on delete cascade` for
  ownership relationships (a user's data goes away with the user) and
  `on delete set null`/`cascade` for softer references depending on
  whether the referencing row is still meaningful without it (see
  `orders.scan_result_id` vs. `positions.connection_id`).
- `broker_connections` stores encrypted credentials (via `lib/crypto.ts`),
  not plaintext — see `SECURITY.md`. Never add a column here that stores a
  broker secret unencrypted.

## Adding a migration

1. New file: `000N_description.sql`, N = next sequential number.
2. Enable RLS and add ownership policies in the same file as the table
   definition.
3. If the change affects what `IMPLEMENTATION.md`'s schema overview or this
   file's table list describes, update those too.
