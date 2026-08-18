/**
 * Pure state for the first-run "Take the tour" walkthrough that teaches a new
 * user the real paper-trading flow on a symbol page: run the scan, read the
 * signal, place the entry, understand the exit, then review it afterward.
 *
 * Kept separate from the component (`components/guided/onboarding-tour.tsx`)
 * so the step sequencing can be unit-tested without a DOM.
 */

export interface TourStep {
  id: string;
  /** DOM id of the element this step points at (see the component for how it's highlighted). */
  targetId: string;
  title: string;
  body: string;
}

/**
 * Five steps per the Sprint 3 walkthrough breakdown: setup, signal, entry,
 * exit, review. There is no separate "Guided Decision Mode" feature in this
 * codebase to walk through — the real paper-trading on-ramp is this page (the
 * scan, the protocol signal, and the order ticket), so the tour points at
 * those elements directly.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "setup",
    targetId: "tour-setup",
    title: "1. Setup — the scan runs automatically",
    body: "Every symbol page runs the full structural scan the moment you land on it: trend, structural levels, and pattern triggers. Nothing to configure — just watch the price header and chart update as it comes in.",
  },
  {
    id: "signal",
    targetId: "tour-signal",
    title: "2. Signal — read the verdict",
    body: "The protocol signal card is the bottom line: a score out of 9, an Execute / Watch / Reject verdict, and — when one is armed — the pattern behind it. Expand \"What does this mean?\" under the pattern name for a plain-language explanation of that specific shape.",
  },
  {
    id: "entry",
    targetId: "tour-entry",
    title: "3. Entry — place a paper trade",
    body: "The order ticket defaults to the protocol's recommended entry, stop, and targets. \"At advised price\" waits for the exact entry line; \"Buy now\" fills at the current market price instead. Every order here routes to your paper account, so there's no real money on the line while you learn the flow.",
  },
  {
    id: "exit",
    targetId: "tour-exit",
    title: "4. Exit — know the plan before you click",
    body: "Attaching protocol levels doesn't mean one all-or-nothing bracket — it's a staged exit: most of the position off at TP1, part at the master target, and a runner behind a stop that ratchets to break-even. That plan is spelled out here before you submit, not after.",
  },
  {
    id: "review",
    targetId: "tour-review",
    title: "5. Review — check back afterward",
    body: "Once an order is placed, head to Portfolio to see it settle and to Backtest to see how the pattern that produced it has performed historically. Reviewing your trades against the signal that called them is how you build trust in the system over time.",
  },
] as const;

export interface TourState {
  active: boolean;
  stepIndex: number;
}

export const INITIAL_TOUR_STATE: TourState = { active: false, stepIndex: 0 };

export type TourAction =
  | { type: "start" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "close" };

/** Whether `close` following this action means the tour was completed (reached the end) vs. dismissed early. */
export function isLastStep(stepIndex: number): boolean {
  return stepIndex >= TOUR_STEPS.length - 1;
}

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "start":
      return { active: true, stepIndex: 0 };
    case "next":
      if (!state.active) return state;
      // Advancing past the last step ends the tour rather than looping or
      // going out of bounds — "Next" on the final card reads as "Done".
      return isLastStep(state.stepIndex)
        ? { active: false, stepIndex: 0 }
        : { active: true, stepIndex: state.stepIndex + 1 };
    case "prev":
      if (!state.active) return state;
      return { active: true, stepIndex: Math.max(0, state.stepIndex - 1) };
    case "close":
      return { active: false, stepIndex: 0 };
    default:
      return state;
  }
}

/** Per-user onboarding progress, persisted on `settings.prefs.onboarding`. */
export interface OnboardingPrefs {
  tourCompleted?: boolean;
  tourDismissedAt?: string;
}

/**
 * Whether the "Take the tour" entry point should still be offered. Once a
 * user has completed or explicitly dismissed it, it stays out of the way —
 * re-showing a finished tour on every visit is the failure mode this guards
 * against, not a gate on eligibility.
 */
export function shouldOfferTour(prefs: OnboardingPrefs | null | undefined): boolean {
  return !prefs?.tourCompleted && !prefs?.tourDismissedAt;
}
