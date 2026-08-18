import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const metric = searchParams.get("metric") || "summary"; // summary, pnl, patterns, equity
    const period = searchParams.get("period") || "90"; // days
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);

    const end = endDate ? new Date(endDate) : new Date();

    if (metric === "summary") {
      const { data, error } = await supabase.rpc("get_performance_metrics", {
        user_id: user.id,
        start_date: start.toISOString().split("T")[0],
        end_date: end.toISOString().split("T")[0],
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data);
    }

    if (metric === "pnl") {
      const period_type = searchParams.get("period_type") || "daily"; // daily, weekly, monthly
      const { data, error } = await supabase.rpc("get_pnl_by_period", {
        user_id: user.id,
        period: period_type,
        start_date: start.toISOString().split("T")[0],
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data);
    }

    if (metric === "patterns") {
      const { data, error } = await supabase.rpc(
        "get_performance_by_pattern",
        {
          user_id: user.id,
          start_date: start.toISOString().split("T")[0],
        }
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data);
    }

    if (metric === "equity") {
      const starting_capital = searchParams.get("starting_capital") || "10000";
      const { data, error } = await supabase.rpc("get_equity_curve", {
        user_id: user.id,
        starting_capital: parseFloat(starting_capital),
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data);
    }

    return NextResponse.json(
      { error: "Unknown metric" },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
