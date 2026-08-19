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
