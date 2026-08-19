# Auth Confirmation Emails

**Status:** Root cause identified. Fix requires one manual step in the
Supabase dashboard that no tool available to this codebase's agent can
perform — see "Required manual step" below.

## The bug

New signups stopped receiving the "confirm your account" email. Signing up
again from the same address didn't fix it: Supabase Auth logs show the
account already existed and unconfirmed, and returns `user_repeated_signup`
— a **200**, not an error — every time (confirmed in the project's
`auth_logs` for `ymcctrading@gmail.com`, two repeat signups within 3
minutes on 2026-08-19, both `user_repeated_signup`, neither followed by a
`login`).

Supabase intentionally returns success on a repeat signup rather than
revealing that the email is already registered (email-enumeration
protection). That's correct behavior. The actual problem is upstream of the
app: `supabase.auth.signUp()` only *sends mail through whatever the
project's Auth is configured to send mail through*, and this project has
never had a custom SMTP provider configured for Auth. It's running on
Supabase's built-in test mailer, which is capped at a **handful of emails
per hour, project-wide** — shared across every signup, password reset, and
magic link across all users. `RESEND_API_KEY` (see
`docs/NOTIFICATIONS_SETUP.md`) only covers this app's own trade-alert
emails, sent via `lib/notifications/resend-handler.ts`; it is not wired
into Supabase Auth's mailer at all, so it does nothing for confirmation
emails today.

Net effect: the first few confirmations of the day go out, then the
project-wide cap is hit and every confirmation after that is silently
dropped — no error surfaces to the signup form, because Auth accepted the
request; it just couldn't send.

## Required manual step (cannot be done from this codebase)

Point Supabase Auth's mailer at Resend's SMTP relay, using the same
`RESEND_API_KEY` already in the Vercel env:

1. Supabase Dashboard → **this project** → **Project Settings → Authentication → SMTP Settings**.
2. Enable **Custom SMTP** and fill in:
   - Host: `smtp.resend.com`
   - Port: `465` (SSL) or `587` (STARTTLS)
   - Username: `resend`
   - Password: the `RESEND_API_KEY` value
   - Sender email: an address on a domain verified in the Resend dashboard
     (Resend's sandbox domain will not deliver to arbitrary recipients)
   - Sender name: `GSPS`
3. Save, then send a real test signup to confirm delivery.

This raises the send cap to Resend's own (100/day on the free tier — see
`docs/NOTIFICATIONS_SETUP.md`), which is shared with the app's alert
emails, so keep an eye on `docs/THIRD_PARTY_LIMITS.md` if that volume grows.

## What the app can fix, and what's shipped

The signup form (`components/auth/auth-form.tsx`) previously gave no way to
retry a swallowed confirmation email short of re-submitting the whole signup
form (which just produces another silent `user_repeated_signup`). It now
shows a **"Resend confirmation email"** button once a signup completes
without a session, calling `supabase.auth.resend({ type: "signup", email })`
directly — the same underlying send, but explicitly retriggerable without
resubmitting credentials, and it surfaces Supabase's own rate-limit error
message if the resend itself is throttled.

This does not fix the underlying cap — only the manual SMTP step above
does that — but it stops users from being stuck with no visible next step
while the cap resets.
