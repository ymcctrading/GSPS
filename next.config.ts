import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type errors fail the build. `main` has no branch-protection rule
  // requiring CI to pass before merge, so the Vercel build is the only
  // backstop standing between a type error and production — don't disable
  // it. The `eslint` key was removed in Next 16 and `next build` no longer
  // lints, so linting runs via `npm run lint` instead.

  // `lib/data/instrumentReference.ts` reads the 1.3 MB filings snapshot from
  // disk by a literal path, which file tracing would copy into every
  // function that imports the module. The deployed app reads the tables
  // through the service key and never needs the copy; only the GitHub
  // backtest workflow does, and it reads it from the checkout.
  outputFileTracingExcludes: {
    "/*": ["./lib/data/instrumentReferenceSnapshot.json"],
  },

  // The push service worker (public/sw.js) must never be served stale, or a
  // fix to it would wait on the browser's cache.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // The Backtest feature lives at /learning; /backtest is the name a
      // user familiar with the onboarding tour's own vocabulary would guess,
      // so keep old links/bookmarks from 404ing.
      {
        source: "/backtest",
        destination: "/learning",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
