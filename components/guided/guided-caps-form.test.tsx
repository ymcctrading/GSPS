/**
 * The Settings UI for Guided Mode's caps, including the per-trade dollar
 * budget field — the novice-facing control for the fix in
 * docs/GUIDED_DECISION_MODE.md ("Position sizing", ceiling 4).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidedCapsForm } from "./guided-caps-form";
import { DEFAULT_GUIDED_CAPS } from "@/lib/guided/config";

function mockFetchOnce(caps = DEFAULT_GUIDED_CAPS) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ caps }),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetchOnce());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GuidedCapsForm — per-trade budget", () => {
  it("loads checked and pre-filled with the shipped default ($250)", async () => {
    render(<GuidedCapsForm />);
    await waitFor(() => expect(screen.getByText("Cap each trade to a dollar budget")).toBeInTheDocument());

    const checkbox = screen.getByRole("checkbox", { name: /Cap each trade to a dollar budget/ });
    expect(checkbox).toBeChecked();
    expect(screen.getByDisplayValue("250")).toBeInTheDocument();
  });

  it("hides the dollar input and saves null when the cap is switched off", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchOnce();
    vi.stubGlobal("fetch", fetchMock);

    render(<GuidedCapsForm />);
    await waitFor(() => expect(screen.getByDisplayValue("250")).toBeInTheDocument());

    await user.click(screen.getByRole("checkbox", { name: /Cap each trade to a dollar budget/ }));
    expect(screen.queryByDisplayValue("250")).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ caps: { ...DEFAULT_GUIDED_CAPS, budgetUsd: null } }),
    });
    await user.click(screen.getByRole("button", { name: /Save limits/ }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === "PUT");
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall![1].body as string);
      expect(body.budgetUsd).toBeNull();
    });
  });

  it("saves a novice-range value the user types in", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchOnce();
    vi.stubGlobal("fetch", fetchMock);

    render(<GuidedCapsForm />);
    await waitFor(() => expect(screen.getByDisplayValue("250")).toBeInTheDocument());

    const input = screen.getByDisplayValue("250");
    await user.clear(input);
    await user.type(input, "75");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ caps: { ...DEFAULT_GUIDED_CAPS, budgetUsd: 75 } }),
    });
    await user.click(screen.getByRole("button", { name: /Save limits/ }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === "PUT");
      const body = JSON.parse(putCall![1].body as string);
      expect(body.budgetUsd).toBe(75);
    });
  });

  it("resets the budget field back to the default alongside every other cap", async () => {
    const user = userEvent.setup();
    render(<GuidedCapsForm />);
    await waitFor(() => expect(screen.getByDisplayValue("250")).toBeInTheDocument());

    const input = screen.getByDisplayValue("250");
    await user.clear(input);
    await user.type(input, "50");
    expect(screen.getByDisplayValue("50")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Reset to defaults/ }));
    expect(screen.getByDisplayValue("250")).toBeInTheDocument();
  });
});
