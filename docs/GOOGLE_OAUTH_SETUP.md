# Google Sign-In Setup

**Status:** Code path is correct and matches Supabase's documented flow. The
"Continue with Google" button not working is a configuration gap, not a code
bug — and like the Auth SMTP setup (`docs/AUTH_EMAIL_SETUP.md`), the missing
pieces live in dashboards this codebase's tooling has no access to.

## How the button is supposed to work

`components/auth/auth-form.tsx`'s `handleGoogle` calls
`supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`.
That redirects the browser to Supabase's own `/authorize` endpoint, which
redirects to Google, which redirects back to Supabase's fixed OAuth callback,
which redirects back to this app's `/auth/callback` route
(`app/auth/callback/route.ts`), which exchanges the code for a session and
sends the user on to `next`. This is the standard Supabase OAuth flow — there
is no missing code here.

## Why it doesn't work today

Checked the project's `auth_logs` for the last 24 hours: **zero** requests to
`/authorize` at all. Two things have to be true simultaneously for Google
sign-in to work, and evidence points at both being unset:

1. **Google provider not configured in Supabase.** No `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` (or equivalent) appears anywhere in this repo's env
   files — for Supabase-managed OAuth, those credentials live in the Supabase
   Dashboard, not in this app's own environment, so their absence here is
   expected either way, but it means there's no record of them having been
   entered in the dashboard either.
2. **No corresponding Google Cloud OAuth client**, or one exists but its
   authorized redirect URI doesn't match Supabase's.

## Required manual steps (cannot be done from this codebase)

### 1. Google Cloud Console

- Create (or open) an OAuth 2.0 Client ID of type **Web application** at
  https://console.cloud.google.com/apis/credentials.
- **Authorized redirect URIs** — add Supabase's fixed callback, not this
  app's:
  ```
  https://vebhpmmzxixlhujlptue.supabase.co/auth/v1/callback
  ```
- **Authorized JavaScript origins** — add the app's domain(s), e.g.
  `https://gsps.vercel.app` (and any preview domain(s) actually used for
  testing sign-in, if needed).
- Copy the generated **Client ID** and **Client Secret**.

### 2. Supabase Dashboard

- **Authentication → Providers → Google**: toggle it on, paste the Client ID
  and Client Secret from step 1, save.
- **Authentication → URL Configuration → Redirect URLs**: make sure this
  app's own callback is listed, e.g. `https://gsps.vercel.app/auth/callback`
  (plus `http://localhost:3000/auth/callback` for local dev) — this is the
  allow-list Supabase checks before it will redirect back to `next` after the
  Google handshake completes; a URL not on this list gets silently rejected
  even with the provider correctly configured.

### 3. Verify

Click "Continue with Google" on `/signup` or `/login`. If it still fails,
the button now surfaces a specific message when the provider itself isn't
enabled ("Google sign-in isn't set up on this account yet...") — check
`auth_logs` for entries on `/authorize` to see how far the request got.
