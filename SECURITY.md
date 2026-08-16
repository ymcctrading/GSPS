# Security

GSPS handles real brokerage credentials and executes real trades. This
document covers how secrets are protected in this codebase, and what to do
if one is exposed.

## What's sensitive

| Secret | Where it lives | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env var | Bypasses Row Level Security. Server-only, never sent to the client. |
| `CREDENTIALS_ENCRYPTION_KEY` | Vercel env var | 32-byte base64 AES-256-GCM key. Encrypts broker credentials at rest in `broker_connections` (`lib/crypto.ts`). If this key is lost, every stored broker credential becomes unrecoverable. If it leaks, every stored broker credential must be treated as compromised. |
| `ALPACA_API_KEY` / `ALPACA_API_SECRET` (paper) | Vercel env var | App-level default paper-trading credentials. |
| `ALPACA_LIVE_API_KEY` / `ALPACA_LIVE_API_SECRET` | Vercel env var | Live-money trading. Treat as high-severity if leaked — real funds are reachable. |
| `SNAPTRADE_CLIENT_ID` / `SNAPTRADE_CONSUMER_KEY` | Vercel env var | Lets the app act as a SnapTrade partner; a leak lets an attacker impersonate the app to SnapTrade's API. |
| `CRON_SECRET` | Vercel env var | Bearer token gating `/api/market-scan`. Low severity if leaked (worst case: someone triggers an extra scan), but rotate anyway. |
| `TRADING_DISABLED` | Vercel env var | Not a secret — an operational control. Set to exactly `true` to refuse every order placement and position close app-wide (`lib/trade/kill-switch.ts`). Use it during an incident instead of removing the Alpaca keys, which would also break read-only portfolio and scanner views. |
| Per-user broker credentials | Supabase `broker_connections` table | Stored via `encryptJson()` (`lib/crypto.ts`), not plaintext. Decrypted only server-side, only when a request needs to call the broker. |

## Shared brokerage account — a known limitation

Every signed-in user currently trades **one** Alpaca paper account, whose keys
live in `ALPACA_API_KEY` / `ALPACA_API_SECRET`. The broker therefore reports one
book for all users, and it cannot answer "whose position is this?".

Two containment rules follow, and both are load-bearing:

- **Ownership is decided by our own ledger, never by the broker.**
  `lib/portfolio/ownership.ts` derives each user's holding from their
  `positions` and `protocol_exits` rows. Any endpoint that *acts on* or
  *reports* a broker position must resolve ownership through it first.
- **A close is always sent with an explicit quantity.** `closePosition` with no
  quantity liquidates the account's entire position in a symbol — everyone's.
  There is no legitimate call site for the two-argument form.

Consequences that are accepted while the account is shared: cash and buying
power are not reported per user (they cannot be divided honestly), `avgEntry` on
a symbol two users both hold is the account's blended average, and a user's
closed position is not reconciled away while another user still holds the same
symbol. All three resolve with per-user brokerage connections.

## Rules for this codebase

- **Never** log a secret, an API key, or a decrypted credential — not even at `debug` level. Logs are not treated as a secure destination.
- **Never** return a secret or decrypted credential in an API response body. Broker-derived data returned to the client (positions, orders, balances) is fine; the credentials used to fetch it are not.
- API keys and encryption happen **server-side only**. Nothing under `lib/data/*` or `lib/brokers/*` should be imported into a client component.
- New endpoints that call an external broker or persist trades must go through the existing credential/encryption helpers (`lib/crypto.ts`, `lib/brokers/*`) rather than reinventing key handling.
- Any endpoint meant to be invoked by Vercel Cron (not a logged-in user) must check a bearer secret, following the pattern in `app/api/market-scan/route.ts`.

## If a secret leaks

1. **Rotate it immediately** at the provider (Supabase, Alpaca, SnapTrade, the data provider) and update the Vercel env var.
2. For `CREDENTIALS_ENCRYPTION_KEY` specifically: rotating it invalidates every already-encrypted row in `broker_connections`. Users will need to relink their brokerage accounts. There is currently no re-encryption/migration path — treat key rotation here as a last resort, not a routine action.
3. For live Alpaca keys: rotate the key and check the Alpaca account activity log for unauthorized orders before doing anything else.
4. Confirm the leaked value isn't still present in git history (`git log -p`, or a secret-scanning tool) before considering the incident closed.

## Data retention

Historical scan data is retained for `DATA_RETENTION_WINDOW_LABEL` (`lib/config.ts`) — currently 6 years. Any UI copy, docs, or schema logic describing retention duration must read from that constant rather than hardcoding a number, so a future retention change is a one-line edit instead of a text search across the codebase.

## Reporting a vulnerability

This is currently a single-maintainer project without a public bug bounty.
If you find a vulnerability, report it privately to the repository owner
rather than opening a public issue.
