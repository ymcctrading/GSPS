# lib/brokers — Broker Integrations

## Alpaca

`alpaca.ts` handles both paper and live trading through the same code
path — only the base URL and credentials differ (`envCreds(mode)`).

- Paper credentials accept several env var aliases for compatibility
  (`ALPACA_API_KEY`, `ALPACAP_API`, `ALPACA_KEY_ID`, `APCA_API_KEY_ID`, and
  the matching secret aliases) — see `envCreds()`. If you add a new call
  site that needs credentials, use `envCreds()` rather than reading
  `process.env.ALPACA_*` directly, so it stays consistent with whichever
  alias is actually set.
- Live credentials (`ALPACA_LIVE_API_KEY`/`ALPACA_LIVE_API_SECRET`) reach
  real money. Anything touching live mode should be treated as
  security-sensitive — see `SECURITY.md`.
- Per-user live credentials (as opposed to the app-level env defaults) come
  from the `broker_connections` table, encrypted via `lib/crypto.ts`. Never
  add a code path that stores a broker credential in plaintext.

## SnapTrade

`snaptrade.ts` links external brokerages (Webull, Robinhood, Schwab, etc.)
via SnapTrade's hosted connection portal. The entire integration is
feature-flagged: `isSnapTradeEnabled()` gates every function, and without
`SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY` set, callers should treat it
as unavailable (UI shows "coming soon") rather than erroring loudly.

- `registerSnapTradeUser()` / `connectionPortalUrl()` — onboarding a new
  linked account. The returned `userSecret` is sensitive — store it the
  same way other broker credentials are stored (encrypted), never logged.
- `listAccounts()` / `listPositions()` — read-only account data.

## Adding a new broker

1. New module here, following the existing pattern: a feature-flag check
   function, credential resolution, and thin wrappers around the broker's
   SDK/API.
2. Credentials go through `lib/crypto.ts` if stored per-user, or plain env
   vars if app-level — document which in `.env.example`.
3. Note the broker's rate limits in `docs/THIRD_PARTY_LIMITS.md`.
4. Update `SECURITY.md`'s secrets table with the new credential(s).
