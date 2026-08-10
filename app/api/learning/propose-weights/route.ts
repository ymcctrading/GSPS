/**
 * GSPS — /api/learning/propose-weights
 *
 * Replays a universe, splits it in time, and proposes a criterion weight set
 * from the factor attribution that survives out-of-sample. The proposal is
 * written as a **draft** `learning_models` row; it changes no score until a
 * human promotes it to `live`, which is the governance path migration 0005 was
 * built around.
 *
 * ## Why this is not in `vercel.json`
 *
 * The project is on the Vercel Hobby plan: two cron jobs, daily at most, and
 * both are already spent on `/api/market-scan` (see docs/THIRD_PARTY_LIMITS.md).
 * A replay is also O(bars × symbols) and holds the request open throughout —
 * `/api/backtest` documents exactly why it must not be scheduled there.
 *
 * So this is the endpoint an **external scheduler** calls, authorised with the
 * same `CRON_SECRET` the market scan uses. Weekly is the right cadence: a weight
 * proposal that moves faster than the out-of-sample half can refresh is fitting
 * noise, not learning.
 */

import { NextRequest, NextResponse } from "next/server";
import { collectRun, type Bucket } from "@/lib/backtest/run";
import { byOutputState } from "@/lib/backtest/replay";
import { proposeWeights } from "@/lib/backtest/propose-weights";
import { auditLogEntry, createModel, createLearningClient } from "@/lib/learning/db";
import { SCORE_WEIGHT_MODEL_TYPE } from "@/lib/scoring/active-weights";
import { verifyAuth } from "@/lib/auth";
import { isTimeframe } from "@/lib/timeframe";

/** Same ceiling as /api/backtest — past this the replay outlives the function. */
const MAX_SYMBOLS = 12;
const DEFAULT_UNIVERSE = ["SPY", "AAPL", "AMD", "TSLA", "MSFT", "NVDA"];

export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  // Either the scheduler's shared secret, or a signed-in operator running it by
  // hand from the dashboard.
  if (!authorized(req) && !(await verifyAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  const requested = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const universe = requested.length > 0 ? requested : DEFAULT_UNIVERSE;
  if (universe.length > MAX_SYMBOLS) {
    return NextResponse.json(
      { error: `Too many symbols (${universe.length}). Replay at most ${MAX_SYMBOLS} at a time.` },
      { status: 400 },
    );
  }

  const timeframe = searchParams.get("timeframe") ?? "15Min";
  if (!isTimeframe(timeframe)) {
    return NextResponse.json({ error: `Invalid timeframe '${timeframe}'` }, { status: 400 });
  }

  const targetRaw = searchParams.get("targetR");
  const targetR = targetRaw === null ? 2 : Number(targetRaw);
  if (!Number.isFinite(targetR) || targetR <= 0) {
    return NextResponse.json({ error: `Invalid targetR '${targetRaw}'` }, { status: 400 });
  }

  const within = (searchParams.get("within") ?? "Execute") as Bucket;
  const persist = searchParams.get("persist") !== "false";

  try {
    const run = await collectRun({ symbols: universe, timeframe, targetR });
    const trades = byOutputState(run.overall)[within].trades;
    const proposal = proposeWeights(trades);

    const slice = `${run.symbols.join(",")}|${run.window.from ?? "?"}:${run.window.to ?? "?"}|${within}`;

    // A proposal computed from synthetic bars describes a seeded random walk.
    // It is still returned — seeing the shape of the output is useful — but it
    // is never written, because a draft in the table is a candidate for
    // adoption and this one could never be a legitimate one.
    let stored: { id: string; version: number } | null = null;
    let notStored: string | null = null;

    if (!run.live) {
      notStored = `Bars came from the ${run.source} generator, not a market feed. Nothing was stored.`;
    } else if (!proposal.weights) {
      notStored = proposal.refusal;
    } else if (!proposal.changed) {
      notStored = "No criterion cleared the out-of-sample bar, so the current weights stand.";
    } else if (!persist) {
      notStored = "persist=false — the proposal was computed but not written.";
    } else {
      stored = await storeDraft({
        slice,
        sampleCount: proposal.inSampleTrades + proposal.outOfSampleTrades,
        proposal,
        run: { source: run.source, timeframe: run.timeframe, targetR: run.targetR },
      });
    }

    return NextResponse.json({
      source: run.source,
      live: run.live,
      timeframe: run.timeframe,
      targetR,
      within,
      symbols: run.symbols,
      skipped: run.skipped,
      window: run.window,
      proposal,
      stored,
      notStored,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

/**
 * Write the proposal as the next draft version.
 *
 * Version numbering reads the highest existing one rather than counting rows,
 * so a deleted draft does not cause a version to be reused — the audit log has
 * to be able to name a version and mean one thing by it.
 */
async function storeDraft(input: {
  slice: string;
  sampleCount: number;
  proposal: ReturnType<typeof proposeWeights>;
  run: { source: string; timeframe: string; targetR: number };
}): Promise<{ id: string; version: number }> {
  const { slice, sampleCount, proposal, run } = input;

  const { data } = await createLearningClient()
    .from("learning_models")
    .select("version")
    .eq("model_type", SCORE_WEIGHT_MODEL_TYPE)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = ((data as { version?: number } | null)?.version ?? 0) + 1;

  const model = await createModel({
    version,
    model_type: SCORE_WEIGHT_MODEL_TYPE,
    training_data_slice: slice,
    sample_count: sampleCount,
    training_metrics: {
      in_sample_trades: proposal.inSampleTrades,
      out_of_sample_trades: proposal.outOfSampleTrades,
      adopted: proposal.proposals.filter((p) => p.outcome === "adopted").length,
    },
    coefficients: {
      criterion_weights: proposal.weights,
      rationale: proposal.proposals,
      split_at: proposal.splitAt,
      replay: run,
    },
    constraints: {
      total_points: 9,
      min_weight: 0.5,
      max_weight: 2,
      requires_out_of_sample_agreement: true,
    },
    created_by: "propose-weights",
    change_reason: `Attribution over ${sampleCount} trades, split at ${proposal.splitAt ?? "n/a"}.`,
    status: "draft",
  });

  await auditLogEntry(
    model.id,
    "created",
    "propose-weights",
    undefined,
    { criterion_weights: proposal.weights },
    `Proposed from ${slice}. Draft — no score changes until it is promoted to live.`,
  );

  return { id: model.id, version };
}
