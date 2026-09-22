/**
 * The weight set the live scan actually scores with.
 *
 * `lib/backtest/propose-weights.ts` writes proposals as **draft** rows in
 * `learning_models`. A draft changes nothing. Only when a human promotes one to
 * `live` — the governance path the learning schema was built for — does this
 * function start returning it.
 *
 * **A promoted row silently outranks `DEFAULT_CRITERION_WEIGHTS`, with no
 * deploy and no diff.** That is the whole point of the governance path, and
 * also its hazard: a change to the default in the repo is invisible in
 * production while a live row exists. Check `learning_models` before
 * concluding anything about what the live scan scores with.
 *
 * What a promotion is *not*: a verdict from the market on which of Gann's
 * conditions matter more. AGENTS.md's "Gann-derived AND measured" gives
 * measurement a narrower job — verifying that our translation of a Gann rule
 * into code is faithful — and "The scorecard's role" explains why a non-equal
 * weight is a substantive claim the scorecard has no source for. A promoted
 * weight set should be correcting a translation, not ranking the criteria.
 *
 * Three properties this has to hold, because it sits in the path of every scan:
 *
 *   - **It never throws.** A scoring model that fails closed on a database
 *     hiccup would take the scanner down with it; an unreachable table means
 *     "no adopted weights", which is one point per criterion.
 *   - **It never blocks for long.** The lookup is cached for `CACHE_TTL_MS`,
 *     so a batch scan of 200 symbols makes one query, not 200.
 *   - **It is inert until configured.** With no service-role key there is no
 *     query at all, and the defaults are returned synchronously.
 */

import {
  CRITERION_KEYS,
  DEFAULT_CRITERION_WEIGHTS,
  parseCriterionWeights,
  type CriterionWeights,
} from "@/lib/scoring/weights";

/** Long enough that a batch scan makes one query; short enough that promoting a
 * model takes effect within a minute. */
export const CACHE_TTL_MS = 60_000;

export const SCORE_WEIGHT_MODEL_TYPE = "score_adjustment";

interface Cached {
  weights: CriterionWeights;
  /** Version of the live model these came from, or null when defaults. */
  version: number | null;
  at: number;
}

let cache: Cached | null = null;
let inflight: Promise<Cached> | null = null;

/** Test seam — drops the memo so a test can observe a fresh lookup. */
export function resetActiveWeightsCache(): void {
  cache = null;
  inflight = null;
}

export async function getActiveCriterionWeights(now = Date.now()): Promise<CriterionWeights> {
  return (await load(now)).weights;
}

/** The same lookup, with the provenance a caller may want to display. */
export async function getActiveWeightSet(
  now = Date.now(),
): Promise<{ weights: CriterionWeights; version: number | null }> {
  const { weights, version } = await load(now);
  return { weights, version };
}

/**
 * Is this stored weight set addressed to the scorecard we actually run?
 *
 * A promoted row is a statement about a specific set of criteria. Change
 * `CRITERION_KEYS` — retire one, add one — and the row is no longer about
 * this scorecard, but `parseCriterionWeights` cannot tell: it reads the keys
 * it recognises, ignores the ones it does not, and renormalises the remainder
 * to `TOTAL_POINTS`. The result is a well-formed weight set that nobody
 * proposed and nobody approved, and it is indistinguishable at the call site
 * from one that was.
 *
 * That is not hypothetical. The v1 `score_adjustment` row promoted on
 * 2026-09-16 was proposed against ten criteria including `adxTrendStrength`.
 * When that criterion was discarded hours later, the row kept being adopted —
 * its nine surviving weights silently rescaled into a distribution that had
 * never been measured or reviewed in that shape, still outranking the uniform
 * default the repo had just committed to. See AGENTS.md's "Gann-derived AND
 * measured" and `DEFAULT_CRITERION_WEIGHTS`'s doc comment.
 *
 * So the key set must match exactly. A row that does not is stale by
 * construction, and the safe reading of a stale proposal is no proposal:
 * re-run `lib/backtest/propose-weights.ts` against the current criteria and
 * promote the result deliberately.
 */
export function isWeightSetAddressedToCurrentCriteria(stored: unknown): boolean {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return false;
  const storedKeys = Object.keys(stored as Record<string, unknown>).sort();
  const currentKeys = [...CRITERION_KEYS].sort();
  return (
    storedKeys.length === currentKeys.length &&
    storedKeys.every((k, i) => k === currentKeys[i])
  );
}

async function load(now: number): Promise<Cached> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;

  // The `catch` is not belt-and-braces: without it a rejected lookup would be
  // memoised in `inflight` and handed to every subsequent caller forever, and
  // this sits in the path of every scan — one bad promise would take the
  // scanner down until the process restarted. `fetchLiveWeights` already
  // swallows its own failures, so this is the guard for anything it cannot see.
  inflight = fetchLiveWeights(now)
    .catch(() => ({ weights: DEFAULT_CRITERION_WEIGHTS, version: null, at: now }))
    .then((result) => {
      cache = result;
      inflight = null;
      return result;
    });
  return inflight;
}

async function fetchLiveWeights(now: number): Promise<Cached> {
  const fallback: Cached = { weights: DEFAULT_CRITERION_WEIGHTS, version: null, at: now };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fallback;
  }

  try {
    // Imported lazily so a scan in an environment with no learning schema — or
    // in a unit test — never pulls the Supabase client into the bundle.
    const { createLearningClient } = await import("@/lib/learning/db");
    const { data, error } = await createLearningClient()
      .from("learning_models")
      .select("version, coefficients")
      .eq("model_type", SCORE_WEIGHT_MODEL_TYPE)
      .eq("status", "live")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return fallback;

    const row = data as { version: number; coefficients: Record<string, unknown> | null };
    const stored = row.coefficients?.criterion_weights;
    if (!stored) return fallback;

    // A row proposed against a different criteria set is not a proposal about
    // this one — see `isWeightSetAddressedToCurrentCriteria` above. Fall back
    // rather than silently rescaling somebody's stale arithmetic into a
    // distribution they never approved, and say so loudly enough that the
    // promoted row gets re-derived rather than quietly ignored forever.
    if (!isWeightSetAddressedToCurrentCriteria(stored)) {
      console.warn(
        `[active-weights] Ignoring live ${SCORE_WEIGHT_MODEL_TYPE} v${row.version}: ` +
          `its criteria set does not match the current one. Re-run propose-weights ` +
          `and promote a fresh model. Scoring with the uniform default meanwhile.`,
      );
      return fallback;
    }

    return { weights: parseCriterionWeights(stored), version: row.version, at: now };
  } catch {
    // No adopted weights is the safe reading of any failure here.
    return fallback;
  }
}
