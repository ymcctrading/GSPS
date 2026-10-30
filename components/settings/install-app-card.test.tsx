/** The "GSPS on your phone" card: one answer per device, from lib/pwa/install.ts. */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { InstallAppCard } from "./install-app-card";
import { holdInstallPrompt, type InstallPromptEvent } from "@/lib/pwa/installPrompt";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

function asDevice(userAgent: string, standalone = false) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: standalone }));
}

function heldPrompt(outcome: "accepted" | "dismissed") {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = { prompt, userChoice: Promise.resolve({ outcome }) } as unknown as InstallPromptEvent;
  act(() => holdInstallPrompt(event));
  return prompt;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  holdInstallPrompt(null);
});

describe("InstallAppCard", () => {
  it("gives an iPhone in Safari the Home Screen steps, since alerts need them", () => {
    asDevice(IPHONE);
    render(<InstallAppCard />);
    expect(screen.getByText(/Add to Home Screen, then Add/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Install GSPS" })).toBeNull();
  });

  it("says installed when opened from the home screen", () => {
    asDevice(IPHONE, true);
    render(<InstallAppCard />);
    expect(screen.getByText("Installed")).toBeTruthy();
  });

  it("shows the Install button once the browser's prompt is held, and uses it once on a double tap", async () => {
    asDevice(ANDROID);
    render(<InstallAppCard />);
    expect(screen.queryByRole("button", { name: "Install GSPS" })).toBeNull();
    const prompt = heldPrompt("dismissed");
    const button = screen.getByRole("button", { name: "Install GSPS" });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Install GSPS" })).toBeNull();
    expect(screen.getByText(/Not installed/)).toBeTruthy();
  });

  it("says installed after the member accepts, though the tab is not standalone", async () => {
    asDevice(ANDROID);
    render(<InstallAppCard />);
    heldPrompt("accepted");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install GSPS" }));
    });
    expect(screen.getByText("Installed")).toBeTruthy();
    expect(screen.queryByText(/browser's menu/)).toBeNull();
  });

  it("stays installed when appinstalled fires before the choice settles", async () => {
    asDevice(ANDROID);
    render(<InstallAppCard />);
    heldPrompt("accepted");
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.getByText("Installed")).toBeTruthy();
    expect(screen.queryByText(/browser's menu/)).toBeNull();
  });
});
