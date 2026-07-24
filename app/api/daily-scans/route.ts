import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface DailyScanRow {
  symbol: string;
  direction: "bullish" | "bearish";
  rank: number;
  score: number;
  output_state: string;
  entry: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  master_profit: number | null;
  scan_date: string;
  detail: { pattern?: { name?: string } | null } | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latest = searchParams.get("latest") === "1";

  try {
    const supabase = await createClient();

    // Get latest scan date
    const { data: latestData } = await supabase
      .from("daily_scans")
      .select("scan_date")
      .order("scan_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestData?.scan_date) {
      return NextResponse.json({ latest: null, bullish: [], bearish: [] });
    }

    if (!latest) {
      return NextResponse.json({ latest: latestData, bullish: [], bearish: [] });
    }

    // Get all results for latest scan date
    const { data: scanRows } = await supabase
      .from("daily_scans")
      .select("*")
      .eq("scan_date", latestData.scan_date)
      .order("rank");

    const rows = (scanRows ?? []) as DailyScanRow[];
    const bullish = rows.filter((r) => r.direction === "bullish");
    const bearish = rows.filter((r) => r.direction === "bearish");

    return NextResponse.json({
      latest: latestData,
      bullish,
      bearish,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
