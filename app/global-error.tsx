"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root-level error boundary. `instrumentation.ts`'s `onRequestError` hook
 * covers server-side errors (Server Component rendering, route handlers);
 * this is the client-side half — a React render error that escapes every
 * nested `error.tsx` (none exist yet) reaches here instead of a blank
 * white screen. Reports to Sentry the same way the SDK's own docs pattern
 * does, and is a no-op when SENTRY_DSN isn't set (see instrumentation-client.ts's
 * `enabled` flag) — captureException just has nowhere to send it.
 *
 * `unstable_retry`, not `reset` — this fork's file-convention prop name;
 * see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md.
 *
 * Must define its own <html>/<body> (this file replaces the root layout
 * when active) — kept deliberately minimal rather than pulling in this
 * app's fonts/nav, since the error that triggered this may be in the
 * layout itself.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: "#64748b", maxWidth: "28rem" }}>
          GSPS hit an unexpected error. It&apos;s been reported — try again, or come back in a
          moment.
        </p>
        <button
          onClick={() => unstable_retry()}
          style={{
            borderRadius: "0.5rem",
            border: "1px solid #cbd5e1",
            padding: "0.5rem 1rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
