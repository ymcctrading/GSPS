/**
 * How this device can install GSPS on its home screen, and whether push can
 * reach it (Q3 item 1, `docs/Q3_PLAN.md`). Pure, so the Settings card and the
 * bell read one answer and the tests can feed it any browser.
 *
 * - Installed: opened from the home screen (display-mode standalone, or
 *   Safari's `navigator.standalone`). Nothing to install.
 * - iOS, not installed: Safari offers web push only to a site added to the
 *   Home Screen (iOS 16.4+), so the steps are Share, then Add to Home Screen,
 *   then open GSPS from there. Every iOS browser is Safari underneath, so this
 *   holds for Chrome on iPhone too.
 * - A browser that fired `beforeinstallprompt` (Chrome, Edge, Samsung on
 *   Android and desktop): an Install button.
 * - Anything else: the browser's own menu, named without promising a button.
 *
 * Mandate: 1. No Gann content (a delivery surface). 2. Dewey N/A. 3.
 * Correspondence: one site on every screen; installing changes how it opens,
 * never what it shows. Law of Creation: a mixture, not a creation.
 */

export type InstallState =
  | { kind: "installed" }
  | { kind: "ios_steps" }
  | { kind: "prompt" }
  | { kind: "browser_menu" };

export interface InstallInputs {
  userAgent: string;
  /** `navigator.maxTouchPoints`: iPadOS reports a Mac user agent with touch. */
  maxTouchPoints: number;
  /** matchMedia("(display-mode: standalone)") or Safari's navigator.standalone. */
  standalone: boolean;
  /** A `beforeinstallprompt` event is held and not yet used. */
  promptAvailable: boolean;
}

/** iPhone, iPod or iPad, including iPadOS's desktop-class user agent. */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function installState(i: InstallInputs): InstallState {
  if (i.standalone) return { kind: "installed" };
  if (isAppleMobile(i.userAgent, i.maxTouchPoints)) return { kind: "ios_steps" };
  if (i.promptAvailable) return { kind: "prompt" };
  return { kind: "browser_menu" };
}

/** Reads `standalone` from the browser; false outside one. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
}
