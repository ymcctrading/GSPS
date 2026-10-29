/** ThemeWatcher keeps the theme and the browser bar current after the first paint. */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

const pathname = vi.hoisted(() => ({ value: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { ThemeWatcher } from "./theme-watcher";
import { forgetPageThemeChoice, saveThemeChoice, THEME_BAR_COLOR, THEME_STORAGE_KEY } from "@/lib/theme";

/** A matchMedia stand-in whose dark setting can be flipped and announced. */
function deviceMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(query));
  return (next: boolean) => {
    query.matches = next;
    listeners.forEach((l) => l());
  };
}

function bar(): string | null {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  forgetPageThemeChoice();
  document.documentElement.classList.remove("dark");
  document.head.innerHTML = "";
});

describe("ThemeWatcher", () => {
  it("follows the device when the choice is Match device, bar colour included", () => {
    const setDark = deviceMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "device");
    document.head.innerHTML = '<meta name="theme-color" content="#fafafa">';
    render(<ThemeWatcher />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    act(() => setDark(true));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(bar()).toBe(THEME_BAR_COLOR.dark);
  });

  it("reapplies after a navigation renders a fresh light theme-color meta", () => {
    deviceMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { rerender } = render(<ThemeWatcher />);
    document.head.innerHTML = '<meta name="theme-color" content="#fafafa">';
    pathname.value = "/portfolio";
    rerender(<ThemeWatcher />);
    expect(bar()).toBe(THEME_BAR_COLOR.dark);
  });

  it("follows another tab's change, and a cleared storage", () => {
    deviceMedia(false);
    saveThemeChoice("dark");
    render(<ThemeWatcher />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    window.localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
