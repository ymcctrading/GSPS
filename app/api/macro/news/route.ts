/**
 * GSPS — /api/macro/news?days=14
 * Economic calendar / macro news feed, Forex-Factory-shaped (impact tier, date,
 * region, asset tags). See lib/macro/news.ts — no live news feed is wired in yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateNewsForRange } from "@/lib/macro/news";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(MAX_DAYS, Math.max(1, Number(searchParams.get("days")) || DEFAULT_DAYS));

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 1); // include "today" regardless of TZ rounding
  const to = new Date();
  to.setUTCDate(to.getUTCDate() + days);

  const events = generateNewsForRange(from, to);
  return NextResponse.json({ events, simulated: true });
}
