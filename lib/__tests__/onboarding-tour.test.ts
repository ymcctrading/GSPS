import { describe, it, expect } from "vitest";
import {
  tourReducer,
  shouldOfferTour,
  isLastStep,
  TOUR_STEPS,
  INITIAL_TOUR_STATE,
} from "@/lib/onboarding/tour";

describe("tourReducer", () => {
  it("starts inactive at step 0", () => {
    expect(INITIAL_TOUR_STATE).toEqual({ active: false, stepIndex: 0 });
  });

  it("start activates the tour at the first step", () => {
    const state = tourReducer(INITIAL_TOUR_STATE, { type: "start" });
    expect(state).toEqual({ active: true, stepIndex: 0 });
  });

  it("next advances through every step in order", () => {
    let state = tourReducer(INITIAL_TOUR_STATE, { type: "start" });
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      state = tourReducer(state, { type: "next" });
      expect(state).toEqual({ active: true, stepIndex: i });
    }
  });

  it("next on the final step ends the tour instead of overrunning", () => {
    let state = tourReducer(INITIAL_TOUR_STATE, { type: "start" });
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      state = tourReducer(state, { type: "next" });
    }
    expect(state.active).toBe(false);
  });

  it("prev never goes below step 0", () => {
    const state = tourReducer({ active: true, stepIndex: 0 }, { type: "prev" });
    expect(state).toEqual({ active: true, stepIndex: 0 });
  });

  it("close resets to the initial state", () => {
    const state = tourReducer({ active: true, stepIndex: 2 }, { type: "close" });
    expect(state).toEqual({ active: false, stepIndex: 0 });
  });

  it("next and prev are no-ops while inactive", () => {
    expect(tourReducer(INITIAL_TOUR_STATE, { type: "next" })).toEqual(INITIAL_TOUR_STATE);
    expect(tourReducer(INITIAL_TOUR_STATE, { type: "prev" })).toEqual(INITIAL_TOUR_STATE);
  });
});

describe("isLastStep", () => {
  it("is true only at the last index", () => {
    expect(isLastStep(TOUR_STEPS.length - 1)).toBe(true);
    expect(isLastStep(TOUR_STEPS.length - 2)).toBe(false);
    expect(isLastStep(0)).toBe(false);
  });
});

describe("shouldOfferTour", () => {
  it("offers the tour when there is no onboarding state yet", () => {
    expect(shouldOfferTour(null)).toBe(true);
    expect(shouldOfferTour(undefined)).toBe(true);
    expect(shouldOfferTour({})).toBe(true);
  });

  it("stops offering it once completed", () => {
    expect(shouldOfferTour({ tourCompleted: true })).toBe(false);
  });

  it("stops offering it once dismissed, even if not completed", () => {
    expect(shouldOfferTour({ tourDismissedAt: "2026-08-18T00:00:00.000Z" })).toBe(false);
  });
});
