/**
 * Light and dark (Q3 item 4, `docs/Q3_PLAN.md`). The dark palette has lived in
 * `app/globals.css` under `.dark` since the start, with nothing to switch it
 * on; this is the switch.
 *
 * Kept per device, in localStorage, not in the member's account: a phone read
 * at night and a desk screen read by day want different answers, and the
 * choice must apply before the first paint, which a stored preference read
 * over the network can't. Light is the default, as the site has always been;
 * "device" follows the operating system's setting.
 *
 * `THEME_SCRIPT` runs inline in the root layout's head, before the page
 * paints, so no page flashes light before turning dark. It sets the `.dark`
 * class and the browser bar's colour, and is the only code that reads the
 * stored choice before React does.
 *
 * Mandate: 1. No Gann content (display). 2. Dewey N/A. 3. Polarity: light and
 * dark as one palette's two poles, every token defined in both. Law of
 * Creation: a mixture, two palettes for one page.
 */

export type ThemeChoice = "light" | "dark" | "device";
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "gsps-theme";
export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark", "device"];

/** The browser bar's colour for each theme: each palette's own `--background`. */
export const THEME_BAR_COLOR: Record<Theme, string> = { light: "#fafafa", dark: "#0b1120" };

export function parseThemeChoice(raw: unknown): ThemeChoice {
  return raw === "dark" || raw === "device" ? raw : "light";
}

export function resolveTheme(choice: ThemeChoice, deviceDark: boolean): Theme {
  if (choice === "device") return deviceDark ? "dark" : "light";
  return choice;
}

/** Applies a theme to the document: the `.dark` class, color-scheme and the browser bar. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_BAR_COLOR[theme]));
}

// With storage blocked (some private modes), a choice holds for this page.
let pageChoice: ThemeChoice | null = null;

/**
 * Reads the choice; light when there is none. A choice made on this page wins
 * over storage, since some private modes read storage but refuse writes.
 */
export function readThemeChoice(): ThemeChoice {
  if (pageChoice) return pageChoice;
  try {
    return parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

/** Forgets this page's choice, so storage is read again (another tab changed it). */
export function forgetPageThemeChoice(): void {
  pageChoice = null;
}

export function saveThemeChoice(choice: ThemeChoice): void {
  pageChoice = choice;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked: `pageChoice` keeps it for this page only.
  }
}

/**
 * The same reading as `parseThemeChoice` + `resolveTheme` + `applyTheme`, as a
 * self-contained script string for the head (it runs before any module loads).
 * `theme.test.ts` runs it against the functions so the two can't drift.
 */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=c==="dark"||(c==="device"&&!!window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";var b=d?${JSON.stringify(THEME_BAR_COLOR.dark)}:${JSON.stringify(THEME_BAR_COLOR.light)};var f=function(){var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute("content",b);}};f();document.addEventListener("DOMContentLoaded",f);}catch(e){}})();`;
