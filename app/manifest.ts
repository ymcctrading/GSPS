/**
 * PWA manifest.
 *
 * Required for push on iOS specifically: Safari only grants
 * `Notification.requestPermission()` to a site the member has added to their
 * home screen, and it only offers that option for a site serving a manifest
 * with `display: "standalone"`. On Android and desktop Chrome push works
 * without this, so the manifest is the difference between "alerts reach an
 * iPhone" and "alerts reach everything but an iPhone".
 *
 * Deliberately minimal — this is not a bid to make GSPS feel like an
 * installed native app (the Q3 roadmap item is the real answer to that). It
 * declares the identity a notification shows under and nothing more.
 */

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GSPS",
    short_name: "GSPS",
    description: "Multi-timeframe market scanning with structural analysis and precision entry execution.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fafafa",
    // Matches the themeColor in app/layout.tsx — see that file's comment on
    // why a single light value is correct while the dark palette is
    // class-based rather than media-query-based.
    theme_color: "#fafafa",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
