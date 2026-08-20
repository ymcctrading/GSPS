/**
 * The behavioural half of the anti-Clippy rules.
 *
 * `onboarding-tips.test.ts` pins the state logic; this pins what actually
 * reaches the screen — above all that two tips never appear at once, which is
 * enforced by a module-level slot claim rather than by anyone remembering not
 * to mount two.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MascotTip, __resetTipSlot } from "./mascot-tip";
import { TIPS } from "@/lib/onboarding/tips";

const fetchMock = vi.fn();

beforeEach(() => {
  __resetTipSlot();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ enabled: true, dismissed: [] }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("showing a tip", () => {
  it("renders the mascot's explanation", async () => {
    render(<MascotTip id="stop-loss" />);
    expect(await screen.findByText(TIPS["stop-loss"].title)).toBeInTheDocument();
    expect(screen.getByText(TIPS["stop-loss"].body)).toBeInTheDocument();
  });

  it("announces politely rather than interrupting", async () => {
    // `status`, not `alert`. An assertive live region would cut across whatever
    // a screen-reader user is in the middle of — the audible version of Clippy
    // jumping in front of the document.
    render(<MascotTip id="stop-loss" />);
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("stays silent for a tip the user already dismissed", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, dismissed: ["stop-loss"] }),
    });
    render(<MascotTip id="stop-loss" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays silent when tips are switched off entirely", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false, dismissed: [] }),
    });
    render(<MascotTip id="stop-loss" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays silent when it cannot confirm its own state", async () => {
    // The user is mid-task. A hint is never worth guessing wrong here.
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<MascotTip id="stop-loss" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing for an unknown id instead of breaking the page", () => {
    const { container } = render(<MascotTip id="not-a-real-tip" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("never more than one at a time", () => {
  it("shows only the first tip when two are mounted together", async () => {
    render(
      <>
        <MascotTip id="stop-loss" />
        <MascotTip id="score-badge" />
      </>,
    );
    expect(await screen.findByText(TIPS["stop-loss"].title)).toBeInTheDocument();
    expect(screen.queryByText(TIPS["score-badge"].title)).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("hands the slot to the waiting tip once the first is dismissed", async () => {
    const user = userEvent.setup();
    render(
      <>
        <MascotTip id="stop-loss" />
        <MascotTip id="score-badge" />
      </>,
    );
    await screen.findByText(TIPS["stop-loss"].title);
    await user.click(screen.getByRole("button", { name: /Dismiss this tip/ }));
    expect(await screen.findByText(TIPS["score-badge"].title)).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("dismissing", () => {
  it("hides immediately and records in the background", async () => {
    const user = userEvent.setup();
    render(<MascotTip id="stop-loss" />);
    await screen.findByText(TIPS["stop-loss"].title);

    await user.click(screen.getByRole("button", { name: /Dismiss this tip/ }));
    expect(screen.queryByRole("status")).toBeNull();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/onboarding/tips",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ dismiss: "stop-loss" }) }),
      ),
    );
  });

  it("stays dismissed even if recording it fails", async () => {
    const user = userEvent.setup();
    render(<MascotTip id="stop-loss" />);
    await screen.findByText(TIPS["stop-loss"].title);

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: /Dismiss this tip/ }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("labels the dismiss control with which tip it closes", async () => {
    // "Close" alone tells a screen-reader user nothing about what they are
    // closing when the tip itself was never announced as a dialog.
    render(<MascotTip id="stop-loss" />);
    await screen.findByText(TIPS["stop-loss"].title);
    expect(
      screen.getByRole("button", { name: `Dismiss this tip about ${TIPS["stop-loss"].title}` }),
    ).toBeInTheDocument();
  });
});
