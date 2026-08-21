/**
 * The overlay's job is to be leaveable.
 *
 * It is the first thing a brand-new account sees, it covers the whole app, and
 * the person underneath it did not ask for it. So the assertions that matter
 * most here are not about spotlights or placement — they are about every exit
 * working: the Skip button, the close button, the Escape key, and reaching the
 * end. A tour someone cannot get out of is worse than no tour at all.
 *
 * The rest covers the two layout branches, because which one runs depends on
 * whether an anchor is on screen, and "no anchor" is a normal state rather than
 * an error (the Glossary link is absent from the phone tab bar by design).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TourOverlay } from "./tour-overlay";
import { TOUR_STEPS } from "@/lib/onboarding/tour";

// The overlay navigates to each step's page, so the router is part of the
// contract now rather than incidental. `push` is captured so a test can assert
// the tour actually took the reader somewhere.
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: (...args: unknown[]) => push(...args) }),
}));

const onClose = vi.fn();

beforeEach(() => {
  onClose.mockReset();
  push.mockReset();
});

/** Give one element a real rect, the way a laid-out browser would. */
function layOutAnchor(anchor: string, top = 12) {
  const el = document.createElement("a");
  el.setAttribute("data-tour", anchor);
  el.scrollIntoView = vi.fn();
  el.getBoundingClientRect = () =>
    ({ top, left: 40, width: 90, height: 32, bottom: top + 32, right: 130, x: 40, y: top, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** Walk to the step that points at a given anchor. */
async function advanceTo(user: ReturnType<typeof userEvent.setup>, anchor: string) {
  const index = TOUR_STEPS.findIndex((s) => s.anchor === anchor);
  expect(index).toBeGreaterThanOrEqual(0);
  for (let i = 0; i < index; i++) {
    await user.click(screen.getByRole("button", { name: /Next/ }));
  }
  return index;
}

describe("leaving the tour", () => {
  it("records a skip when the Skip button is used", async () => {
    const user = userEvent.setup();
    render(<TourOverlay open onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onClose).toHaveBeenCalledWith("skipped");
  });

  it("records a skip when the close button is used", async () => {
    const user = userEvent.setup();
    render(<TourOverlay open onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Leave the tour" }));
    expect(onClose).toHaveBeenCalledWith("skipped");
  });

  it("records a skip on Escape", async () => {
    const user = userEvent.setup();
    render(<TourOverlay open onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledWith("skipped");
  });

  it("records a completion only after the last step", async () => {
    const user = userEvent.setup();
    render(<TourOverlay open onClose={onClose} />);
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
      await user.click(screen.getByRole("button", { name: /Next/ }));
    }
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledWith("completed");
  });

  it("renders nothing at all when closed", () => {
    const { container } = render(<TourOverlay open={false} onClose={onClose} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("moving through the steps", () => {
  it("opens on the first step and counts honestly", () => {
    render(<TourOverlay open onClose={onClose} />);
    expect(screen.getByText(`Step 1 of ${TOUR_STEPS.length}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: TOUR_STEPS[0].title })).toBeInTheDocument();
  });

  it("cannot go back from the first step", () => {
    render(<TourOverlay open onClose={onClose} />);
    expect(screen.getByRole("button", { name: /Back/ })).toBeDisabled();
  });

  it("goes forward and back", async () => {
    const user = userEvent.setup();
    render(<TourOverlay open onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("heading", { name: TOUR_STEPS[1].title })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("heading", { name: TOUR_STEPS[0].title })).toBeInTheDocument();
  });

  it("moves on the arrow keys, for anyone not using a mouse", async () => {
    const user = userEvent.setup();
    render(<TourOverlay open onClose={onClose} />);
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("heading", { name: TOUR_STEPS[1].title })).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("heading", { name: TOUR_STEPS[0].title })).toBeInTheDocument();
  });

  it("restarts from the beginning rather than resuming", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TourOverlay open onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("heading", { name: TOUR_STEPS[1].title })).toBeInTheDocument();

    rerender(<TourOverlay open={false} onClose={onClose} />);
    rerender(<TourOverlay open onClose={onClose} />);
    expect(screen.getByRole("heading", { name: TOUR_STEPS[0].title })).toBeInTheDocument();
  });
});

describe("pointing at things", () => {
  it("keeps running when a step's anchor is not on the page", async () => {
    // Page sections load asynchronously — Guided runs a live scan, Settings
    // fetches its caps — so an anchor that is not in the DOM yet, or never
    // arrives, is the ordinary case rather than a bug. The step still has to
    // be readable.
    const user = userEvent.setup();
    const glossaryIndex = TOUR_STEPS.findIndex((s) => s.anchor === "glossary-terms");
    expect(glossaryIndex).toBeGreaterThan(0);

    render(<TourOverlay open onClose={onClose} />);
    for (let i = 0; i < glossaryIndex; i++) {
      await user.click(screen.getByRole("button", { name: /Next/ }));
    }
    expect(screen.getByRole("heading", { name: TOUR_STEPS[glossaryIndex].title })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("spotlights a laid-out anchor rather than a hidden duplicate of it", async () => {
    // A section can appear twice in the DOM across breakpoints, and only one
    // copy has a size at a time. The zero-size one must lose.
    const hidden = document.createElement("a");
    hidden.setAttribute("data-tour", "dash-setups");
    document.body.appendChild(hidden);
    const visible = layOutAnchor("dash-setups");

    const user = userEvent.setup();
    const dashboardIndex = TOUR_STEPS.findIndex((s) => s.anchor === "dash-setups");
    render(<TourOverlay open onClose={onClose} />);
    for (let i = 0; i < dashboardIndex; i++) {
      await user.click(screen.getByRole("button", { name: /Next/ }));
    }

    // The ring is positioned from the visible element's rect, padded.
    const ring = document.querySelector<HTMLElement>(".ring-accent");
    expect(ring).not.toBeNull();
    expect(ring!.style.top).toBe("6px"); // 12 top − 6 padding
    expect(ring!.style.left).toBe("34px"); // 40 left − 6 padding

    hidden.remove();
    visible.remove();
  });
});

describe("staying beside the hole on a small screen", () => {
  it("never covers the spotlit element, even when neither side has 300px clear", async () => {
    // The regression this exists for: a tall anchor on a phone-height viewport
    // — a dashboard section under a sticky header, say — routinely has less
    // than 300px clear on *both* sides at once. The old threshold made that
    // the trigger for dead-centring the card, which put it directly over the
    // element it was describing rather than beside it. Here: 120px above the
    // anchor, 120px below — neither clears 300, but "below" still has room to
    // spare over "above" (a tie goes to below), so that is where the card must
    // land, sized to fit rather than falling back to centre.
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 700, configurable: true });

    const el = layOutAnchor("dash-setups", 150);
    Object.defineProperty(el, "getBoundingClientRect", {
      value: () =>
        ({ top: 150, left: 20, width: 350, height: 400, bottom: 550, right: 370, x: 20, y: 150, toJSON: () => ({}) }) as DOMRect,
    });

    const user = userEvent.setup();
    const dashboardIndex = TOUR_STEPS.findIndex((s) => s.anchor === "dash-setups");
    render(<TourOverlay open onClose={onClose} />);
    for (let i = 0; i < dashboardIndex; i++) {
      await user.click(screen.getByRole("button", { name: /Next/ }));
    }

    const card = screen.getByRole("heading", { name: TOUR_STEPS[dashboardIndex].title }).closest("div[style]");
    expect(card).not.toBeNull();
    const style = (card as HTMLElement).style;
    // A centred card sets `transform`; a below/above one never does. This is
    // the exact distinction between the old fallback and the fix.
    expect(style.transform).toBe("");
    // 150 (rect.top) + 400 (rect.height) + 6 (hole padding) + 12 (gap) = 568.
    // Well clear of the hole, which ends at 556 (550 + 6 padding).
    expect(Number.parseFloat(style.top)).toBe(568);

    el.remove();
    Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: originalHeight, configurable: true });
  });
});

describe("taking the reader to the page", () => {
  it("navigates to the page a step is about", async () => {
    // The bug this whole change exists to fix: a step describing the Settings
    // limits while the Dashboard sat behind it.
    const user = userEvent.setup();
    const settingsIndex = TOUR_STEPS.findIndex((s) => s.route === "/settings");
    expect(settingsIndex).toBeGreaterThan(0);

    render(<TourOverlay open onClose={onClose} />);
    for (let i = 0; i < settingsIndex; i++) {
      await user.click(screen.getByRole("button", { name: /Next/ }));
    }
    expect(push).toHaveBeenCalledWith("/settings");
  });

  it("does not navigate away from a page it is already on", () => {
    // usePathname is mocked to /dashboard, and the opening step has no route,
    // so nothing should move. A tour that re-pushes the current route on every
    // render would fight the user's own scrolling.
    render(<TourOverlay open onClose={onClose} />);
    expect(push).not.toHaveBeenCalled();
  });

  it("gives every routed step a route that exists in the app", () => {
    const known = [
      "/dashboard", "/guided", "/scanner", "/portfolio",
      "/automation", "/learning", "/glossary", "/settings",
    ];
    for (const step of TOUR_STEPS) {
      if (step.route) expect(known).toContain(step.route);
    }
  });
});

describe("anchors below the fold", () => {
  it("scrolls to a section that starts off-screen, and spotlights it", async () => {
    // The regression this exists for: `resolveAnchor` used to reject any rect
    // outside the viewport. Page sections are normally below the fold when
    // their step opens, so rejecting them meant never resolving them, never
    // scrolling to them, and never pointing at them — every page-anchored step
    // silently became a centred bubble. Off-screen means "scroll to me".
    const user = userEvent.setup();
    const el = layOutAnchor("settings-caps", 4000);

    render(<TourOverlay open onClose={onClose} />);
    await advanceTo(user, "settings-caps");

    expect(el.scrollIntoView).toHaveBeenCalled();
    const ring = document.querySelector<HTMLElement>(".ring-accent");
    expect(ring, "an off-screen anchor must still be spotlit").not.toBeNull();
    el.remove();
  });

  it("scrolls the copy that is actually laid out, not the first in the DOM", async () => {
    // The ring measured the first laid-out element while the scroll grabbed
    // the first DOM match. Across breakpoints those are different elements,
    // and scrolling the hidden one moves nothing.
    const user = userEvent.setup();
    const hidden = document.createElement("div");
    hidden.setAttribute("data-tour", "settings-caps");
    hidden.scrollIntoView = vi.fn();
    document.body.appendChild(hidden);
    const visible = layOutAnchor("settings-caps", 3000);

    render(<TourOverlay open onClose={onClose} />);
    await advanceTo(user, "settings-caps");

    expect(visible.scrollIntoView).toHaveBeenCalled();
    expect(hidden.scrollIntoView).not.toHaveBeenCalled();
    hidden.remove();
    visible.remove();
  });
});

describe("what it tells a screen reader", () => {
  it("is a labelled modal dialog", () => {
    render(<TourOverlay open onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Introduction to GSPS");
  });
});
