"use client";

import { useEffect } from "react";
import { holdInstallPrompt, type InstallPromptEvent } from "@/lib/pwa/installPrompt";

/**
 * Registers `/sw.js` for every signed-in page, so the installed app has its
 * offline page whether or not push was ever turned on (Q3 item 1). The worker
 * answers a page request only when the network fails (`public/sw.js`), and
 * push still needs the member's own switch in Settings. Registering again is
 * a no-op, so the same call from the push toggle is harmless.
 *
 * Also holds the browser's install prompt for the Settings card
 * (`lib/pwa/installPrompt.ts`).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      holdInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}

