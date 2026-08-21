import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type errors fail the build. `main` has no branch-protection rule
  // requiring CI to pass before merge, so the Vercel build is the only
  // backstop standing between a type error and production — don't disable
  // it. The `eslint` key was removed in Next 16 and `next build` no longer
  // lints, so linting runs via `npm run lint` instead.

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
