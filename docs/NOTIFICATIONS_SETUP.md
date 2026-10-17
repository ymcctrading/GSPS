# Notifications Setup Guide

**Status:** Resend (email) + Sentry (error logging) integrated
**Last updated:** 2026-08-19

---

## What's Wired Up

### Email Notifications (Resend)

- **Free tier:** 100 emails/day
- **Alert template:** HTML email with symbol, direction, score, entry/stop/target levels
- **Logging:** All sent emails logged to `notification_log` table with delivery status
- **API:** `POST /api/notifications/send-test` — triggers a test email to your account

**Implementation:**
- `lib/notifications/resend-handler.ts` — email composition + send logic
- Resend API key read from `RESEND_API_KEY` env var
- Errors logged to console + Sentry

### Error Logging (Sentry)

- **Free tier:** 100,000 events/month
- **Session replay:** Enabled on errors (0.1% sample rate in production)
- **Dashboard:** https://sentry.io/organizations/

**Implementation:**
- `instrumentation.ts` — server/edge initialization
- Configured to disable in development (to avoid noise)
- All Next.js errors automatically captured

---

## Testing the Setup

### 1. Send a Test Alert Email

```bash
curl -X POST http://localhost:3000/api/notifications/send-test \
  -H "Authorization: Bearer <your_auth_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "direction": "bullish",
    "score": 7,
    "entry": 150.25,
    "stopLoss": 148.5,
    "takeProfit": 155.0,
    "verdict": "Execute"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "message": "Test alert sent to your-email@example.com",
  "emailId": "re_..."
}
```

Check your email in ~10 seconds.

### 2. View Notification Log

```bash
curl -X GET "http://localhost:3000/api/notifications/log?limit=10" \
  -H "Authorization: Bearer <your_auth_token>"
```

### 3. Test Error Logging (Sentry)

Trigger an error in your app — it will appear in your Sentry dashboard within 10 seconds.

---

## Next Steps

### Wire Into Alert Generation

When a scan produces an "Execute" verdict, the notification system should trigger automatically:

```typescript
// In scan logic (e.g., lib/strat/scan.ts)
if (verdict === 'Execute') {
  await sendAlertEmail({
    userEmail: user.email,
    symbol: ticker,
    direction: direction,
    score: score,
    entry: entryPrice,
    stopLoss: stopPrice,
    takeProfit: targetPrice,
    verdict: 'Execute',
    confidence: confidence,
  });
}
```

### Multi-Channel Support

Three channels exist today. SMS is still the one that doesn't deliver.

| Channel | Status | Opt-in? |
|---|---|---|
| In-app bell | Live | No — always written |
| Web Push | Live | Yes, twice: `push_enabled` **and** a registered device |
| Email | Live (but see the Resend sandbox row in Troubleshooting) | `email_enabled` |
| SMS | Not built | — |

The in-app bell is deliberately not opt-in: it has no external provider and
no send cost, so a member sees every alert on the platform itself whatever
their other toggles say. This is what keeps a dead email provider from
meaning a member sees nothing.

## Web Push setup

Push needs a VAPID keypair — one per deployment environment, generated once.
Rotating it invalidates every row in `push_subscriptions`, so every member
would have to re-enable alerts on every device. Generate once and keep it.

```bash
node scripts/generate-vapid-keys.mjs
```

Set the four variables it prints (Vercel dashboard for production,
`.env.local` for development), then redeploy:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY` — **server-side only.** Never prefix it
  `NEXT_PUBLIC_`, which would ship a signing credential to every browser.
- `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` — the same public key, which the
  browser needs in order to subscribe
- `WEB_PUSH_VAPID_SUBJECT` — a `mailto:` a push service can reach you at
  (RFC 8292)

Absent these, `isWebPushConfigured()` is false and every push send no-ops
with a stated reason — the deployment degrades to the in-app bell rather
than failing a scan.

Also apply migration `0088_push_subscriptions.sql` (and
`0087_in_app_notifications_watch_verdict.sql`, without which every intraday
bell write fails its check constraint). **Merging a migration is not
applying it** — see the Strategy Modes production-verification note in
AGENTS.md for what that cost last time.

### Enabling it as a member

Settings → Notifications → tick **Push**, then **Enable on this device**.
Per device, by construction: a push subscription belongs to one browser on
one device, so enabling it on a laptop does nothing for a phone. **Send a
test alert** proves the whole path, from the server through the push service
to the tray.

**On iPhone, the site must be added to the home screen first** (Safari →
Share → Add to Home Screen, then open it from there). Safari grants
notification permission to installed web apps only; before that, the browser
has no `PushManager` at all and the UI says so rather than offering a button
that cannot work.

### Scheduled Digest (Future Sprint 3)

Email digest of daily signals (morning wrap-up):
- Top 5 alerts by score
- Win/loss on yesterday's trades
- P&L summary
- Pattern performance

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Email not received | Check spam folder; verify email address in auth |
| "RESEND_API_KEY not set" | Ensure `.env.local` has `RESEND_API_KEY=re_...` |
| Resend 403 "can only send testing emails to your own email address" | Every send still uses Resend's sandbox sender (`onboarding@resend.dev`), which only delivers to `RESEND_SANDBOX_RECIPIENTS` (defaults to this account's verified address). Anyone else is skipped with a logged reason rather than erroring — see the guard in `lib/notifications/resend-handler.ts`. Fixed permanently by verifying a domain at resend.com/domains and moving the `from` addresses off `onboarding@resend.dev`, at which point this env var and its guard should be removed. |
| Push enabled but nothing arrives on the phone | Check it was enabled *on that phone* — a subscription is per device. Then **Send a test alert** in Settings, which names the failing link (no VAPID keys on the deployment, no registered device, or a registration the push service has expired). |
| No "Enable on this device" button at all | The browser has no `PushManager`. On iPhone this means GSPS isn't on the home screen yet (Safari → Share → Add to Home Screen); it's also expected in a private window. |
| Sentry not capturing errors | Check `NEXT_PUBLIC_SENTRY_DSN` is set; errors only sent to prod/staging |
| Rate limit (100/day) | Resend free tier cap; upgrade plan if needed. Shared across alert emails, auth confirmation emails (see `docs/AUTH_EMAIL_SETUP.md`), order-invalidation emails, and the daily trade-journal digest (`/api/trade-journal/daily-email`, one email per user with a closed trade, 2 hours after close) — all draw from the same 100/day cap. |

---

## Architecture

```
Scan produces verdict (Execute)
    ↓
Check notification_preferences (enabled channels, quiet hours)
    ↓
Check notification_log (avoid duplicate signal_hash)
    ↓
Send email via Resend
    ↓
Log in notification_log (status: sent/failed)
    ↓
User receives email in <10s
```

---

## Environment Variables

- `RESEND_API_KEY` — required for email sends
- `WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_SUBJECT` — required for Web Push (see "Web Push setup" above). The private key is server-side only.
- `RESEND_SANDBOX_RECIPIENTS` — comma-separated allowlist for Resend's sandbox sender (see Troubleshooting); defaults to this account's verified address if unset
- `NEXT_PUBLIC_SENTRY_DSN` — client-side error tracking
- `SENTRY_DSN` — server-side error tracking

All three should be set in `.env.local` for development and Vercel dashboard for production.
