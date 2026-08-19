# Security

GSPS handles real brokerage credentials and executes real trades. This
document covers how secrets are protected in this codebase, and what to do
if one is exposed.

## What's sensitive

| Secret | Where it lives | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env var | Bypasses Row Level Security. Server-only, never sent to the client. |
| `CREDENTIALS_ENCRYPTION_KEY` | Vercel env var | 32-byte base64 AES-256-GCM key. Encrypts broker credentials at rest in `broker_connections` (`lib/crypto.ts`). If this key is lost, every stored broker credential becomes unrecoverable. If it leaks, every stored broker credential must be treated as compromised. |
| `CREDENTIALS_ENCRYPTION_KEY_PREVIOUS` | Vercel env var | Set only during a rotation window. `decryptJson()` tries the current key first, then this one, so rows encrypted under the old key keep decrypting until `scripts/rotate-credentials-key.mjs` re-encrypts them. Remove once rotation finishes. |
| `ALPACA_API_KEY` / `ALPACA_API_SECRET` | Vercel env var | Market-data credentials, and the paper keys for reference lookups. No longer used to trade on any user's behalf — paper trading is simulated (see below). |
| `ALPACA_LIVE_API_KEY` / `ALPACA_LIVE_API_SECRET` | Vercel env var | Live-money trading. Treat as high-severity if leaked — real funds are reachable. |
| `SNAPTRADE_CLIENT_ID` / `SNAPTRADE_CONSUMER_KEY` | Vercel env var | Lets the app act as a SnapTrade partner; a leak lets an attacker impersonate the app to SnapTrade's API. |
| `CRON_SECRET` | Vercel env var | Bearer token gating `/api/market-scan`. Low severity if leaked (worst case: someone triggers an extra scan), but rotate anyway. |
| `STRIPE_SECRET_KEY` | Vercel env var | Full account access at Stripe (create charges, issue refunds, read customer data). Treat as high-severity if leaked. |
| `STRIPE_WEBHOOK_SECRET` | Vercel env var | Verifies `/api/billing/webhook` requests actually came from Stripe (`stripe.webhooks.constructEvent`). Without this check anyone could POST a fake `checkout.session.completed` and grant themselves a paid tier — never skip signature verification on that route. |
| `TRADING_DISABLED` | Vercel env var | Not a secret — an operational control. Set to exactly `true` to refuse every order placement and position close app-wide (`lib/trade/kill-switch.ts`). Use it during an incident instead of removing the Alpaca keys, which would also break read-only portfolio and scanner views. |
| Per-user broker credentials | Supabase `broker_connections` table | Stored via `encryptJson()` (`lib/crypto.ts`), not plaintext. Decrypted only server-side, only when a request needs to call the broker. |

## Paper trading is simulated, not brokered

Paper mode has no external broker. `lib/brokers/simulator.ts` fills orders
synchronously against the live market-data feed and writes to this app's own
`paper_accounts`, `positions` and `orders` tables, every one of which carries
`user_id` and RLS. Isolation between users is therefore the same RLS guarantee
every other per-user table relies on, not something the trading code has to
enforce for itself.

This replaced a shared arrangement in which every signed-in user traded one
Alpaca paper account from server-side keys, and could see and act on whatever
that account held. Two rules keep it from coming back:

- **No paper code path may take brokerage credentials.** `envCreds()` survives
  only for read-only reference lookups (`/api/assets`, `/api/options/chain`) and
  for live trading. A new paper call site that reaches for it is a regression,
  not a shortcut.
- **Live trading is the case that still needs per-user credentials.** It is
  refused at the route today (`/api/orders` rejects `mode: "live"`), and the
  per-user connection work is what unblocks it. Until then no live path should
  be wired to app-level keys for anything a user initiates.

`ALPACA_API_KEY` / `ALPACA_API_SECRET` remain configured because market data
uses them. They are no longer a trading credential for any user-facing path.

## Halting trading

`TRADING_DISABLED=true` refuses every order placement and position close
app-wide (`lib/trade/kill-switch.ts`). Prefer it to removing the Alpaca keys
during an incident: the keys also serve market data, so pulling them takes the
scanner and the charts down alongside trading. Anything other than exactly
`true` leaves trading enabled, so the switch cannot be thrown — or released —
by a typo.

## Rules for this codebase

- **Never** log a secret, an API key, or a decrypted credential — not even at `debug` level. Logs are not treated as a secure destination.
- **Never** return a secret or decrypted credential in an API response body. Broker-derived data returned to the client (positions, orders, balances) is fine; the credentials used to fetch it are not.
- API keys and encryption happen **server-side only**. Nothing under `lib/data/*` or `lib/brokers/*` should be imported into a client component.
- New endpoints that call an external broker or persist trades must go through the existing credential/encryption helpers (`lib/crypto.ts`, `lib/brokers/*`) rather than reinventing key handling.
- Any endpoint meant to be invoked by Vercel Cron (not a logged-in user) must check a bearer secret, following the pattern in `app/api/market-scan/route.ts`.

## If a secret leaks

1. **Rotate it immediately** at the provider (Supabase, Alpaca, SnapTrade, the data provider) and update the Vercel env var.
2. For `CREDENTIALS_ENCRYPTION_KEY` specifically: move the current value to `CREDENTIALS_ENCRYPTION_KEY_PREVIOUS`, set the new value as `CREDENTIALS_ENCRYPTION_KEY`, deploy, then run `node scripts/rotate-credentials-key.mjs` to re-encrypt every `broker_connections` row under the new key. Once it reports zero rows left on the previous key, remove `CREDENTIALS_ENCRYPTION_KEY_PREVIOUS` and redeploy. No user needs to relink a brokerage account for this — see `lib/crypto.ts`.
3. For live Alpaca keys: rotate the key and check the Alpaca account activity log for unauthorized orders before doing anything else.
4. Confirm the leaked value isn't still present in git history (`git log -p`, or a secret-scanning tool) before considering the incident closed.

## Data retention

Historical scan data is retained for `DATA_RETENTION_WINDOW_LABEL` (`lib/config.ts`) — currently 6 years. Any UI copy, docs, or schema logic describing retention duration must read from that constant rather than hardcoding a number, so a future retention change is a one-line edit instead of a text search across the codebase.

## Reporting a vulnerability

This is currently a single-maintainer project without a public bug bounty.
If you find a vulnerability, report it privately to the repository owner
rather than opening a public issue.
