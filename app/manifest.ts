import type { MetadataRoute } from "next";

/**
 * The web app manifest (Q3 item 1, `docs/Q3_PLAN.md`): lets a phone install
 * GSPS on its home screen and open it as an app. On iPhone that is also what
 * makes push possible at all: Safari offers web push only to a site added to
 * the Home Screen with a manifest whose display is standalone (iOS 16.4+).
 *
 * Opens on the Dashboard; a visitor with no session is sent to sign in by the
 * proxy, as from any bookmark. Colours match the light surface, as the root
 * layout's `themeColor` does, since nothing switches the dark palette on yet.
 *
 * Mandate: 1. No Gann content (a delivery surface). 2. Dewey N/A. 3.
 * Correspondence: the installed app is the same site, the same plan and
 * verdict, with no phone-only reading. Law of Creation: a mixture, the site
 * and its home-screen shortcut.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GSPS",
    short_name: "GSPS",
    description: "Stock scanning, trade plans and alerts.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    categories: ["finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
