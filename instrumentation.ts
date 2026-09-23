import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

export async function register() {
  if (isDev) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "production",
      tracesSampleRate: 0.1,
      debug: false,
      enabled: !!process.env.SENTRY_DSN,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV || "production",
      tracesSampleRate: 0.1,
      debug: false,
      enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    });
  }
}

/**
 * The other half of "structured error logging" plumbing — `Sentry.init`
 * above only starts the SDK; without this export, Sentry never actually
 * sees a server-side error (a thrown error in a Server Component render, a
 * route handler, or a server action). This is the file convention's own
 * documented hook for that (node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/instrumentation.md's `onRequestError`
 * section — this fork's docs, checked per AGENTS.md's "not the Next.js you
 * know" note, since this is a hook whose shape a training-data assumption
 * could get wrong). `Sentry.captureRequestError` is the SDK's own adapter
 * for this exact signature.
 */
export const onRequestError = Sentry.captureRequestError;
