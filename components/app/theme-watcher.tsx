"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyTheme, forgetPageThemeChoice, readThemeChoice, resolveTheme, THEME_STORAGE_KEY } from "@/lib/theme";

function deviceDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function reapply() {
  applyTheme(resolveTheme(readThemeChoice(), deviceDark()));
}

/**
 * Keeps the theme current after the first paint (`lib/theme.ts`): when the
 * choice is "Match device" and the operating system switches, when another tab
 * changes or clears the choice, and after each navigation, since a route
 * renders its own theme-color meta with the light default.
 *
 * An open chart reads its text colour when it is drawn, so a live switch
 * reaches it on the next chart load.
 */
export function ThemeWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    reapply();
  }, [pathname]);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onStorage = (e: StorageEvent) => {
      // A null key is another tab clearing storage.
      if (e.key === THEME_STORAGE_KEY || e.key === null) {
        forgetPageThemeChoice();
        reapply();
      }
    };
    query?.addEventListener?.("change", reapply);
    window.addEventListener("storage", onStorage);
    return () => {
      query?.removeEventListener?.("change", reapply);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
