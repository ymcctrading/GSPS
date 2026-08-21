/**
 * GSPS — whether a user has been shown the first-run tour.
 *
 * Stored in `settings.prefs.onboarding` rather than a dedicated column, for the
 * same reason the Guided caps live in `prefs`: this is a per-feature UI
 * preference, not something the engine has an opinion about, and a column per
 * dismissible thing is how a settings table turns into a junk drawer.
 *
 * It is *not* stored in `localStorage`, which is the obvious cheap option and
 * the wrong one here. The tour exists for people who are new to the product, and
 * new users are exactly the ones who sign in on a laptop, then pick up a phone,
 * then come back to the laptop. Browser-local state would re-interrupt them on
 * each new device with a tour they already finished, and would forget their
 * completion the first time they cleared a cache. Server-side, per-user, once.
 *
 * Reading is deliberately total: any shape at all, including a row that does not
 * exist yet, resolves to a valid status. A user whose prefs are missing or
 * malformed gets `seen: false` — offering the tour again to someone who has
 * seen it is a mild annoyance with a Skip button on it, while failing closed
 * would silently deny it to every genuinely new account.
 */

import { TOUR_VERSION } from "./tour";

export interface OnboardingStatus {
  /** Has this user been through the tour — finished or deliberately skipped? */
  seen: boolean;
  /** Which version of the step list they saw, or null if they never have. */
  version: number | null;
  /** When they finished or skipped it. ISO instant, or null. */
  seenAt: string | null;
  /** True if they dismissed it rather than reaching the last step. */
  skipped: boolean;
}

export const UNSEEN: OnboardingStatus = { seen: false, version: null, seenAt: null, skipped: false };

/** How a user left the tour. Both count as "seen" — neither re-prompts. */
export type TourOutcome = "completed" | "skipped";

/** Narrow whatever is in `prefs` down to a status, without ever throwing. */
export function resolveOnboarding(prefs: unknown): OnboardingStatus {
  if (typeof prefs !== "object" || prefs === null) return UNSEEN;
  const raw = (prefs as Record<string, unknown>).onboarding;
  if (typeof raw !== "object" || raw === null) return UNSEEN;

  const record = raw as Record<string, unknown>;
  // `seen` is derived from the timestamp rather than stored as its own flag:
  // two fields that can disagree about the same fact eventually will.
  const seenAt = typeof record.seenAt === "string" ? record.seenAt : null;
  if (!seenAt) return UNSEEN;

  return {
    seen: true,
    version: typeof record.version === "number" ? record.version : null,
    seenAt,
    skipped: record.skipped === true,
  };
}

/** The value to merge into `prefs.onboarding` when a user leaves the tour. */
export function onboardingRecord(outcome: TourOutcome, now = new Date()): Record<string, unknown> {
  return { version: TOUR_VERSION, seenAt: now.toISOString(), skipped: outcome === "skipped" };
}
