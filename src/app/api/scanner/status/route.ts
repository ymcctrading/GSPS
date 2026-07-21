/**
 * GET /api/scanner/status
 * Returns the cached mean-reversion payload + a consumer-friendly status/message.
 * The dashboard polls this to render the loading state that replaces the old
 * developer-facing "…after the first cron run" string.
 */
import { NextResponse } from "next/server";
import { getScanState } from "@/lib/scanner/cache";

export async function GET() {
  const state = getScanState();
  return NextResponse.json({
    status: state.status,
    message: state.message,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    error: state.error,
    payload: state.payload,
  });
}
