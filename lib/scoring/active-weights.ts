/**
 * The weight set the live scan actually scores with.
 *
 * `lib/backtest/propose-weights.ts` writes proposals as **draft** rows in
 * `learning_models`. A draft changes nothing. Only when a human promotes one to
 * `live` — the governance path the learning schema was built for — does this
 * function start returning it, and from then on the score is one the market
 * voted on rather than one somebody assumed.
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

async function load(now: number): Promise<Cached> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = fetchLiveWeights(now).then((result) => {
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

    return { weights: parseCriterionWeights(stored), version: row.version, at: now };
  } catch {
    // No adopted weights is the safe reading of any failure here.
    return fallback;
  }
}
