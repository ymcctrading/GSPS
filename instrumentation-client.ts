import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

// This module re-executes on every fresh client boot, including the one
// `global-error.tsx` forces after a stale-chunk reload — so a successful
// boot is exactly the right signal to clear that reload guard. See
// `STALE_CHUNK_RELOAD_KEY`'s own comment in global-error.tsx for why the
// guard exists.
try {
  sessionStorage.removeItem("gsps-stale-chunk-reload");
} catch {
  // sessionStorage can throw in a locked-down browsing context (private
  // mode, disabled storage); the guard simply won't self-clear there.
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || "production",
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: isDev ? 0 : 0.1,
  replaysSessionSampleRate: isDev ? 0 : 0.1,
  replaysOnErrorSampleRate: isDev ? 0 : 1.0,
  debug: isDev,
  enabled: !isDev && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
