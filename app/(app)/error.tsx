"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Page-level error boundary for the signed-in app. Before this existed the
 * only boundary was `app/global-error.tsx`, so one component throwing on one
 * ticker page (the 2026-09-28 order-ticket crash on a plan with no bar-sequence
 * pattern) replaced the entire app, nav included, and stayed that way across
 * navigation. Here the nav stays, moving to another page clears the error,
 * and the message is shown so a screenshot says what failed. Client errors
 * carry their real message; server errors arrive as a generic message plus a
 * digest that matches the server log line.
 */
export default function AppError({
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
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-lg font-semibold">This page hit an error</h1>
      <p className="text-sm text-muted">
        The rest of GSPS is still working. Try again, or pick another page from the menu.
      </p>
      <p className="break-words font-mono text-xs text-muted">
        {error.message}
        {error.digest ? ` (ref ${error.digest})` : ""}
      </p>
      <button
        onClick={() => unstable_retry()}
        className="min-h-9 cursor-pointer rounded-lg border border-border px-4 py-2 text-sm"
      >
        Try again
      </button>
    </div>
  );
}
