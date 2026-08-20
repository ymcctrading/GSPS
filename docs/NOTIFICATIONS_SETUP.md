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

### Multi-Channel Support (Future)

Once SMS + push become available (Twilio, OneSignal, etc.):
1. Check user's `notification_preferences` for enabled channels
2. Skip if in quiet hours (`is_in_quiet_hours()`)
3. Avoid duplicates via `signal_hash`
4. Send to enabled channels in parallel

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
- `NEXT_PUBLIC_SENTRY_DSN` — client-side error tracking
- `SENTRY_DSN` — server-side error tracking

All three should be set in `.env.local` for development and Vercel dashboard for production.
