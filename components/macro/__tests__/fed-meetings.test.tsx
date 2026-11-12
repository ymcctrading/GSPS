import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FedMeetingNotice, FedMeetingsCard } from "../fed-meetings";

afterEach(() => vi.useRealTimers());

describe("Fed meetings", () => {
  it("lists the next meetings with how far off each is", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-07T15:00:00Z"));
    render(<FedMeetingsCard />);
    expect(screen.getByText("Dec 8–9")).toBeTruthy();
    expect(screen.getByText("Tomorrow")).toBeTruthy();
    expect(screen.getAllByText("With projections").length).toBeGreaterThan(0);
  });

  it("shows the symbol-page note only in the week of a meeting", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-08T15:00:00Z"));
    const { container, unmount } = render(<FedMeetingNotice />);
    expect(container.textContent).toMatch(/Fed policy meeting Dec 8–9 \(under way\)/);
    unmount();
    vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
    const quiet = render(<FedMeetingNotice />);
    expect(quiet.container.textContent).toBe("");
  });
});
