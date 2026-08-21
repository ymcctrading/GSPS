/**
 * Every picture in the tour has to admit it is old.
 *
 * The figures render stale data inside the app's own live-looking components,
 * which is the exact shape of an honest misunderstanding: a beginner sees a
 * green profit number in a familiar-looking card and concludes they own
 * something. The mitigation is that `SnapshotFrame` always draws the disclosure
 * and there is no prop to suppress it — so the test that matters is the one
 * that walks every figure the tour can ask for and checks the label is there,
 * including any figure added later.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SnapshotDisclosure, SnapshotFigure } from "./snapshot-figure";
import { SNAPSHOT_BADGE, SNAPSHOT_NOTICE, SNAPSHOT_GUIDED } from "@/lib/onboarding/tour-snapshot";
import { TOUR_STEPS, type TourFigure } from "@/lib/onboarding/tour";

/** Every figure the step list actually uses, so a new one is covered on arrival. */
const USED: TourFigure[] = [...new Set(TOUR_STEPS.map((s) => s.figure))];

describe("the not-live label", () => {
  it("is on every figure the tour renders", () => {
    for (const figure of USED.filter((f) => f !== "none")) {
      const { unmount } = render(<SnapshotFigure figure={figure} />);
      expect(screen.getByText(SNAPSHOT_BADGE), `figure "${figure}" is missing its badge`).toBeInTheDocument();
      expect(screen.getByText(SNAPSHOT_NOTICE), `figure "${figure}" is missing its disclosure`).toBeInTheDocument();
      unmount();
    }
  });

  it("names the date and says the real screens will differ", () => {
    render(<SnapshotDisclosure />);
    expect(screen.getByText(SNAPSHOT_NOTICE)).toBeInTheDocument();
    expect(SNAPSHOT_NOTICE).toMatch(/not live data/i);
    expect(SNAPSHOT_NOTICE).toMatch(/August 18, 2026/);
    expect(SNAPSHOT_NOTICE).toMatch(/look different/i);
  });

  it("covers more than one figure, so the loop above is not vacuous", () => {
    expect(USED.filter((f) => f !== "none").length).toBeGreaterThan(3);
  });
});

describe("figures", () => {
  it("renders nothing for the steps that deliberately have no picture", () => {
    const { container } = render(<SnapshotFigure figure="none" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("describes the chart to a screen reader instead of leaving it silent", () => {
    render(<SnapshotFigure figure="chart" />);
    const chart = screen.getByRole("img");
    expect(chart).toHaveAccessibleName(/F daily prices over 30 days/i);
    expect(chart).toHaveAccessibleName(/not live data/i);
  });

  it("shows the guided example's size and both dollar figures", () => {
    render(<SnapshotFigure figure="guided" />);
    expect(screen.getByText(`${SNAPSHOT_GUIDED.qty} shares`)).toBeInTheDocument();
    expect(screen.getByText(SNAPSHOT_GUIDED.riskRewardSentence)).toBeInTheDocument();
  });

  it("does not render a dead button a reader could try to press", () => {
    // The Guided example includes a picture of the real card's button. It is
    // deliberately not a <button>: a disabled control in a tutorial reads as
    // "broken", and an enabled one would be a lie.
    render(<SnapshotFigure figure="guided" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the account balances on the Portfolio figure", () => {
    // The practice-money step leans on this figure to prove the $100,000 is
    // play money, so the balances have to actually render.
    render(<SnapshotFigure figure="portfolio" />);
    expect(screen.getByText("Account value")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText(/practice money/i)).toBeInTheDocument();
    expect(screen.getByText(/no deposit was ever made/i)).toBeInTheDocument();
  });

  it("shows an exit ladder whose shares add up in front of the reader", () => {
    render(<SnapshotFigure figure="exits" />);
    expect(screen.getByText(/6 \+ 2 \+ 2 = 10/)).toBeInTheDocument();
  });
});
