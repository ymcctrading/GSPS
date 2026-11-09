/**
 * GSPS — which build is serving.
 *
 * `/api/health` reports the commit and build time of the running build, so a
 * deploy can be checked against `main` from outside (the after-the-pause
 * runbook's `deploy` step, 2026-11-09). Before this the health answer looked
 * the same on every build, so the paused Oct 30 build passed a check meant
 * for the latest one.
 *
 * The two values are fixed when the app is built (`next.config.ts` `env`),
 * not read at run time:
 * - `GSPS_BUILD_COMMIT` comes from Vercel's `VERCEL_GIT_COMMIT_SHA`, or from
 *   `GIT_COMMIT_SHA`, which the Cloud Run image is built with
 *   (`Dockerfile`, `deploy-cloud-run.yml`). It is empty on a local build.
 * - `GSPS_BUILD_TIME` is the build's own clock, in UTC.
 *
 * Both are public by nature (the repository's commit ids and a timestamp),
 * so nothing confidential reaches the response.
 *
 * Three-question mandate: operational plumbing with no product-facing shape
 * (no member reads it), so it is exempt.
 */

export interface BuildInfo {
  /** The full 40-character commit id the build was made from, or null. */
  commit: string | null;
  /** When the build ran, ISO 8601 in UTC, or null. */
  builtAt: string | null;
}

const COMMIT_RE = /^[0-9a-f]{40}$/;

/**
 * Normalises the build-time values. Anything that isn't a full lowercase
 * commit id or a valid timestamp comes back as null, so a check comparing
 * `commit` against `main` fails closed instead of matching a placeholder.
 */
export function readBuildInfo(raw: {
  commit?: string | null;
  builtAt?: string | null;
}): BuildInfo {
  const commit = (raw.commit ?? "").trim().toLowerCase();
  const builtAtRaw = (raw.builtAt ?? "").trim();
  const ms = builtAtRaw ? Date.parse(builtAtRaw) : NaN;
  return {
    commit: COMMIT_RE.test(commit) ? commit : null,
    builtAt: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
  };
}
