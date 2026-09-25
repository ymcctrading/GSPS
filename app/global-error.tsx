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
 *
 * Stale-chunk auto-recovery: every production deploy replaces the JS chunk
 * files on the CDN, so a browser tab left open (or resumed) from before a
 * deploy fails its next code-split import with no chunk to fetch — the
 * classic `ChunkLoadError` / "Failed to fetch dynamically imported module".
 * That is a stale-client problem, not a real application error, and the fix
 * is a normal reload (it re-fetches the current HTML/JS), not the dead-end
 * "Try again" button, which just re-runs the same stale bundle and fails
 * the same way. Detected here rather than a hook higher up because this is
 * the one boundary guaranteed to see every such failure, from any route.
 * `STALE_CHUNK_RELOAD_KEY` guards against a reload loop if the reload
 * itself doesn't fix it (e.g. the CDN is still mid-deploy); it's cleared on
 * every successful client boot by instrumentation-client.ts.
 */
const STALE_CHUNK_RELOAD_KEY = "gsps-stale-chunk-reload";

function isStaleChunkError(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    /loading chunk .* failed/i.test(error.message) ||
    /failed to fetch dynamically imported module/i.test(error.message) ||
    /importing a module script failed/i.test(error.message)
  );
}

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);

    if (!isStaleChunkError(error)) return;
    try {
      if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) return; // already tried once this session
      sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, "1");
    } catch {
      return; // sessionStorage unavailable — fall back to the manual button
    }
    window.location.reload();
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
