# supabase — Migrations & Schema

## Tables (as of migration `0004`)

`profiles`, `watchlists`, `watchlist_items`, `scan_results`, `daily_scans`,
`broker_connections`, `orders`, `positions`, `settings`, `trade_logs`.

`daily_scans` is what `/api/market-scan` writes to and what the dashboard
reads for its 15 bullish/15 bearish signals — see `app/api/AGENTS.md`.

`orders` and `positions` also carry option-contract economics (purchase
price, contract cost, a greeks snapshot), which protocol target was hit
(`tp1_hit_at`/`mp_hit_at`/`sl_hit_at`), and a generated `asset_type`
(`'EQUITY' | 'OPTION'`) derived from `asset_class` — see `0003` and `0004`.

## Conventions established by existing migrations

- **Numbered, sequential migration files**: `0001_initial_schema.sql`,
  `0002_trade_logging.sql`, `0003_order_greeks_and_targets.sql`,
  `0004_asset_type_flag.sql`. Keep this pattern —
  `000N_short_description.sql` — rather than timestamp-based names.
- **Derive, don't duplicate.** `asset_type` (`0004`) is a `generated always
  as` column computed from `asset_class` rather than a second value the app
  has to keep in sync — two independent flags on the same row that could
  disagree is a data-integrity bug waiting to happen. Prefer a generated
  column over a parallel flag when the new field is fully determined by an
  existing one.
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

## Edge functions

`functions/<slug>/` holds the source of what is deployed to Supabase Edge
Functions. Keep it in sync with the deployed body in both directions — a
function edited only in the Supabase dashboard is code running against this
database that no review, test or grep can see. `daily-scan` is the cautionary
tale: it wrote `daily_scans` every weekday for two weeks, falling back to
invented prices, while nothing in this repo mentioned it.

`daily-scan` is now a retired stub (410, writes nothing, `verify_jwt` on) and
its pg_cron schedule is gone via `0007`. The daily scan is `/api/market-scan`
in the Next.js app.

Deno code is excluded from `tsconfig.json` and the ESLint config — it doesn't
run on the Node/Next toolchain and shouldn't be judged by it.
