/**
 * GSPS — which mascot speaks for which step.
 *
 * Not decoration and not alternation. A bull expects prices to rise and a bear
 * expects them to fall; that is vocabulary a beginner will meet on every
 * finance site they ever open, and it is normally left to a glossary entry
 * nobody reads. Here the split does the teaching: Mrs. Bull brings the
 * opportunities, Mr. Bear brings the warnings, and after sixteen steps the
 * distinction has been demonstrated a dozen times without anyone being asked
 * to memorise it.
 *
 * That only works if the assignment is honest. A bear on an opportunity step
 * teaches the reader nothing, or worse, teaches them the opposite — so the
 * mapping below is by subject matter, and `onboarding-mascot.test.ts` asserts
 * that every step about risk, limits or losses belongs to Mr. Bear.
 */

import type { MascotName } from "@/components/onboarding/mascots";
import { TOUR_STEPS } from "./tour";

/**
 * Step id to speaker.
 *
 * Mr. Bear takes: the practice-money reassurance (protection), position sizing
 * (a limit), the confirmation step (a brake), automation (exits and trailing
 * stops protect a gain), Backtest (where losses are named as normal) and
 * Settings (the caps themselves). Mrs. Bull takes the rest — finding things,
 * reading them, and what to do next.
 */
const SPEAKERS: Record<string, MascotName> = {
  welcome: "bull",
  "meet-the-guides": "bull",
  "practice-money": "bear",
  "example-note": "bull",
  dashboard: "bull",
  guided: "bull",
  "guided-size": "bear",
  "guided-confirm": "bear",
  scanner: "bull",
  chart: "bull",
  levels: "bull",
  portfolio: "bull",
  automation: "bear",
  backtest: "bear",
  glossary: "bull",
  settings: "bear",
  finish: "bull",
};

/**
 * Who says this step.
 *
 * Falls back to Mrs. Bull for an id with no entry rather than throwing: a new
 * step should not be able to break the tour, and the test below fails the
 * build for the missing entry anyway. Silent-but-wrong is the right failure
 * here because the loud one costs a user their walkthrough.
 */
export function speakerFor(stepId: string): MascotName {
  return SPEAKERS[stepId] ?? "bull";
}

/** Every step id with an explicit speaker, for the coverage test. */
export function assignedStepIds(): string[] {
  return Object.keys(SPEAKERS);
}

/** Steps whose subject is risk, a limit, or a loss. Mr. Bear's, by definition. */
export const BEAR_SUBJECTS = [
  "practice-money",
  "guided-size",
  "guided-confirm",
  "automation",
  "backtest",
  "settings",
];

/** Sanity helper for the test: does every tour step have an assignment? */
export function unassignedSteps(): string[] {
  return TOUR_STEPS.filter((s) => !(s.id in SPEAKERS)).map((s) => s.id);
}
