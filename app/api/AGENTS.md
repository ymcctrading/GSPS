# app/api — API Routes

## Cron-invoked endpoints

Only `/api/market-scan` is cron-invoked, but not by a single scheduler: the
17:30 ET run is a native Vercel Cron entry in `vercel.json`, and the 08:30 ET
run is a GitHub Actions schedule (`.github/workflows/premarket-scan.yml`)
calling the same route over HTTPS with the same secret. Both checks a bearer
secret before doing anything:

```ts
const auth = req.headers.get("authorization");
if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Follow this pattern for any new endpoint meant to run on a schedule rather
than in response to a user action.

**Before adding a new cron entry to `vercel.json`**, check
`docs/THIRD_PARTY_LIMITS.md` — the project is on the Vercel Hobby plan,
capped at 2 cron jobs total, each running at most once/day.
`/api/market-scan` only occupies one of those two slots now (the other run
moved to GitHub Actions, above), leaving one Vercel cron slot free for the
next daily job — a broker-token refresh, a reconciliation sweep, etc. If you
need something to run more often than daily, it does not belong in
`vercel.json` regardless of slot availability — use an external scheduler
hitting the route over HTTPS instead, following the `premarket-scan.yml`
pattern.

## Read-through data proxies

`/api/crypto`, `/api/forex`, and `/api/futures` fetch live data from an
external provider and return it — they don't persist anything and aren't
on a cron schedule (that was tried and removed; see `CHANGELOG.md`). They
exist to be called on-demand by the frontend. If you add persistence to one
of these (e.g. writing to Supabase), that changes whether a cron makes
sense for it — reconsider the schedule question at that point, don't just
add one back reflexively.

## GETs that advance state, and why

Two GETs deliberately write before they respond. Both exist because the
Hobby plan's cron cap (see above) leaves no scheduler to run them, and both
do work that is worthless if it happens after the user has read the answer:

- `GET /api/orders` reconciles the order ledger against the broker, and then
  advances every working staged exit (`lib/trade/exit-manager.ts`) — moving
  the trailing stop, arming the master-target reversal, retiring finished
  plans. The Portfolio polls this endpoint, so it is the app's only regular
  sample of where price has been. If you make the Portfolio stop polling it,
  those rules stop advancing; say so somewhere the user will see it.
- `GET /api/trade-log` settles pending trade logs from the broker's fills
  before reading the table back, so the log is completed by the act of
  looking at it.

Both are safe to call repeatedly: a pass with nothing to do issues no broker
calls and writes no rows. Keep that property — these run on a 10-second
timer.

Neither may invent a value it couldn't read. An exit price that hasn't
filled stays null and the row stays `pending`, counted in the response. A
broker read that fails is reported (`sync.syncError`, `exits.error`,
`settlement.error`), never swallowed into a default that looks like data.

## Auth pattern for user-facing endpoints

Endpoints that act on behalf of a logged-in user (orders, portfolio,
trade-log, snaptrade/*) rely on the Supabase session — see
`lib/supabase/server.ts`. Don't bypass this with a service-role client
except where the endpoint genuinely needs to act outside a user's RLS
scope (e.g. the cron-secret-gated market scan).

## Response conventions

- Errors: `{ "error": "<message>" }` with an appropriate HTTP status —
  `400` for bad input, `401`/`403` for auth, `502` for an upstream
  provider failure (including a missing API key for that provider).
- Never include a secret, API key, or decrypted broker credential in a
  response body or log line — see `SECURITY.md`.
