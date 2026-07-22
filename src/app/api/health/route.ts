/**
 * GET /api/health — lightweight liveness/readiness probe for Vercel & monitors.
 * Reports which data/brokerage modes are active so it's obvious at a glance that
 * a deployment is running in paper/simulation mode.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "gsps",
    phase: "0",
    marketDataProvider: process.env.GSPS_MARKET_DATA_PROVIDER ?? "mock",
    brokerageMode: process.env.GSPS_BROKERAGE_MODE ?? "paper",
    time: new Date().toISOString(),
  });
}
