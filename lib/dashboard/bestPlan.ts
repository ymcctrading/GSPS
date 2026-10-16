/**
 * "Today's plan" on the Novice dashboard: the one setup a newcomer is pointed
 * at first, so it has to be one the scan actually qualified.
 *
 * Until 2026-10-16 it was the highest *score* across both lists, Reject rows
 * included. A Reject keeps its score when a hold demotes it (the stop-breach
 * hold says so: "the analysis behind it is not what failed"), so a retired
 * plan could outrank every live one. NEE was shown as Today's plan while its
 * own page said the plan was retired.
 *
 * The filter follows the scorecard's own verdict rather than re-deriving one:
 * only Execute or Watch qualifies, Execute ahead of Watch, then by score. No
 * qualifying row means no plan, and the card says so.
 *
 * Three-question basis: 1. No new Gann rule; the verdict and its holds
 * (breakaway, stop breach) are Gann's and are read, not re-weighed. 2. No
 * periodicity claim. 3. Cause and Effect: the card names the setup the verdict
 * caused, not the one whose score happened to be highest.
 */

const STATE_RANK: Record<string, number> = { Execute: 0, Watch: 1 };

export function isQualifiedSetup(r: { outputState: string }): boolean {
  return r.outputState in STATE_RANK;
}

export function bestQualifiedSetup<T extends { outputState: string; score: number }>(rows: T[]): T | null {
  return (
    rows
      .filter(isQualifiedSetup)
      .sort((a, b) => STATE_RANK[a.outputState] - STATE_RANK[b.outputState] || b.score - a.score)[0] ?? null
  );
}
