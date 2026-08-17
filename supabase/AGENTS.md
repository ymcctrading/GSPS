# supabase — Migrations & Schema

## Tables (as of migration `0015`)

Core: `profiles`, `watchlists`, `watchlist_items`, `scan_results`,
`daily_scans`, `broker_connections`, `orders`, `positions`, `settings`,
`user_automation_profiles`, `platform_transaction_revenue_ledger`,
`scan_runs`, `trade_logs`.

Learning instrumentation (`0005`): `scan_events`, `signal_lifecycle_events`,
`execution_events`, `user_actions`, `learning_models`,
`learning_coefficients`, `learning_audit_log`. Written via the service role
from `lib/learning/db.ts`; RLS is on with no user-facing policy, which is
intentional deny-all for these — there's no per-user ownership concept for a
global model table, only server-side access.

Intraday scanning (`0013`): `intraday_alerts`.

Protocol exits and paper trading (`0009`–`0012`): `protocol_exits`,
`paper_accounts`, plus the `increment_paper_cash` and `execute_position_fill`
RPC functions.

`daily_scans` is what `/api/market-scan` writes to and what the dashboard
reads for its bullish/bearish signals — see `app/api/AGENTS.md`.

`orders` and `positions` also carry option-contract economics (purchase
price, contract cost, a greeks snapshot), which protocol target was hit
(`tp1_hit_at`/`mp_hit_at`/`sl_hit_at`), and a generated `asset_type`
(`'EQUITY' | 'OPTION'`) derived from `asset_class` — see `0015` and `0004`.

## Conventions established by existing migrations

- **Numbered, sequential migration files**: `0001_initial_schema.sql`,
  `0002_trade_logging.sql`, `0015_order_greeks_and_targets.sql`,
  `0004_asset_type_flag.sql`. Keep this pattern —
  `000N_short_description.sql` — rather than timestamp-based names. **Number
  is not chronology.** `0004_asset_type_flag.sql` was applied last of a
  three-migration batch that also produced `0014`/`0015`, because those two
  didn't get their real numbers until this reconciliation — see below.
- **A number claimed by two files is a landmine, not a style nit.** `0003`
  and `0008` each named two different migrations for a while — one file per
  PR, merged independently, neither aware of the other. Both collisions
  applied fine here because migrations were applied directly rather than
  through `supabase db push`, but that tool tracks applied migrations by
  the leading number: given a real duplicate, it treats the first as
  proof the second is already applied and silently skips it. Before adding
  `000N_description.sql`, check `ls supabase/migrations/` for `N` already
  in use — don't trust the last commit you saw.
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

1. Check `ls supabase/migrations/` for the actual highest `N` right before
   you name the file — not the highest `N` you last saw in the repo. Two
   branches picking the same next number independently is exactly how `0003`
   and `0008` happened.
2. New file: `000N_description.sql`, N = next sequential number.
3. Enable RLS and add ownership policies in the same file as the table
   definition.
4. If the change affects this file's table list, update it too.
   `IMPLEMENTATION.md`'s "Database Schema Overview" is separately and much
   more badly stale (it names tables — `users`, `trades`, `user_watchlists`
   — that don't exist in this schema at all) and is not kept in sync by this
   step; fixing it is its own task.
5. Apply the migration and confirm it landed — `list_migrations` — before
   merging. A migration that only exists as a file in the repo is not a
   migration; it's a claim about the database that may or may not be true. If
   the migration adds a column a concurrently-deploying feature will write
   to, land the migration first — see `docs/DEPLOYMENT_SOP.md`'s note on
   migration ordering.

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
