import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Historical performance query optimization/caching (BACKLOG.md). A user's
 * own analytics response — never a public/shared cache, which would leak
 * one user's trade history into another's via a CDN or proxy. `max-age=30`
 * lets a browser reuse the response across a quick re-render (e.g. the
 * dashboard mounting several metric cards in a row) without a redundant
 * round trip for data that only changes on a new closed trade, not on
 * every poll; `stale-while-revalidate` lets a slightly-stale response serve
 * instantly while a fresh one loads in the background rather than blocking.
 */
function cachedJson(data: unknown) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabase = createServiceClient();

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

      return cachedJson(data);
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

      return cachedJson(data);
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

      return cachedJson(data);
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

      return cachedJson(data);
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
