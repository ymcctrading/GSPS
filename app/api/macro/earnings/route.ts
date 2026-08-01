/**
 * GSPS — /api/macro/earnings?month=YYYY-MM
 * Mega-cap earnings releases for a calendar month. See lib/macro/earnings.ts
 * for how dates are derived — no live earnings feed is wired in yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateEarningsForMonth } from "@/lib/macro/earnings";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month"); // YYYY-MM
  const anchor = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
    ? new Date(`${monthParam}-01T00:00:00.000Z`)
    : new Date();

  const events = generateEarningsForMonth(anchor);
  return NextResponse.json({
    month: anchor.toISOString().slice(0, 7),
    events,
    simulated: true,
  });
}
