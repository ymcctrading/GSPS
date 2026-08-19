"use client";

/**
 * GSPS — when the first-run tour opens, and what happens when it closes.
 *
 * Mounted once in the app shell so a single overlay serves every page, and so
 * following a step's link navigates the app *underneath* the tour instead of
 * unmounting it. That is the whole reason the state lives up here rather than
 * inside a page.
 *
 * ## Auto-launching is a privilege, not a default
 *
 * Interrupting someone with a modal they did not ask for is a real cost, so it
 * happens under one condition only: the server says this account has never seen
 * the tour. Anything else — a request that failed, a signed-out visitor, a
 * database that did not answer — resolves to "seen", because the failure mode of
 * guessing wrong in that direction (a tour that quietly never appears, still
 * reachable from Settings) is much cheaper than the other one (a tour that
 * reappears over an order ticket every time the network hiccups).
 *
 * The status is recorded when the tour closes, whichever way it closed. It is
 * also recorded optimistically in local state before the request settles: a
 * user who finishes the tour and immediately loses connectivity should not have
 * it spring open again on their next click.
 */

import * as React from "react";
import { TourOverlay } from "@/components/onboarding/tour-overlay";
import type { OnboardingStatus, TourOutcome } from "@/lib/onboarding/status";

interface TourControls {
  /** Open the tour from the beginning. Used by the replay buttons. */
  startTour: () => void;
}

const TourContext = React.createContext<TourControls | null>(null);

/**
 * Read the controls. Returns a no-op outside the provider rather than throwing,
 * so a "Take the tour" button can be rendered in a test or a storybook-style
 * harness without dragging the whole shell in behind it.
 */
export function useTour(): TourControls {
  return React.useContext(TourContext) ?? { startTour: () => {} };
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  // Tracked so a replay from Settings does not re-trigger the auto-launch
  // check, and so the check itself only ever runs once per page load.
  const seenRef = React.useRef(true);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding")
      .then((res) => (res.ok ? (res.json() as Promise<OnboardingStatus>) : null))
      .then((status) => {
        if (cancelled || !status || status.seen) return;
        seenRef.current = false;
        setOpen(true);
      })
      .catch(() => {
        // Deliberately silent. See the note above on which way to guess.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const close = React.useCallback((outcome: TourOutcome) => {
    setOpen(false);
    seenRef.current = true;
    void fetch("/api/onboarding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    }).catch(() => {
      // The local flag above already stops it reopening in this session. A
      // failed write means it may auto-launch once more on the next visit,
      // which is a better outcome than surfacing a network error to someone
      // who has just been told what a stop loss is.
    });
  }, []);

  const startTour = React.useCallback(() => setOpen(true), []);
  const controls = React.useMemo(() => ({ startTour }), [startTour]);

  return (
    <TourContext.Provider value={controls}>
      {children}
      <TourOverlay open={open} onClose={close} />
    </TourContext.Provider>
  );
}

/**
 * The replay entry point, rendered in Settings and on `/welcome`.
 *
 * Styling is passed in rather than fixed, because the two callers want
 * different weights: Settings wants a quiet secondary control among other
 * settings, `/welcome` wants the primary action on the page.
 */
export function StartTourButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { startTour } = useTour();
  return (
    <button type="button" onClick={startTour} className={className}>
      {children}
    </button>
  );
}
