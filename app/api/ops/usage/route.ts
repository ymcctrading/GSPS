/**
 * GSPS — /api/ops/usage: the free-tier usage meter (lib/ops/usageLimits.ts,
 * migration 0133). Opened only by the scheduled jobs' secret.
 *
 * GET                       every meter's reading and hold.
 * GET ?gate=github_actions  `{ hold, reason }` for a CI job about to start.
 * GET ?gate=merge           `{ hold, reason }` before a merge to main: held
 *                           when GitHub Actions or Vercel deployments are.
 * GET ?check=1              reads every meter and sends the owner any
 *                           threshold alerts due (the hourly pg_cron job).
 * POST                      records a use: `{ meter, units, key, detail? }`,
 *                           from a CI job's last step or a reconciliation;
 *                           then sends that meter's alerts, so a crossing is
 *                           reported within the job that made it.
 *
 * While the repository is public, GitHub Actions minutes are free: a job's
 * report is kept with no units, and the gate and alerts skip that meter.
 *
 * Fails open: if the meter can't be read, nothing is held. Off every user's
 * path; the CI calls time out at 10 seconds.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { USAGE_METERS, meterBilled, type UsageMeterId } from "@/lib/ops/usageLimits";
import { meterStatus, recordUsage, repositoryVisibility, saveReading, sendDueAlerts } from "@/lib/ops/usageStore";

export const maxDuration = 30;

const NO_STORE = { "cache-control": "private, no-store" };
const ALL = Object.keys(USAGE_METERS) as UsageMeterId[];
const EVENT_METERS = new Set(["github_actions", "vercel_deployments"]);

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!isCronAuthorized(req.headers.get("authorization"))) return unauthorized();
  const service = createServiceClient();
  const now = new Date();
  const gate = req.nextUrl.searchParams.get("gate");

  if (gate === "github_actions") {
    const s = await meterStatus(service, "github_actions", now);
    return NextResponse.json({ hold: s.hold.hold, reason: s.hold.reason, percent: s.percent }, { headers: NO_STORE });
  }
  if (gate === "merge") {
    const [gh, vc] = await Promise.all([meterStatus(service, "github_actions", now), meterStatus(service, "vercel_deployments", now)]);
    const held = [gh, vc].filter((s) => s.hold.hold);
    return NextResponse.json(
      { hold: held.length > 0, reason: held.length > 0 ? held.map((s) => s.hold.reason).join(" ") : "Not held.", github: gh.percent, vercel: vc.percent },
      { headers: NO_STORE },
    );
  }
  if (gate) return NextResponse.json({ error: "unknown gate" }, { status: 400 });

  const statuses = await Promise.all(ALL.map((id) => meterStatus(service, id, now)));
  let alerts: Record<string, unknown> | undefined;
  if (req.nextUrl.searchParams.get("check") === "1") {
    alerts = {};
    for (const s of statuses) {
      await saveReading(service, s, now);
      alerts[s.meter] = await sendDueAlerts(service, s, now);
    }
  }
  return NextResponse.json({ at: now.toISOString(), meters: statuses, alerts }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!isCronAuthorized(req.headers.get("authorization"))) return unauthorized();
  let body: { meter?: unknown; units?: unknown; key?: unknown; detail?: unknown; occurredAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const meter = body.meter;
  const units = Number(body.units);
  const key = typeof body.key === "string" ? body.key.trim().slice(0, 200) : "";
  if (typeof meter !== "string" || !EVENT_METERS.has(meter)) return NextResponse.json({ error: "meter must be github_actions or vercel_deployments" }, { status: 400 });
  if (!Number.isFinite(units) || units < 0 || units > 100_000) return NextResponse.json({ error: "units must be a number from 0" }, { status: 400 });
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  const occurredAt = typeof body.occurredAt === "string" && Number.isFinite(Date.parse(body.occurredAt)) ? new Date(body.occurredAt) : undefined;
  const detail = body.detail && typeof body.detail === "object" ? (body.detail as Record<string, unknown>) : undefined;

  const service = createServiceClient();
  // A public repository's Actions minutes are free: kept as a record with no
  // units, so they never count if the repository turns private this month.
  const unbilled = meter === "github_actions" && !meterBilled("github_actions", await repositoryVisibility());
  const result = await recordUsage(service, {
    meter: meter as "github_actions" | "vercel_deployments",
    units: unbilled ? 0 : units,
    key,
    detail: unbilled ? { ...detail, unbilled: true, minutes: units } : detail,
    occurredAt,
  });
  if (result.error) return NextResponse.json({ recorded: false, error: result.error }, { status: 500 });
  const now = new Date();
  const status = await meterStatus(service, meter as UsageMeterId, now);
  await saveReading(service, status, now);
  const alerts = await sendDueAlerts(service, status, now);
  return NextResponse.json({ recorded: result.recorded, percent: status.percent, hold: status.hold.hold, alerts }, { headers: NO_STORE });
}
