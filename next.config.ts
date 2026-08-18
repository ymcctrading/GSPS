import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type errors fail the build. `main` has no branch-protection rule
  // requiring CI to pass before merge, so the Vercel build is the only
  // backstop standing between a type error and production — don't disable
  // it. The `eslint` key was removed in Next 16 and `next build` no longer
  // lints, so linting runs via `npm run lint` instead.
};

export default nextConfig;
