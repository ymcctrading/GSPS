/**
 * `true` on a Vercel preview deployment. Shared by every trusted job and any
 * code path that could send a real external side effect (a notification, a
 * production-cost-amplifying scan) -- preview must never do either, per the
 * Phase 4/5 handoff's hard safety boundary. A single shared check means a
 * new call site can't forget it or reimplement it slightly differently.
 */
export function isPreviewEnvironment(): boolean {
  return process.env.VERCEL_ENV === "preview";
}
