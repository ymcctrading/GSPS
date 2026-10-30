/** The Appearance card: the choice is kept on the device and applied at once. */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ThemeSettings } from "./theme-settings";
import { forgetPageThemeChoice, THEME_STORAGE_KEY } from "@/lib/theme";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  forgetPageThemeChoice();
  document.documentElement.classList.remove("dark");
});

describe("ThemeSettings", () => {
  it("shows the stored choice, light by default", () => {
    render(<ThemeSettings />);
    expect(screen.getByRole("radio", { name: "Light" }).getAttribute("aria-checked")).toBe("true");
  });

  it("applies and keeps Dark, and Match device follows the device", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    render(<ThemeSettings />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    fireEvent.click(screen.getByRole("radio", { name: "Match device" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("device");
  });
});
