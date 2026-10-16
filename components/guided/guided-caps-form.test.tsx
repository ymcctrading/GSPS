/**
 * The Settings UI for Guided Mode's limits. Since 2026-10-16 (owner, Q12) the
 * risk percent is the only setting; Gann's capital rules are shown, not edited.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidedCapsForm } from "./guided-caps-form";
import { DEFAULT_GUIDED_CAPS } from "@/lib/guided/config";

function mockFetchOnce(caps = DEFAULT_GUIDED_CAPS) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ caps }) });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetchOnce());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GuidedCapsForm", () => {
  it("shows the capital rules as fixed, with no trade-count, deployed or budget fields", async () => {
    render(<GuidedCapsForm />);
    await waitFor(() => expect(screen.getByText("Capital rules")).toBeInTheDocument());
    expect(screen.getByText(/At most 5 stocks/)).toBeInTheDocument();
    expect(screen.queryByText(/dollar budget/)).not.toBeInTheDocument();
    expect(screen.queryByText(/per day/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
  });

  it("saves the risk percent alone", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchOnce();
    vi.stubGlobal("fetch", fetchMock);
    render(<GuidedCapsForm />);
    const input = await screen.findByDisplayValue(String(DEFAULT_GUIDED_CAPS.riskPct));
    await user.clear(input);
    await user.type(input, "0.5");
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ caps: { riskPct: 0.5 } }) });
    await user.click(screen.getByRole("button", { name: /Save limits/ }));
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === "PUT");
      expect(JSON.parse(putCall![1].body as string)).toEqual({ riskPct: 0.5 });
    });
  });
});
